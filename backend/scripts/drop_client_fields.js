const db = require('../config/db');

async function dropClientFields() {
  console.log('✂️ Dropping client_name and client_phone columns from orders table...');
  try {
    await db.query('ALTER TABLE orders DROP COLUMN IF EXISTS client_name;');
    console.log('  ✅ Dropped column: client_name');

    await db.query('ALTER TABLE orders DROP COLUMN IF EXISTS client_phone;');
    console.log('  ✅ Dropped column: client_phone');

    console.log('🎉 CLIENT COLUMNS SUCCESSFULLY DROPPED FROM DATABASE!');
  } catch (err) {
    console.error('❌ Error dropping columns:', err.message);
  } finally {
    process.exit(0);
  }
}

dropClientFields();
