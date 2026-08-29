const { pool } = require('../config/db');

async function seedScenarios() {
  try {
    console.log('Seeding fresh demo test orders for QA testing phase...');

    // Fetch driver sami_delivery and supervisor kareem_supervisor
    const driverRes = await pool.query("SELECT id FROM users WHERE username = 'sami_delivery' LIMIT 1;");
    const superRes = await pool.query("SELECT id FROM users WHERE username = 'kareem_supervisor' LIMIT 1;");

    if (driverRes.rows.length === 0 || superRes.rows.length === 0) {
      console.log('Demo accounts missing, please ensure DB users exist.');
      return;
    }

    const driverId = driverRes.rows[0].id;
    const supervisorId = superRes.rows[0].id;

    // Check columns on orders table
    const colRes = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'orders';");
    const cols = colRes.rows.map(r => r.column_name);

    // Clear old test orders
    await pool.query('DELETE FROM order_status_history;');
    await pool.query('DELETE FROM order_payments;');
    await pool.query('DELETE FROM order_attachments;');
    await pool.query('DELETE FROM order_feedback;');
    await pool.query('DELETE FROM returns;');
    await pool.query('UPDATE pocket_expenses SET order_id = NULL;');
    await pool.query('DELETE FROM orders;');

    const hasClientName = cols.includes('client_name');
    const hasClientPhone = cols.includes('client_phone');

    if (hasClientName && hasClientPhone) {
      await pool.query(`
        INSERT INTO orders (tracking_number, client_name, client_phone, client_address, order_details, order_amount, status, supervisor_id, delivery_guy_id, payment_type)
        VALUES ('DEMO-1001', 'Sherif Hassan', '01011112222', '24 El-Tahrir Sq, Downtown, Cairo', 'Electronics Package - 2 Items', 150.00, 'in_transit', $1, $2, 'pay_after_delivery');
      `, [supervisorId, driverId]);

      await pool.query(`
        INSERT INTO orders (tracking_number, client_name, client_phone, client_address, order_details, order_amount, status, supervisor_id, delivery_guy_id, payment_type)
        VALUES ('DEMO-1002', 'Nour El-Din', '01033334444', '15 Abbas El-Akkad, Nasr City, Cairo', 'Apparel & Shoes Box', 240.00, 'assigned', $1, $2, 'pay_after_delivery');
      `, [supervisorId, driverId]);
    } else {
      await pool.query(`
        INSERT INTO orders (tracking_number, client_address, order_details, order_amount, status, supervisor_id, delivery_guy_id, payment_type)
        VALUES ('DEMO-1001', '24 El-Tahrir Sq, Downtown, Cairo', 'Electronics Package - 2 Items', 150.00, 'in_transit', $1, $2, 'pay_after_delivery');
      `, [supervisorId, driverId]);

      await pool.query(`
        INSERT INTO orders (tracking_number, client_address, order_details, order_amount, status, supervisor_id, delivery_guy_id, payment_type)
        VALUES ('DEMO-1002', '15 Abbas El-Akkad, Nasr City, Cairo', 'Apparel & Shoes Box', 240.00, 'assigned', $1, $2, 'pay_after_delivery');
      `, [supervisorId, driverId]);
    }

    console.log('✅ Fresh scenario test orders seeded successfully!');
  } catch (err) {
    console.error('Error seeding scenarios:', err.message);
  } finally {
    await pool.end();
  }
}

seedScenarios();
