-- ============================================================
-- Enterprise Delivery Application Database Schema
-- PostgreSQL / Supabase
-- v1 MVP: audit_logs removed; wallet_transactions + order_status_history cover the audit trail.
-- ============================================================

-- Drop audit_logs if it exists from a previous schema run
DROP TABLE IF EXISTS audit_logs CASCADE;

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. USERS TABLE
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  username VARCHAR(100) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(255) UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(30) NOT NULL CHECK (role IN ('delivery_guy', 'supervisor', 'inventory', 'finance', 'manager')),
  online_status VARCHAR(20) DEFAULT 'offline' CHECK (online_status IN ('online', 'offline')),
  phone VARCHAR(50),
  is_approved BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. ORDERS TABLE
CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tracking_number VARCHAR(50) UNIQUE NOT NULL,
  client_name VARCHAR(100) NOT NULL,
  client_phone VARCHAR(50) NOT NULL,
  client_address TEXT NOT NULL,
  order_details TEXT NOT NULL,
  order_amount NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  status VARCHAR(35) DEFAULT 'created' CHECK (status IN (
    'created',
    'assigned',
    'notified_inventory',
    'handed_to_delivery',
    'pickup_failed',
    'in_transit',
    'delivered',
    'delivery_failed',
    'returned_to_company',
    'cash_cleared'
  )),
  supervisor_id UUID REFERENCES users(id),
  delivery_guy_id UUID REFERENCES users(id),
  inventory_handoff_by UUID REFERENCES users(id),
  inventory_note TEXT,
  delivery_failure_reason TEXT,
  payment_type VARCHAR(30) DEFAULT 'pay_after_delivery' CHECK (payment_type IN ('full_upfront', 'pay_after_delivery', 'accounts_payable', 'other')),
  delivery_outcome VARCHAR(30) CHECK (delivery_outcome IN ('full', 'partial', 'none', 'shipped_3rd_party', 'not_shipped')),
  collection_outcome VARCHAR(30) CHECK (collection_outcome IN ('cash_full', 'cash_partial', 'transfer_full', 'transfer_partial', 'none', 'shipping_fee_only')),
  delivered_items_amount NUMERIC(10,2) DEFAULT 0.00,
  returned_items_amount NUMERIC(10,2) DEFAULT 0.00,
  returned_quantity INT DEFAULT 0,
  return_notes TEXT,
  cash_collected NUMERIC(10,2) DEFAULT 0.00,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  delivered_at TIMESTAMPTZ
);

-- 2b. ORDER PAYMENTS TABLE
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

-- 3. COLLECTION WALLETS (Cash received by delivery guys)
CREATE TABLE IF NOT EXISTS collection_wallets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  delivery_guy_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  current_balance NUMERIC(10,2) NOT NULL DEFAULT 0.00 CHECK (current_balance >= 0),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. POCKET MONEY WALLETS (Pocket cash for delivery expenses)
CREATE TABLE IF NOT EXISTS pocket_wallets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  delivery_guy_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  current_balance NUMERIC(10,2) NOT NULL DEFAULT 0.00 CHECK (current_balance >= 0),
  total_topped_up NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  total_spent NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. POCKET EXPENSES (Itemized spending with mandatory reasons)
CREATE TABLE IF NOT EXISTS pocket_expenses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pocket_wallet_id UUID NOT NULL REFERENCES pocket_wallets(id) ON DELETE CASCADE,
  delivery_guy_id UUID NOT NULL REFERENCES users(id),
  amount NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. WALLET TRANSACTIONS AUDIT LOG
CREATE TABLE IF NOT EXISTS wallet_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  wallet_type VARCHAR(20) NOT NULL CHECK (wallet_type IN ('collection', 'pocket')),
  delivery_guy_id UUID NOT NULL REFERENCES users(id),
  transaction_type VARCHAR(30) NOT NULL CHECK (transaction_type IN ('cash_collected', 'finance_cash_pullout', 'finance_topup', 'pocket_expense')),
  amount NUMERIC(10,2) NOT NULL,
  balance_after NUMERIC(10,2) NOT NULL,
  performed_by UUID NOT NULL REFERENCES users(id),
  notes_or_reason TEXT,
  related_order_id UUID REFERENCES orders(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. ORDER STATUS HISTORY
CREATE TABLE IF NOT EXISTS order_status_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  old_status VARCHAR(35),
  new_status VARCHAR(35) NOT NULL,
  changed_by UUID NOT NULL REFERENCES users(id),
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. ORDER RETURNS TABLE
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

-- 9. ORDER ATTACHMENTS TABLE
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

-- 10. DRIVER SHIFTS TABLE
CREATE TABLE IF NOT EXISTS driver_shifts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  delivery_guy_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  clock_in_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  clock_out_at TIMESTAMPTZ,
  clock_in_lat NUMERIC(10,8),
  clock_in_lng NUMERIC(11,8),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 11. ORDER CUSTOMER VOICE FEEDBACK TABLE
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

-- INDEXES
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_delivery_guy ON orders(delivery_guy_id);
CREATE INDEX IF NOT EXISTS idx_orders_supervisor ON orders(supervisor_id);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_pocket_expenses_delivery_guy ON pocket_expenses(delivery_guy_id);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_delivery ON wallet_transactions(delivery_guy_id);
CREATE INDEX IF NOT EXISTS idx_returns_order_id ON returns(order_id);
CREATE INDEX IF NOT EXISTS idx_returns_status ON returns(status);
CREATE INDEX IF NOT EXISTS idx_returns_initiated_by ON returns(initiated_by);
CREATE INDEX IF NOT EXISTS idx_order_attachments_order_id ON order_attachments(order_id);
CREATE INDEX IF NOT EXISTS idx_order_attachments_stage ON order_attachments(stage);
CREATE INDEX IF NOT EXISTS idx_driver_shifts_delivery_guy ON driver_shifts(delivery_guy_id);
CREATE INDEX IF NOT EXISTS idx_driver_shifts_clock_in_at ON driver_shifts(clock_in_at);
CREATE INDEX IF NOT EXISTS idx_order_feedback_order_id ON order_feedback(order_id);
CREATE INDEX IF NOT EXISTS idx_order_feedback_recorded_by ON order_feedback(recorded_by);
