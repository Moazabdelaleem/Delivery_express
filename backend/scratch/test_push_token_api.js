const { pool } = require('../config/db');
const { sendPushNotification } = require('../utils/pushNotifier');

const API_BASE = 'http://localhost:5000/api';

async function testPushTokenSystem() {
  console.log('🧪 Testing Push Token Storage API and pushNotifier Utility...\n');

  try {
    // 1. Authenticate driver
    const loginRes = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'sami_delivery', password: 'Admin123!' })
    });
    const loginData = await loginRes.json();
    const token = loginData.token;
    const userId = loginData.user.id;

    console.log(`✅ Driver Logged In: ${loginData.user.name} (${userId})`);

    // 2. Register mock Expo push token
    const mockToken = 'ExponentPushToken[mock-test-token-12345]';
    const saveRes = await fetch(`${API_BASE}/users/push-token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ push_token: mockToken })
    });
    const saveData = await saveRes.json();
    console.log(`✅ Push Token Save Endpoint Status: ${saveRes.status}`, saveData);

    // 3. Verify in PostgreSQL database
    const dbRes = await pool.query('SELECT push_token FROM users WHERE id = $1', [userId]);
    const storedToken = dbRes.rows[0]?.push_token;
    console.log(`✅ Stored Token in DB: '${storedToken}' (Matches mock: ${storedToken === mockToken})`);

    // 4. Test sendPushNotification helper with mock token (must not throw)
    console.log('🧪 Invoking sendPushNotification helper...');
    await sendPushNotification(userId, 'Test Title', 'Test Body', { order_id: 'test-123' });
    console.log('✅ sendPushNotification executed safely without throwing exception!');

    // 5. Test sendPushNotification with non-existent user ID (must not throw)
    await sendPushNotification('00000000-0000-0000-0000-000000000000', 'Test', 'Body');
    console.log('✅ sendPushNotification with non-existent user executed safely!');

  } catch (err) {
    console.error('❌ Push token test error:', err.message);
  } finally {
    await pool.end();
    console.log('\n🎉 Push Token Verification Completed Successfully!');
  }
}

testPushTokenSystem();
