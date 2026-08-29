const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const db = require('../config/db');

async function resetDemoData() {
  console.log('🧹 Wiping test order data and resetting system state...');
  try {
    // 1. Delete dependent transactional data
    await db.query('DELETE FROM order_payments;');
    await db.query('DELETE FROM returns;');
    await db.query('DELETE FROM order_attachments;');
    await db.query('DELETE FROM driver_shifts;');
    await db.query('DELETE FROM order_feedback;');
    await db.query('DELETE FROM pocket_expenses;');
    await db.query('DELETE FROM wallet_transactions;');
    await db.query('DELETE FROM order_status_history;');

    // 2. Delete all orders
    await db.query('DELETE FROM orders;');
    console.log('  ✓ Cleared all orders, payments, returns, attachments, shifts, and audit logs.');

    // 3. Reset Collection & Pocket Wallets for all drivers
    await db.query('UPDATE collection_wallets SET current_balance = 0.00, updated_at = NOW();');
    await db.query('UPDATE pocket_wallets SET current_balance = 50.00, total_topped_up = 50.00, total_spent = 0.00, updated_at = NOW();');
    console.log('  ✓ Reset collection wallets to $0.00 and pocket allowances to $50.00 initial state.');

    // 4. Reset Driver online status to offline
    await db.query("UPDATE users SET online_status = 'offline', updated_at = NOW();");
    console.log('  ✓ Reset all driver online statuses to offline.');

    // 5. Verify demo user accounts preserved
    const userRes = await db.query('SELECT username, role FROM users ORDER BY role;');
    console.log(`  ✓ Preserved ${userRes.rows.length} demo accounts in database:`);
    userRes.rows.forEach(u => {
      console.log(`     • ${u.username} (${u.role})`);
    });

    console.log('\n======================================================================');
    console.log('✨ DATABASE REFRESH COMPLETE: Ready for a fresh delivery cycle test!');
    console.log('======================================================================');
  } catch (err) {
    console.error('❌ Data wipe error:', err);
  } finally {
    process.exit(0);
  }
}

resetDemoData();
