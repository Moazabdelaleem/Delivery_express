const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const db = require('../config/db');

async function wipeAllOrders() {
  console.log('🧹 Wiping out all order data from PostgreSQL database...');
  try {
    await db.query('BEGIN;');
    await db.query('DELETE FROM order_payments;');
    await db.query('DELETE FROM returns;');
    await db.query('DELETE FROM order_attachments;');
    await db.query('DELETE FROM order_feedback;');
    await db.query('UPDATE pocket_expenses SET order_id = NULL;');
    await db.query('DELETE FROM pocket_expenses;');
    await db.query('DELETE FROM orders;');
    await db.query('UPDATE collection_wallets SET current_balance = 0;');
    await db.query('UPDATE pocket_wallets SET current_balance = 0;');
    await db.query('COMMIT;');
    console.log('✅ ALL ORDERS, PAYMENTS, RETURNS, ATTACHMENTS, AND WALLETS WIPED CLEANLY!');
  } catch (err) {
    await db.query('ROLLBACK;');
    console.error('🔥 Error wiping order data:', err.message);
  } finally {
    process.exit(0);
  }
}

wipeAllOrders();
