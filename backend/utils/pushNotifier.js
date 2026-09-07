const db = require('../config/db');

let ExpoClass = null;
let expoInstance = null;

try {
  const ExpoModule = require('expo-server-sdk');
  ExpoClass = ExpoModule.Expo || ExpoModule.default || ExpoModule;
  if (typeof ExpoClass === 'function') {
    expoInstance = new ExpoClass();
  }
} catch (err) {
  console.warn('⚠️ expo-server-sdk module failed to load:', err.message);
}

/**
 * Best-effort helper to send mobile push notifications via Expo Push Service.
 * Wrapped in try/catch to ensure push failures NEVER break calling request logic.
 */
async function sendPushNotification(userId, title, body, data = {}) {
  if (!userId) return;

  try {
    if (!expoInstance || !ExpoClass) return;

    const userRes = await db.query(
      'SELECT push_token FROM users WHERE id = $1',
      [userId]
    );

    if (userRes.rows.length === 0) return;
    const pushToken = userRes.rows[0].push_token;

    if (!pushToken || !ExpoClass.isExpoPushToken(pushToken)) return;

    const messages = [{
      to: pushToken,
      sound: 'default',
      title: title || 'Delivery Express Alert',
      body: body || '',
      data: data || {}
    }];

    const chunks = expoInstance.chunkPushNotifications(messages);
    for (const chunk of chunks) {
      const receipts = await expoInstance.sendPushNotificationsAsync(chunk);
      // Stale token cleanup — remove invalid tokens from DB
      for (const receipt of receipts) {
        if (receipt.status === 'error' && receipt.details?.error === 'DeviceNotRegistered') {
          await db.query('UPDATE users SET push_token = NULL WHERE id = $1', [userId]);
        }
      }
    }
  } catch (err) {
    console.error(`⚠️ Push notification failed for user ${userId}:`, err.message);
  }
}

/**
 * Send push notification to all active users of a given role.
 * Best-effort: failures are silently caught per-user.
 */
async function sendPushToRole(role, title, body, data = {}) {
  if (!role) return;

  try {
    if (!expoInstance || !ExpoClass) return;

    const usersRes = await db.query(
      `SELECT id, push_token FROM users
       WHERE role = $1 AND is_approved = true AND push_token IS NOT NULL`,
      [role]
    );

    const validTokenUsers = usersRes.rows.filter(u =>
      u.push_token && ExpoClass.isExpoPushToken(u.push_token)
    );

    if (validTokenUsers.length === 0) return;

    const messages = validTokenUsers.map(u => ({
      to: u.push_token,
      sound: 'default',
      title: title || 'Delivery Express Alert',
      body: body || '',
      data: data || {}
    }));

    const chunks = expoInstance.chunkPushNotifications(messages);
    for (const chunk of chunks) {
      const receipts = await expoInstance.sendPushNotificationsAsync(chunk);
      // Stale token cleanup
      for (let i = 0; i < receipts.length; i++) {
        if (receipts[i]?.status === 'error' && receipts[i]?.details?.error === 'DeviceNotRegistered') {
          const userId = validTokenUsers[i]?.id;
          if (userId) await db.query('UPDATE users SET push_token = NULL WHERE id = $1', [userId]);
        }
      }
    }
  } catch (err) {
    console.error(`⚠️ Role push notification failed for role '${role}':`, err.message);
  }
}

module.exports = {
  sendPushNotification,
  sendPushToRole
};
