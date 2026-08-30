const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

let pgPool = null;

if (process.env.DATABASE_URL && process.env.DATABASE_URL.trim() !== '') {
  pgPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000
  });

  pgPool.on('error', (err) => {
    console.error('⚠️ PostgreSQL pool idle error:', err.message);
  });
} else {
  console.warn('⚠️ DATABASE_URL environment variable is missing.');
}

const query = async (text, params = []) => {
  if (!pgPool) {
    throw new Error('DATABASE_URL environment variable is missing on server.');
  }
  return await pgPool.query(text, params);
};

const getClient = async () => {
  if (!pgPool) {
    throw new Error('DATABASE_URL environment variable is missing on server.');
  }
  const client = await pgPool.connect();
  return client;
};

// Auto-ensure required schema columns and constraints exist in non-production environments
if (process.env.NODE_ENV !== 'production') {
  (async () => {
    try {
      if (pgPool) {
        await pgPool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(50);');
        await pgPool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(255);');
        await pgPool.query('ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;');
        await pgPool.query('ALTER TABLE pocket_wallets DROP CONSTRAINT IF EXISTS pocket_wallets_current_balance_check;');
        await pgPool.query('ALTER TABLE pocket_expenses ADD COLUMN IF NOT EXISTS order_id UUID REFERENCES orders(id) ON DELETE SET NULL;');
        // Ensure tracking_number is unique (order number is the PK-equivalent identifier)
        await pgPool.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_tracking_number_unique ON orders (tracking_number);');
      }
    } catch (err) {
      console.error('Schema auto-patch note:', err.message);
    }
  })();
}



module.exports = {
  query,
  getClient,
  pool: pgPool
};
