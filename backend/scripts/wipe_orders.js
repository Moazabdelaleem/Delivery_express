const { pool } = require('../config/db');

async function wipeOrders() {
  try {
    console.log('Beginning order data wipe...');
    await pool.query('DELETE FROM order_status_history;');
    await pool.query('DELETE FROM order_payments;');
    await pool.query('DELETE FROM order_attachments;');
    await pool.query('DELETE FROM order_feedback;');
    await pool.query('DELETE FROM returns;');
    await pool.query('UPDATE pocket_expenses SET order_id = NULL;');
    await pool.query('DELETE FROM orders;');
    console.log('✅ All order data wiped successfully from database!');
  } catch (err) {
    console.error('Error wiping order data:', err.message);
  } finally {
    await pool.end();
  }
}

wipeOrders();
