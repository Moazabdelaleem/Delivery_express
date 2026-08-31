const db = require('../config/db');

async function listDrivers() {
  const res = await db.query("SELECT id, username, name, role FROM users WHERE role = 'delivery_guy';");
  console.log('Driver Accounts in DB:', res.rows);
  process.exit(0);
}

listDrivers();
