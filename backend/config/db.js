const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const DEFAULT_DATABASE_URL = 'postgresql://postgres.znyejjiyfulujtazukhu:Oahz3rbWb5fecImy@aws-0-eu-central-1.pooler.supabase.com:6543/postgres';

const connectionString = (process.env.DATABASE_URL && process.env.DATABASE_URL.trim() !== '')
  ? process.env.DATABASE_URL.trim()
  : DEFAULT_DATABASE_URL;

let pgPool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 15000
});

pgPool.on('error', (err) => {
  console.error('⚠️ PostgreSQL pool idle error:', err.message);
});

const query = async (text, params = []) => {
  return await pgPool.query(text, params);
};

const getClient = async () => {
  const client = await pgPool.connect();
  return client;
};

// Auto-ensure required schema columns, constraints, and performance indexes exist
(async () => {
  try {
    if (pgPool) {
      await pgPool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(50);');
      await pgPool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(255);');
      await pgPool.query('ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;');
      await pgPool.query('ALTER TABLE pocket_wallets DROP CONSTRAINT IF EXISTS pocket_wallets_current_balance_check;');
      await pgPool.query('ALTER TABLE pocket_expenses ADD COLUMN IF NOT EXISTS order_id UUID REFERENCES orders(id) ON DELETE SET NULL;');
      // Tracking number uniqueness
      await pgPool.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_tracking_number_unique ON orders (tracking_number);');
      // C3 Performance indexes — hot query paths
      await pgPool.query('CREATE INDEX IF NOT EXISTS idx_orders_delivery_guy ON orders(delivery_guy_id);');
      await pgPool.query('CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);');
      await pgPool.query('CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);');
      await pgPool.query('CREATE INDEX IF NOT EXISTS idx_orders_supervisor ON orders(supervisor_id);');
      await pgPool.query('CREATE INDEX IF NOT EXISTS idx_pocket_expenses_driver ON pocket_expenses(delivery_guy_id);');
      await pgPool.query('CREATE INDEX IF NOT EXISTS idx_order_payments_order ON order_payments(order_id);');
      await pgPool.query('CREATE INDEX IF NOT EXISTS idx_order_payments_recorded_by ON order_payments(recorded_by);');
      await pgPool.query('CREATE INDEX IF NOT EXISTS idx_order_payments_status ON order_payments(confirmation_status);');
      // Partial delivery lifecycle columns
      await pgPool.query('ALTER TABLE orders ADD COLUMN IF NOT EXISTS items_resolution VARCHAR(30) DEFAULT NULL;');
      await pgPool.query('ALTER TABLE orders ADD COLUMN IF NOT EXISTS followup_order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL;');
      await pgPool.query('ALTER TABLE returns ADD COLUMN IF NOT EXISTS inventory_vote VARCHAR(20) DEFAULT NULL;');
      await pgPool.query('ALTER TABLE returns ADD COLUMN IF NOT EXISTS supervisor_vote VARCHAR(20) DEFAULT NULL;');
      await pgPool.query('ALTER TABLE returns ADD COLUMN IF NOT EXISTS reassign_driver_id INTEGER REFERENCES users(id) ON DELETE SET NULL;');
      // Index for liable orders query
      await pgPool.query('CREATE INDEX IF NOT EXISTS idx_orders_items_resolution ON orders(items_resolution);');
    }
  } catch (err) {
    console.error('Schema auto-patch note:', err.message);
  }
})();



module.exports = {
  query,
  getClient,
  pool: pgPool
};
