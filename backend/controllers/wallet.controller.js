const db = require('../config/db');
const { sendPushNotification } = require('../utils/pushNotifier');

// Get Wallets Summary for a Delivery Guy or All Delivery Guys
exports.getWalletsSummary = async (req, res) => {
  try {
    const isDeliveryGuy  = req.user.role === 'delivery_guy';
    const targetUserId   = isDeliveryGuy ? req.user.id : req.query.delivery_guy_id;

    if (targetUserId) {
      const collection = await db.query(
        `SELECT COALESCE(
           (SELECT SUM(CAST(order_amount AS NUMERIC)) FROM orders
            WHERE delivery_guy_id = $1 AND status = 'delivered'),
           0.00
         ) as current_balance`,
        [targetUserId]
      );
      const pocket = await db.query(
        'SELECT * FROM pocket_wallets WHERE delivery_guy_id = $1',
        [targetUserId]
      );
      const expenses = await db.query(
        `SELECT e.*, u.name as delivery_guy_name, o.tracking_number as order_tracking_number, o.client_address
         FROM pocket_expenses e
         JOIN users u ON e.delivery_guy_id = u.id
         LEFT JOIN orders o ON e.order_id = o.id
         WHERE e.delivery_guy_id = $1
         ORDER BY e.created_at DESC`,
        [targetUserId]
      );

      return res.json({
        collection_wallet: { current_balance: parseFloat(collection.rows[0]?.current_balance || 0) },
        pocket_wallet:     pocket.rows[0] || { current_balance: 50.00, total_topped_up: 50.00, total_spent: 0.00 },
        expenses:          expenses.rows
      });
    }

    // For Finance / Manager: all delivery guys' wallets
    const result = await db.query(
      `SELECT u.id, u.id as delivery_guy_id, u.name, u.name as delivery_guy_name,
              u.username, u.email, u.phone, u.online_status,
              COALESCE(
                (SELECT SUM(CAST(o.order_amount AS NUMERIC)) FROM orders o
                 WHERE o.delivery_guy_id = u.id AND o.status = 'delivered'),
                0.00
              ) as collection_balance,
              COALESCE(p.current_balance, 0.00) as pocket_balance,
              COALESCE(p.total_topped_up, 0.00) as total_topped_up,
              COALESCE(p.total_spent, 0.00) as total_spent
       FROM users u
       LEFT JOIN pocket_wallets p ON u.id = p.delivery_guy_id
       WHERE u.role = 'delivery_guy' AND u.is_approved = true
       ORDER BY u.name ASC`
    );

    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching wallets summary:', err);
    res.status(500).json({ error: err.message || 'Server error fetching wallet data.' });
  }
};

// Finance Pull Cash Out of Collection Wallet (Finance only)
exports.financePullCashOut = async (req, res) => {
  let client;
  try {
    const { delivery_guy_id, amount_to_pull, notes } = req.body;
    if (!delivery_guy_id) {
      return res.status(400).json({ error: 'Delivery guy ID is required.' });
    }

    client = await db.getClient();
    await client.query('BEGIN');

    // 1. Ensure collection_wallets row exists and lock it FOR UPDATE
    await client.query(
      'INSERT INTO collection_wallets (delivery_guy_id) VALUES ($1) ON CONFLICT DO NOTHING',
      [delivery_guy_id]
    );
    await client.query(
      'SELECT * FROM collection_wallets WHERE delivery_guy_id = $1 FOR UPDATE',
      [delivery_guy_id]
    );

    // 2. Lock target delivered orders rows FOR UPDATE
    const deliveredOrders = await client.query(
      "SELECT id, order_amount FROM orders WHERE delivery_guy_id = $1 AND status = 'delivered' FOR UPDATE",
      [delivery_guy_id]
    );

    const currentBal = deliveredOrders.rows.reduce((sum, o) => sum + parseFloat(o.order_amount || 0), 0);

    const pullAmount = (amount_to_pull !== undefined && amount_to_pull !== null && parseFloat(amount_to_pull) > 0)
      ? parseFloat(amount_to_pull)
      : currentBal;

    if (pullAmount <= 0 || deliveredOrders.rows.length === 0) {
      await client.query('ROLLBACK');
      client.release();
      return res.status(400).json({
        error: 'No cash available to pull for this delivery guy. Wallet balance is fully settled.'
      });
    }

    // Update all delivered orders → cash_cleared
    for (const ord of deliveredOrders.rows) {
      await client.query("UPDATE orders SET status = 'cash_cleared', updated_at = NOW() WHERE id = $1", [ord.id]);
      await client.query(
        `INSERT INTO order_status_history (order_id, old_status, new_status, changed_by, comment)
         VALUES ($1, 'delivered', 'cash_cleared', $2, 'Cash collected and settled by Finance')`,
        [ord.id, req.user.id]
      );
    }

    await client.query(
      'UPDATE collection_wallets SET current_balance = 0.00, updated_at = NOW() WHERE delivery_guy_id = $1',
      [delivery_guy_id]
    );

    await client.query(
      `INSERT INTO wallet_transactions
         (wallet_type, delivery_guy_id, transaction_type, amount, balance_after, performed_by, notes_or_reason)
       VALUES ('collection', $1, 'finance_cash_pullout', $2, $3, $4, $5)`,
      [delivery_guy_id, pullAmount, 0.00, req.user.id, notes || 'Finance received physical cash deposit']
    );

    await client.query('COMMIT');
    client.release();

    res.json({
      message:     `Successfully pulled $${pullAmount.toFixed(2)} cash from collection wallet.`,
      new_balance: 0.00
    });
  } catch (err) {
    if (client) {
      try { await client.query('ROLLBACK'); } catch (_) {}
      client.release();
    }
    console.error('Error pulling cash out:', err);
    res.status(500).json({ error: err.message || 'Server error pulling cash out.' });
  }
};

