const { Pool } = require('pg');
require('dotenv').config();

if (!process.env.DATABASE_URL || process.env.DATABASE_URL.trim() === '') {
  throw new Error('DATABASE_URL environment variable is required.');
}

const pgPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 5000
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

// Auto-ensure required schema columns exist
(async () => {
  try {
    await pgPool.query('ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;');
  } catch (err) {
    console.error('Schema auto-patch note:', err.message);
  }
})();

module.exports = {
  query,
  getClient,
  pool: pgPool
};
