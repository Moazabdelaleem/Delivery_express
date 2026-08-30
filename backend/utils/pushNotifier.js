const db = require('../config/db');

let expoInstance = null;
let ExpoClass = null;

async function getExpoInstance() {
  if (!expoInstance) {
    const mod = await import('expo-server-sdk');
    ExpoClass = mod.Expo || mod.default?.Expo || mod.default;
    expoInstance = new ExpoClass();
  }
  return { expo: expoInstance, Expo: ExpoClass };
}

/**
 * Best-effort helper to send mobile push notifications via Expo Push Service.
 * Wrapped in try/catch to ensure push failures NEVER break calling request logic.
 */
async function sendPushNotification(userId, title, body, data = {}) {
  if (!userId) return;

  try {
    const { expo, Expo } = await getExpoInstance();

    const userRes = await db.query(
      'SELECT push_token FROM users WHERE id = $1',
      [userId]
    );

    if (userRes.rows.length === 0) return;
    const pushToken = userRes.rows[0].push_token;

    if (!pushToken || !Expo || !Expo.isExpoPushToken(pushToken)) {
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

    const chunks = expo.chunkPushNotifications(messages);
    for (const chunk of chunks) {
      await expo.sendPushNotificationsAsync(chunk);
    }
  } catch (err) {
    console.error(`⚠️ Push notification failed for user ${userId}:`, err.message);
  }
}

module.exports = {
  sendPushNotification
};