// Finance Clear Single Order Cash (Finance only)
exports.financeClearOrderCash = async (req, res) => {
  let client;
  try {
    const { order_id } = req.body;
    if (!order_id) {
      return res.status(400).json({ error: 'Order ID is required.' });
    }

    client = await db.getClient();
    await client.query('BEGIN');

    // Lock order row FOR UPDATE
    const orderRes = await client.query('SELECT * FROM orders WHERE id = $1 FOR UPDATE', [order_id]);
    if (orderRes.rows.length === 0) {
      await client.query('ROLLBACK');
      client.release();
      return res.status(404).json({ error: 'Order not found.' });
    }

    const order = orderRes.rows[0];
    if (order.status !== 'delivered') {
      await client.query('ROLLBACK');
      client.release();
      return res.status(400).json({
        error: `Order is not in 'delivered' state. Current status: ${order.status}`
      });
    }

    // Lock collection wallet row FOR UPDATE
    await client.query(
      'INSERT INTO collection_wallets (delivery_guy_id) VALUES ($1) ON CONFLICT DO NOTHING',
      [order.delivery_guy_id]
    );
    await client.query(
      'SELECT * FROM collection_wallets WHERE delivery_guy_id = $1 FOR UPDATE',
      [order.delivery_guy_id]
    );

    const amount = parseFloat(order.order_amount || 0);

    await client.query("UPDATE orders SET status = 'cash_cleared', updated_at = NOW() WHERE id = $1", [order_id]);

    await client.query(
      `INSERT INTO order_status_history (order_id, old_status, new_status, changed_by, comment)
       VALUES ($1, 'delivered', 'cash_cleared', $2, $3)`,
      [order_id, req.user.id, `Cash of $${amount.toFixed(2)} settled per order by Finance`]
    );

    await client.query(
      `INSERT INTO wallet_transactions
         (wallet_type, delivery_guy_id, transaction_type, amount, balance_after, performed_by, notes_or_reason, related_order_id)
       VALUES ('collection', $1, 'finance_cash_pullout', $2, $3, $4, $5, $6)`,
      [order.delivery_guy_id, amount, 0.00, req.user.id,
       `Per-order cash settlement for tracking #${order.tracking_number}`, order_id]
    );

    await client.query('COMMIT');
    client.release();

    res.json({
      message:        `Successfully cleared $${amount.toFixed(2)} cash for order #${order.tracking_number}.`,
      order_id,
      cleared_amount: amount
    });
  } catch (err) {
    if (client) {
      try { await client.query('ROLLBACK'); } catch (_) {}
      client.release();
    }
    console.error('Error clearing order cash:', err);
    res.status(500).json({ error: err.message || 'Server error clearing order cash.' });
  }
};

