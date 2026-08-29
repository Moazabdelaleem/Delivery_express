const db = require('../config/db');
const { sendPushNotification } = require('../utils/pushNotifier');

// List all payments awaiting finance review (Finance & Manager)
exports.getPendingPayments = async (req, res) => {
  try {
    const result = await db.query(
      `SELECT p.*,
              o.tracking_number, o.order_amount, o.status as order_status, o.payment_type as order_payment_type,
              u.name as recorded_by_name, u.role as recorded_by_role,
              d.name as delivery_guy_name
       FROM order_payments p
       JOIN orders o ON p.order_id = o.id
       JOIN users u ON p.recorded_by = u.id
       LEFT JOIN users d ON o.delivery_guy_id = d.id
       WHERE p.confirmation_status = 'pending_finance_review'
       ORDER BY p.created_at DESC`
    );

    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching pending payments:', err);
    res.status(500).json({ error: err.message || 'Server error fetching pending payments.' });
  }
};

// Confirm a payment (Finance only)
exports.confirmPayment = async (req, res) => {
  let client;
  try {
    const { payment_id } = req.params;

    client = await db.getClient();
    await client.query('BEGIN');

    // 1. Lock payment row & fetch order details FOR UPDATE
    const paymentRes = await client.query(
      `SELECT p.*, o.delivery_guy_id, o.tracking_number
       FROM order_payments p
       JOIN orders o ON p.order_id = o.id
       WHERE p.id = $1 FOR UPDATE`,
      [payment_id]
    );

    if (paymentRes.rows.length === 0) {
      await client.query('ROLLBACK');
      client.release();
      return res.status(404).json({ error: 'Payment record not found.' });
    }

    const payment = paymentRes.rows[0];

    if (payment.confirmation_status !== 'pending_finance_review') {
      await client.query('ROLLBACK');
      client.release();
      return res.status(400).json({
        error: `Payment is already processed with status '${payment.confirmation_status}'.`
      });
    }

    // 2. Update payment confirmation status
    await client.query(
      `UPDATE order_payments
       SET confirmation_status = 'confirmed', confirmed_by = $1, confirmed_at = NOW()
       WHERE id = $2`,
      [req.user.id, payment_id]
    );

    // 3. If payment_method is 'cash', apply to collection_wallets using FOR UPDATE locking pattern
    if (payment.payment_method === 'cash') {
      const targetDriverId = payment.delivery_guy_id || payment.recorded_by;

      if (targetDriverId) {
        // Ensure collection_wallets row exists and lock FOR UPDATE
        await client.query(
          'INSERT INTO collection_wallets (delivery_guy_id) VALUES ($1) ON CONFLICT DO NOTHING',
          [targetDriverId]
        );
        await client.query(
          'SELECT * FROM collection_wallets WHERE delivery_guy_id = $1 FOR UPDATE',
          [targetDriverId]
        );
        await client.query(
          `UPDATE collection_wallets
           SET current_balance = current_balance + $1, updated_at = NOW()
           WHERE delivery_guy_id = $2`,
          [payment.amount, targetDriverId]
        );

        const walletRes = await client.query(
          'SELECT current_balance FROM collection_wallets WHERE delivery_guy_id = $1',
          [targetDriverId]
        );
        const newBal = walletRes.rows[0]?.current_balance || payment.amount;

        await client.query(
          `INSERT INTO wallet_transactions
             (wallet_type, delivery_guy_id, transaction_type, amount, balance_after, performed_by, notes_or_reason, related_order_id)
           VALUES ('collection', $1, 'cash_collected', $2, $3, $4, $5, $6)`,
          [
            targetDriverId,
            payment.amount,
            newBal,
            req.user.id,
            `Finance confirmed cash payment for order #${payment.tracking_number}`,
            payment.order_id
          ]
        );
      }
    }

    await client.query('COMMIT');
    client.release();

    const io = req.app.get('io');
    const bufferEvent = req.app.get('bufferEvent');
    const targetDriverId = payment.delivery_guy_id || payment.recorded_by;
    if (io) {
      const confirmPayload = { payment_id, order_id: payment.order_id };
      io.emit('payment_confirmed', confirmPayload);
      if (bufferEvent && targetDriverId) {
        bufferEvent(targetDriverId, 'payment_confirmed', confirmPayload);
      }

      if (payment.payment_method === 'cash') {
        const walletPayload = { delivery_guy_id: targetDriverId };
        io.emit('wallet_updated', walletPayload);
        if (bufferEvent && targetDriverId) {
          bufferEvent(targetDriverId, 'wallet_updated', walletPayload);
        }
      }
    }

    if (targetDriverId) {
      sendPushNotification(
        targetDriverId,
        'Payment Confirmed',
        `Your payment submission for order #${payment.tracking_number} was confirmed by Finance.`,
        { payment_id, order_id: payment.order_id }
      );
    }

    res.json({
      message: 'Payment confirmed successfully.',
      payment_id,
      confirmation_status: 'confirmed'
    });
  } catch (err) {
    if (client) {
      try { await client.query('ROLLBACK'); } catch (_) {}
      client.release();
    }
    console.error('Error confirming payment:', err);
    res.status(500).json({ error: err.message || 'Server error confirming payment.' });
  }
};

// Reject a payment (Finance only)
exports.rejectPayment = async (req, res) => {
  try {
    const { payment_id } = req.params;

    const paymentRes = await db.query(
      'SELECT * FROM order_payments WHERE id = $1',
      [payment_id]
    );

    if (paymentRes.rows.length === 0) {
      return res.status(404).json({ error: 'Payment record not found.' });
    }

    const payment = paymentRes.rows[0];

    if (payment.confirmation_status !== 'pending_finance_review') {
      return res.status(400).json({
        error: `Payment is already processed with status '${payment.confirmation_status}'.`
      });
    }

    const updateRes = await db.query(
      `UPDATE order_payments
       SET confirmation_status = 'rejected', confirmed_by = $1, confirmed_at = NOW()
       WHERE id = $2 RETURNING *`,
      [req.user.id, payment_id]
    );

    const io = req.app.get('io');
    const bufferEvent = req.app.get('bufferEvent');
    const targetDriverId = payment.recorded_by;
    if (io) {
      const rejectPayload = { payment_id, order_id: payment.order_id };
      io.emit('payment_rejected', rejectPayload);
      if (bufferEvent && targetDriverId) {
        bufferEvent(targetDriverId, 'payment_rejected', rejectPayload);
      }
    }

    if (targetDriverId) {
      sendPushNotification(
        targetDriverId,
        'Payment Rejected',
        `Your payment submission for order #${payment.tracking_number} was rejected by Finance.`,
        { payment_id, order_id: payment.order_id }
      );
    }

    res.json({
      message: 'Payment rejected successfully.',
      payment: updateRes.rows[0]
    });
  } catch (err) {
    console.error('Error rejecting payment:', err);
    res.status(500).json({ error: err.message || 'Server error rejecting payment.' });
  }
};
