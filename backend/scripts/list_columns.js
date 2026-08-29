const db = require('../config/db');
db.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'orders' ORDER BY ordinal_position")
  .then(r => {
    console.log('ORDERS TABLE COLUMNS:', r.rows);
    process.exit(0);
  }).catch(err => {
    console.error('Error listing columns:', err);
    process.exit(1);
  });