// Finance Top-Up Pocket Money Wallet (Finance only)
exports.financeTopUpPocketMoney = async (req, res) => {
  let client;
  try {
    const { delivery_guy_id, amount, notes } = req.body;
    const topUpAmount = parseFloat(amount);

    if (!delivery_guy_id || !topUpAmount || topUpAmount <= 0) {
      return res.status(400).json({
        error: 'Delivery guy ID and positive top-up amount are required.'
      });
    }

    client = await db.getClient();
    await client.query('BEGIN');

    // Ensure pocket wallet row exists & lock FOR UPDATE
    await client.query(
      'INSERT INTO pocket_wallets (delivery_guy_id) VALUES ($1) ON CONFLICT DO NOTHING',
      [delivery_guy_id]
    );
    await client.query(
      'SELECT * FROM pocket_wallets WHERE delivery_guy_id = $1 FOR UPDATE',
      [delivery_guy_id]
    );

    const updateRes = await client.query(
      `UPDATE pocket_wallets
       SET current_balance = current_balance + $1,
           total_topped_up = total_topped_up + $1,
           updated_at = NOW()
       WHERE delivery_guy_id = $2
       RETURNING *`,
      [topUpAmount, delivery_guy_id]
    );

    const wallet = updateRes.rows[0];

    await client.query(
      `INSERT INTO wallet_transactions
         (wallet_type, delivery_guy_id, transaction_type, amount, balance_after, performed_by, notes_or_reason)
       VALUES ('pocket', $1, 'finance_topup', $2, $3, $4, $5)`,
      [delivery_guy_id, topUpAmount, wallet.current_balance, req.user.id,
       notes || 'Finance pocket money top-up']
    );

    await client.query('COMMIT');
    client.release();

    const io = req.app.get('io');
    const bufferEvent = req.app.get('bufferEvent');
    if (io) {
      const payloadUpdated = { delivery_guy_id, type: 'topup', amount: topUpAmount };
      const payloadTopup = { delivery_guy_id, amount: topUpAmount };
      io.emit('wallet_updated', payloadUpdated);
      io.emit('pocket_topup', payloadTopup);
      if (bufferEvent) {
        bufferEvent(delivery_guy_id, 'wallet_updated', payloadUpdated);
        bufferEvent(delivery_guy_id, 'pocket_topup', payloadTopup);
      }
    }

    sendPushNotification(
      delivery_guy_id,
      'Pocket Money Top-Up',
      `Finance topped up your pocket allowance wallet with $${topUpAmount.toFixed(2)}.`,
      { type: 'topup', amount: topUpAmount }
    );

    res.json({
      message:       `Successfully topped up ${topUpAmount} to pocket wallet.`,
      pocket_wallet: wallet
    });
  } catch (err) {
    if (client) {
      try { await client.query('ROLLBACK'); } catch (_) {}
      client.release();
    }
    console.error('Error topping up pocket money:', err);
    res.status(500).json({ error: err.message || 'Server error topping up pocket money.' });
  }
};

