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

    if (!pushToken || !ExpoClass || !ExpoClass.isExpoPushToken(pushToken)) {
      // User has not granted notification permission or token is missing/invalid
      return;
    }

    const messages = [{
      to: pushToken,
      sound: 'default',
      title: title || 'Delivery Express Alert',
      body: body || '',
      data: data || {}
    }];

    const chunks = expoInstance.chunkPushNotifications(messages);
    for (const chunk of chunks) {
      await expoInstance.sendPushNotificationsAsync(chunk);
    }
  } catch (err) {
    console.error(`⚠️ Push notification failed for user ${userId}:`, err.message);
  }
}

module.exports = {
  sendPushNotification
};
