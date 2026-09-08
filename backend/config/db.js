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

const initSchema = async () => {
  if (!pgPool) return;
  const safeQuery = async (q) => {
    try { await pgPool.query(q); } catch (e) { /* ignore individual migration notes */ }
  };

  await safeQuery('ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(50);');
  await safeQuery('ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(255);');
  await safeQuery('ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;');
  await safeQuery('ALTER TABLE pocket_wallets DROP CONSTRAINT IF EXISTS pocket_wallets_current_balance_check;');
  await safeQuery('ALTER TABLE pocket_expenses ADD COLUMN IF NOT EXISTS order_id UUID REFERENCES orders(id) ON DELETE SET NULL;');
  await safeQuery('CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_tracking_number_unique ON orders (tracking_number);');

  await safeQuery('CREATE INDEX IF NOT EXISTS idx_orders_delivery_guy ON orders(delivery_guy_id);');
  await safeQuery('CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);');
  await safeQuery('CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);');
  await safeQuery('CREATE INDEX IF NOT EXISTS idx_orders_supervisor ON orders(supervisor_id);');
  await safeQuery('CREATE INDEX IF NOT EXISTS idx_pocket_expenses_driver ON pocket_expenses(delivery_guy_id);');
  await safeQuery('CREATE INDEX IF NOT EXISTS idx_order_payments_order ON order_payments(order_id);');
  await safeQuery('CREATE INDEX IF NOT EXISTS idx_order_payments_recorded_by ON order_payments(recorded_by);');
  await safeQuery('CREATE INDEX IF NOT EXISTS idx_order_payments_status ON order_payments(confirmation_status);');

  await safeQuery('ALTER TABLE orders ADD COLUMN IF NOT EXISTS items_resolution VARCHAR(30) DEFAULT NULL;');
  await safeQuery('ALTER TABLE orders ADD COLUMN IF NOT EXISTS followup_order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL;');
  await safeQuery('ALTER TABLE returns ADD COLUMN IF NOT EXISTS inventory_vote VARCHAR(20) DEFAULT NULL;');
  await safeQuery('ALTER TABLE returns ADD COLUMN IF NOT EXISTS supervisor_vote VARCHAR(20) DEFAULT NULL;');
  await safeQuery('ALTER TABLE returns ADD COLUMN IF NOT EXISTS reassign_driver_id UUID REFERENCES users(id) ON DELETE SET NULL;');
  await safeQuery('ALTER TABLE returns ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();');

  // Drop old status constraint to support new return lifecycle statuses (in_transit_back, awaiting_second_vote, vote_conflict, cancelled)
  await safeQuery('ALTER TABLE returns DROP CONSTRAINT IF EXISTS returns_status_check;');

  // Edge cases & liability settlement columns
  await safeQuery('ALTER TABLE returns ADD COLUMN IF NOT EXISTS damaged_missing_qty INT DEFAULT 0;');
  await safeQuery('ALTER TABLE returns ADD COLUMN IF NOT EXISTS condition_notes TEXT;');
  await safeQuery('ALTER TABLE returns ADD COLUMN IF NOT EXISTS manager_override_by UUID REFERENCES users(id) ON DELETE SET NULL;');
  await safeQuery('ALTER TABLE returns ADD COLUMN IF NOT EXISTS manager_override_at TIMESTAMPTZ;');
  await safeQuery('ALTER TABLE orders ADD COLUMN IF NOT EXISTS is_settled BOOLEAN DEFAULT FALSE;');
  await safeQuery('ALTER TABLE orders ADD COLUMN IF NOT EXISTS settlement_type VARCHAR(50);');
  await safeQuery('ALTER TABLE orders ADD COLUMN IF NOT EXISTS settlement_notes TEXT;');
  await safeQuery('ALTER TABLE orders ADD COLUMN IF NOT EXISTS settled_by UUID REFERENCES users(id) ON DELETE SET NULL;');
  await safeQuery('ALTER TABLE orders ADD COLUMN IF NOT EXISTS settled_at TIMESTAMPTZ;');
  await safeQuery('CREATE INDEX IF NOT EXISTS idx_orders_items_resolution ON orders(items_resolution);');
};

const schemaPromise = initSchema();

module.exports = {
  query,
  getClient,
  pool: pgPool,
  initSchema,
  schemaPromise
};