// Record Expense from Pocket Money Wallet (Delivery Guy)
exports.recordPocketExpense = async (req, res) => {
  let client;
  try {
    const { amount, reason, order_id } = req.body;
    const expenseAmount = parseFloat(amount);

    if (!expenseAmount || expenseAmount <= 0) {
      return res.status(400).json({ error: 'Valid expense amount is required.' });
    }
    if (!reason || reason.trim() === '') {
      return res.status(400).json({ error: 'A mandatory reason is required for spending pocket money.' });
    }

    const targetOrderId = (order_id && String(order_id).trim() !== '') ? order_id : null;

    client = await db.getClient();
    await client.query('BEGIN');

    await client.query(
      'INSERT INTO pocket_wallets (delivery_guy_id) VALUES ($1) ON CONFLICT DO NOTHING',
      [req.user.id]
    );

    // Lock pocket wallet row FOR UPDATE to prevent race conditions during expense calculation
    const walletRes = await client.query(
      'SELECT * FROM pocket_wallets WHERE delivery_guy_id = $1 FOR UPDATE',
      [req.user.id]
    );

    if (walletRes.rows.length === 0) {
      await client.query('ROLLBACK');
      client.release();
      return res.status(400).json({ error: 'No pocket wallet found for this user.' });
    }

    const wallet       = walletRes.rows[0];
    const newBalance   = parseFloat(wallet.current_balance) - expenseAmount;
    const newTotalSpent = parseFloat(wallet.total_spent) + expenseAmount;

    await client.query(
      `UPDATE pocket_wallets
       SET current_balance = $1, total_spent = $2, updated_at = NOW()
       WHERE delivery_guy_id = $3`,
      [newBalance, newTotalSpent, req.user.id]
    );

    const expenseRes = await client.query(
      `INSERT INTO pocket_expenses (pocket_wallet_id, delivery_guy_id, amount, reason, order_id)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [wallet.id, req.user.id, expenseAmount, reason.trim(), targetOrderId]
    );

    await client.query(
      `INSERT INTO wallet_transactions
         (wallet_type, delivery_guy_id, transaction_type, amount, balance_after, performed_by, notes_or_reason, related_order_id)
       VALUES ('pocket', $1, 'pocket_expense', $2, $3, $4, $5, $6)`,
      [req.user.id, expenseAmount, newBalance, req.user.id, reason.trim(), targetOrderId]
    );

    await client.query('COMMIT');
    client.release();

    const io = req.app.get('io');
    const bufferEvent = req.app.get('bufferEvent');
    if (io) {
      const payloadUpdated = { delivery_guy_id: req.user.id, type: 'expense', amount: expenseAmount };
      const payloadExpense = { delivery_guy_id: req.user.id, amount: expenseAmount };
      io.emit('wallet_updated', payloadUpdated);
      io.emit('pocket_expense_logged', payloadExpense);
      if (bufferEvent) {
        bufferEvent(req.user.id, 'wallet_updated', payloadUpdated);
        bufferEvent(req.user.id, 'pocket_expense_logged', payloadExpense);
      }
    }

    res.status(201).json({
      message:           'Expense recorded successfully.',
      expense:           expenseRes.rows[0],
      new_pocket_balance: newBalance
    });
  } catch (err) {
    if (client) {
      try { await client.query('ROLLBACK'); } catch (_) {}
      client.release();
    }
    console.error('Error recording expense:', err);
    res.status(500).json({ error: err.message || 'Server error recording expense.' });
  }
};

// Get Itemized Expense Breakdown
exports.getExpensesBreakdown = async (req, res) => {
  try {
    const result = await db.query(
      `SELECT e.*, u.name as delivery_guy_name, u.email as delivery_guy_email, o.tracking_number as order_tracking_number, o.client_address
       FROM pocket_expenses e
       JOIN users u ON e.delivery_guy_id = u.id
       LEFT JOIN orders o ON e.order_id = o.id
       ORDER BY e.created_at DESC`
    );

    const totalRes = await db.query(
      'SELECT COALESCE(SUM(amount), 0.00) as grand_total FROM pocket_expenses'
    );

    res.json({
      grand_total_spent: parseFloat(totalRes.rows[0].grand_total),
      breakdown:         result.rows
    });
  } catch (err) {
    console.error('Error fetching breakdown:', err);
    res.status(500).json({ error: err.message || 'Failed to fetch expense breakdown.' });
  }
};

// Get Detailed Pocket Wallet Ledger History for a specific driver (Finance Only)
exports.getDriverWalletLedger = async (req, res) => {
  try {
    const { delivery_guy_id } = req.params;
    if (!delivery_guy_id) {
      return res.status(400).json({ error: 'Delivery guy ID is required.' });
    }

    const driverRes = await db.query(
      'SELECT id, name, username, email, phone FROM users WHERE id = $1',
      [delivery_guy_id]
    );
    if (driverRes.rows.length === 0) {
      return res.status(404).json({ error: 'Driver not found.' });
    }

    const driver = driverRes.rows[0];

    const pocketRes = await db.query(
      'SELECT * FROM pocket_wallets WHERE delivery_guy_id = $1',
      [delivery_guy_id]
    );
    const pocket = pocketRes.rows[0] || { current_balance: 0.00, total_topped_up: 0.00, total_spent: 0.00 };

    const expensesRes = await db.query(
      `SELECT e.*, u.name as delivery_guy_name, o.tracking_number as order_tracking_number, o.client_address
       FROM pocket_expenses e
       JOIN users u ON e.delivery_guy_id = u.id
       LEFT JOIN orders o ON e.order_id = o.id
       WHERE e.delivery_guy_id = $1
       ORDER BY e.created_at DESC`,
      [delivery_guy_id]
    );

    const txRes = await db.query(
      `SELECT t.*, u.name as performed_by_name
       FROM wallet_transactions t
       LEFT JOIN users u ON t.performed_by = u.id
       WHERE t.delivery_guy_id = $1
       ORDER BY t.created_at DESC`,
      [delivery_guy_id]
    );

    res.json({
      driver: { id: driver.id, name: driver.name, username: driver.username, phone: driver.phone },
      pocket_wallet: {
        current_balance: parseFloat(pocket.current_balance || 0.00),
        total_topped_up: parseFloat(pocket.total_topped_up || 0.00),
        total_spent:     parseFloat(pocket.total_spent || 0.00)
      },
      expenses:     expensesRes.rows,
      transactions: txRes.rows
    });
  } catch (err) {
    console.error('Error fetching driver wallet ledger:', err);
    res.status(500).json({ error: 'Failed to fetch driver wallet ledger history.' });
  }
};

// Get Global Wallet Transactions Audit Trail (Finance/Manager)
exports.getGlobalAuditTrail = async (req, res) => {
  try {
    const result = await db.query(
      `SELECT t.*,
              d.name as driver_name, d.username as driver_username,
              p.name as performed_by_name, p.role as performed_by_role
       FROM wallet_transactions t
       LEFT JOIN users d ON t.delivery_guy_id = d.id
       LEFT JOIN users p ON t.performed_by = p.id
       ORDER BY t.created_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching global audit trail:', err);
    res.status(500).json({ error: 'Failed to fetch global transactions audit trail.' });
  }
};
