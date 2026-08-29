const db = require('../config/db');

// Initiate a Return (Supervisor or System)
exports.createReturn = async (req, res) => {
  try {
    const { order_id, return_type, reason, returned_items_amount, returned_quantity } = req.body;

    if (!order_id) {
      return res.status(400).json({ error: 'Order ID is required.' });
    }

    if (!return_type || !['full', 'partial'].includes(return_type)) {
      return res.status(400).json({ error: "Return type must be either 'full' or 'partial'." });
    }

    if (!reason || !reason.trim()) {
      return res.status(400).json({ error: 'Reason is required for initiating a return.' });
    }

    const orderRes = await db.query('SELECT * FROM orders WHERE id = $1', [order_id]);
    if (orderRes.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found.' });
    }

    const order = orderRes.rows[0];
    const orderTotal = parseFloat(order.order_amount || 0);

    let retAmt = parseFloat(returned_items_amount || 0);
    if (return_type === 'full') {
      retAmt = orderTotal;
    } else if (retAmt <= 0) {
      retAmt = parseFloat(order.returned_items_amount || 0);
      if (retAmt <= 0) retAmt = orderTotal;
    }

    const initialStatus = 'pending_pickup';

    const insertRes = await db.query(
      `INSERT INTO returns (order_id, initiated_by, return_type, reason, status, returned_items_amount, returned_quantity)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        order_id,
        req.user.id,
        return_type,
        reason.trim(),
        initialStatus,
        retAmt,
        parseInt(returned_quantity) || parseInt(order.returned_quantity || 0)
      ]
    );

    // Record order audit log
    await db.query(
      `INSERT INTO order_status_history (order_id, old_status, new_status, changed_by, comment)
       VALUES ($1, $2, $3, $4, $5)`,
      [order_id, order.status, order.status, req.user.id, `Return initiated (${return_type}): ${reason.trim()}`]
    );

    const io = req.app.get('io');
    if (io) {
      io.emit('return_updated', { return_id: insertRes.rows[0].id, order_id, status: initialStatus });
    }

    res.status(201).json({
      message: 'Return initiated successfully',
      return_record: insertRes.rows[0]
    });
  } catch (err) {
    console.error('Error creating return:', err);
    res.status(500).json({ error: err.message || 'Server error creating return.' });
  }
};

// Verify Return (Inventory Role)
exports.verifyReturn = async (req, res) => {
  try {
    const { return_id } = req.params;
    const { status, notes } = req.body;

    if (!['verified', 'rejected'].includes(status)) {
      return res.status(400).json({ error: "Verification status must be 'verified' or 'rejected'." });
    }

    const returnRes = await db.query('SELECT * FROM returns WHERE id = $1', [return_id]);
    if (returnRes.rows.length === 0) {
      return res.status(404).json({ error: 'Return record not found.' });
    }

    const returnRec = returnRes.rows[0];

    const updateRes = await db.query(
      `UPDATE returns
       SET status = $1,
           verified_by = $2,
           verified_at = NOW()
       WHERE id = $3 RETURNING *`,
      [status, req.user.id, return_id]
    );

    const updatedReturn = updateRes.rows[0];

    // If verified, update order status to returned_to_company if full return or partial completed
    if (status === 'verified') {
      await db.query(
        `UPDATE orders
         SET status = 'returned_to_company',
             updated_at = NOW()
         WHERE id = $1`,
        [returnRec.order_id]
      );

      await db.query(
        `INSERT INTO order_status_history (order_id, old_status, new_status, changed_by, comment)
         VALUES ($1, 'delivery_failed', 'returned_to_company', $2, $3)`,
        [returnRec.order_id, req.user.id, `Inventory verified return (${returnRec.return_type}): ${notes || 'Return physically verified in warehouse'}`]
      );
    } else if (status === 'rejected') {
      await db.query(
        `INSERT INTO order_status_history (order_id, old_status, new_status, changed_by, comment)
         VALUES ($1, 'in_transit', 'in_transit', $2, $3)`,
        [returnRec.order_id, req.user.id, `Inventory rejected return verification: ${notes || 'Return rejected'}`]
      );
    }

    const io = req.app.get('io');
    if (io) {
      io.emit('return_updated', { return_id, status });
    }

    res.json({
      message: `Return record ${status} successfully.`,
      return_record: updatedReturn
    });
  } catch (err) {
    console.error('Error verifying return:', err);
    res.status(500).json({ error: err.message || 'Server error verifying return.' });
  }
};

// Get Returns Queue (Inventory, Supervisor, Manager)
exports.getReturnsQueue = async (req, res) => {
  try {
    const { status } = req.query;

    let queryStr = `
      SELECT r.*,
             o.tracking_number, o.client_address, o.order_amount, o.delivery_outcome, o.collection_outcome,
             u_init.name as initiated_by_name, u_init.role as initiated_by_role,
             u_ver.name as verified_by_name,
             u_drv.name as driver_name, u_drv.phone as driver_phone
      FROM returns r
      JOIN orders o ON r.order_id = o.id
      JOIN users u_init ON r.initiated_by = u_init.id
      LEFT JOIN users u_ver ON r.verified_by = u_ver.id
      LEFT JOIN users u_drv ON o.delivery_guy_id = u_drv.id
    `;

    const queryParams = [];
    if (status) {
      queryStr += ' WHERE r.status = $1';
      queryParams.push(status);
    }

    queryStr += ' ORDER BY r.created_at DESC';

    const result = await db.query(queryStr, queryParams);
    res.json({ returns: result.rows });
  } catch (err) {
    console.error('Error fetching returns queue:', err);
    res.status(500).json({ error: err.message || 'Server error fetching returns queue.' });
  }
};

// Get Return Pickups for Delivery Guy (Distinct from normal deliveries)
exports.getDriverReturnPickups = async (req, res) => {
  try {
    const driverId = req.user.id;

    const result = await db.query(
      `SELECT r.*,
              o.tracking_number, o.client_address, o.order_amount, o.order_details,
              u_init.name as initiated_by_name
       FROM returns r
       JOIN orders o ON r.order_id = o.id
       JOIN users u_init ON r.initiated_by = u_init.id
       WHERE o.delivery_guy_id = $1 AND r.status IN ('pending_pickup', 'pending_verification')
       ORDER BY r.created_at DESC`,
      [driverId]
    );

    res.json({ return_pickups: result.rows });
  } catch (err) {
    console.error('Error fetching driver return pickups:', err);
    res.status(500).json({ error: err.message || 'Server error fetching driver return pickups.' });
  }
};
