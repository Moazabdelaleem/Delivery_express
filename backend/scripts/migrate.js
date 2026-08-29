const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const db = require('../config/db');

async function runMigrations() {
  console.log('🔄 Running database schema migrations...');
  try {
    await db.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(50);');
    await db.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(255);');
    await db.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS push_token TEXT;');
    await db.query('ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;');
    await db.query("ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_type VARCHAR(30) DEFAULT 'pay_after_delivery';");
    await db.query('ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_outcome VARCHAR(30);');
    await db.query('ALTER TABLE orders ADD COLUMN IF NOT EXISTS collection_outcome VARCHAR(30);');
    await db.query('ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivered_items_amount NUMERIC(10,2) DEFAULT 0.00;');
    await db.query('ALTER TABLE orders ADD COLUMN IF NOT EXISTS returned_items_amount NUMERIC(10,2) DEFAULT 0.00;');
    await db.query('ALTER TABLE orders ADD COLUMN IF NOT EXISTS returned_quantity INT DEFAULT 0;');
    await db.query('ALTER TABLE orders ADD COLUMN IF NOT EXISTS return_notes TEXT;');
    await db.query('ALTER TABLE pocket_wallets DROP CONSTRAINT IF EXISTS pocket_wallets_current_balance_check;');
    await db.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_tracking_number_unique ON orders (tracking_number);');
    // Schema cleanup: drop redundant legacy columns
    await db.query('ALTER TABLE orders DROP COLUMN IF EXISTS cash_collected;');
    await db.query('ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_payment_type_check;');
    await db.query("ALTER TABLE orders ADD CONSTRAINT orders_payment_type_check CHECK (payment_type IN ('full_upfront', 'pay_after_delivery', 'accounts_payable', 'installments', 'other'));");

    await db.query(`
      CREATE TABLE IF NOT EXISTS order_payments (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        amount NUMERIC(10,2) NOT NULL CHECK (amount > 0),
        payment_method VARCHAR(30) NOT NULL CHECK (payment_method IN ('cash', 'e_wallet', 'instapay', 'vodafone_cash', 'other')),
        recorded_by UUID NOT NULL REFERENCES users(id),
        paid_at TIMESTAMPTZ DEFAULT NOW(),
        confirmation_status VARCHAR(30) NOT NULL DEFAULT 'pending_finance_review' CHECK (confirmation_status IN ('pending_finance_review', 'confirmed', 'rejected')),
        confirmed_by UUID REFERENCES users(id),
        confirmed_at TIMESTAMPTZ,
        proof_attachment_id UUID DEFAULT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    await db.query(`
      CREATE TABLE IF NOT EXISTS returns (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        initiated_by UUID NOT NULL REFERENCES users(id),
        return_type VARCHAR(20) NOT NULL CHECK (return_type IN ('full', 'partial')),
        reason TEXT NOT NULL,
        status VARCHAR(30) NOT NULL DEFAULT 'pending_verification' CHECK (status IN ('pending_pickup', 'pending_verification', 'verified', 'rejected')),
        returned_items_amount NUMERIC(10,2) DEFAULT 0.00,
        returned_quantity INT DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        verified_by UUID REFERENCES users(id),
        verified_at TIMESTAMPTZ
      );
    `);
    await db.query(`
      CREATE TABLE IF NOT EXISTS order_attachments (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        stage VARCHAR(40) NOT NULL CHECK (stage IN (
          'inventory_handoff',
          'customer_delivery',
          'third_party_order',
          'payment_confirmation',
          'return_verification'
        )),
        uploaded_by UUID NOT NULL REFERENCES users(id),
        is_required BOOLEAN NOT NULL DEFAULT false,
        storage_url TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    await db.query('CREATE INDEX IF NOT EXISTS idx_order_attachments_order_id ON order_attachments(order_id);');
    await db.query('CREATE INDEX IF NOT EXISTS idx_order_attachments_stage ON order_attachments(stage);');

    await db.query(`
      CREATE TABLE IF NOT EXISTS driver_shifts (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        delivery_guy_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        clock_in_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        clock_out_at TIMESTAMPTZ,
        clock_in_lat NUMERIC(10,8),
        clock_in_lng NUMERIC(11,8),
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    await db.query('CREATE INDEX IF NOT EXISTS idx_driver_shifts_delivery_guy ON driver_shifts(delivery_guy_id);');
    await db.query('CREATE INDEX IF NOT EXISTS idx_driver_shifts_clock_in_at ON driver_shifts(clock_in_at);');

    await db.query(`
      CREATE TABLE IF NOT EXISTS order_feedback (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        audio_storage_url TEXT NOT NULL,
        duration_seconds INT NOT NULL DEFAULT 0,
        recorded_at TIMESTAMPTZ DEFAULT NOW(),
        recorded_by UUID NOT NULL REFERENCES users(id),
        transcription TEXT DEFAULT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    await db.query('CREATE INDEX IF NOT EXISTS idx_order_feedback_order_id ON order_feedback(order_id);');
    await db.query('CREATE INDEX IF NOT EXISTS idx_order_feedback_recorded_by ON order_feedback(recorded_by);');

    await db.query('CREATE INDEX IF NOT EXISTS idx_returns_order_id ON returns(order_id);');
    await db.query('CREATE INDEX IF NOT EXISTS idx_returns_status ON returns(status);');
    await db.query('CREATE INDEX IF NOT EXISTS idx_returns_initiated_by ON returns(initiated_by);');

    console.log('✅ Database schema migrations completed successfully.');
  } catch (err) {
    console.error('❌ Database schema migration error:', err.message);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

runMigrations();
