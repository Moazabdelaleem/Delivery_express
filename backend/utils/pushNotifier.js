const { Expo } = require('expo-server-sdk');
const db = require('../config/db');

// Initialize Expo SDK client
const expo = new Expo();

/**
 * Best-effort helper to send mobile push notifications via Expo Push Service.
 * Wrapped in try/catch to ensure push failures NEVER break calling request logic.
 */
async function sendPushNotification(userId, title, body, data = {}) {
  if (!userId) return;

  try {
    const userRes = await db.query(
      'SELECT push_token FROM users WHERE id = $1',
      [userId]
    );

    if (userRes.rows.length === 0) return;
    const pushToken = userRes.rows[0].push_token;

    if (!pushToken || !Expo.isExpoPushToken(pushToken)) {
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
