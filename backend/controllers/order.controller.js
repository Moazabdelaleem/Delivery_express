const db = require('../config/db');

// Sequential status flow rules (server-side enforcement)
// handed_to_delivery → in_transit (driver picks up from warehouse)
// in_transit → delivered | delivery_failed (driver completes or fails)
// delivery_failed → returned_to_company (driver returns package)
const VALID_PREDECESSORS = {
  in_transit:          ['handed_to_delivery'],
  delivered:           ['in_transit'],
  delivery_failed:     ['in_transit'],
  returned_to_company: ['delivery_failed']
};

// Create Order (Supervisor)
exports.createOrder = async (req, res) => {
  try {
    const { tracking_number: customTracking, client_name, client_phone, client_address, order_details, order_amount, delivery_guy_id } = req.body;

    if (!client_address || !client_address.trim()) {
      return res.status(400).json({ error: 'Delivery address is required to create an order.' });
    }

    const cName    = client_name && client_name.trim() ? client_name.trim() : 'Client';
    const cPhone   = client_phone || '';
    const cAddress = client_address.trim();
    const cDetails = order_details || 'Standard package';

    const tracking_number = customTracking && customTracking.trim()
      ? customTracking.trim()
      : 'ORD-' + Math.floor(100000 + Math.random() * 900000);
    const amount           = parseFloat(order_amount) || 0.00;
    const initialStatus    = delivery_guy_id ? 'assigned' : 'created';

    const result = await db.query(
      `INSERT INTO orders (tracking_number, client_name, client_phone, client_address, order_details, order_amount, status, supervisor_id, delivery_guy_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [tracking_number, cName, cPhone, cAddress, cDetails, amount, initialStatus, req.user.id, delivery_guy_id || null]
    );

    const newOrder = result.rows[0];

    await db.query(
      `INSERT INTO order_status_history (order_id, old_status, new_status, changed_by, comment)
       VALUES ($1, NULL, $2, $3, 'Order created by supervisor')`,
      [newOrder.id, initialStatus, req.user.id]
    );

    res.status(201).json({ message: 'Order created successfully.', order: newOrder });
  } catch (err) {
    console.error('Error creating order:', err);
    res.status(500).json({ error: 'Server error creating order.' });
  }
};

// Edit / Update Order (Supervisor)
exports.updateOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const { tracking_number, client_address, order_amount, delivery_guy_id } = req.body;

    const orderRes = await db.query('SELECT * FROM orders WHERE id = $1', [id]);
    if (orderRes.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found.' });
    }

    const currentOrder = orderRes.rows[0];
    const newTracking  = tracking_number && tracking_number.trim() ? tracking_number.trim() : currentOrder.tracking_number;
    const newAddress   = client_address && client_address.trim() ? client_address.trim() : currentOrder.client_address;
    const newAmount    = order_amount !== undefined ? parseFloat(order_amount) : currentOrder.order_amount;
    const newDriverId  = delivery_guy_id !== undefined ? delivery_guy_id : currentOrder.delivery_guy_id;
    const newStatus    = newDriverId ? (currentOrder.status === 'created' ? 'assigned' : currentOrder.status) : currentOrder.status;

    const updateRes = await db.query(
      `UPDATE orders
       SET tracking_number = $1, client_address = $2, order_amount = $3, delivery_guy_id = $4, status = $5, updated_at = NOW()
       WHERE id = $6 RETURNING *`,
      [newTracking, newAddress, newAmount, newDriverId, newStatus, id]
    );

    await db.query(
      `INSERT INTO order_status_history (order_id, old_status, new_status, changed_by, comment)
       VALUES ($1, $2, $3, $4, 'Order details updated by supervisor')`,
      [id, currentOrder.status, newStatus, req.user.id]
    );

    res.json({ message: 'Order updated successfully.', order: updateRes.rows[0] });
  } catch (err) {
    console.error('Error updating order:', err);
    res.status(500).json({ error: 'Server error updating order.' });
  }
};

// Delete Order (Supervisor)
exports.deleteOrder = async (req, res) => {
  try {
    const { id } = req.params;

    const orderRes = await db.query('SELECT * FROM orders WHERE id = $1', [id]);
    if (orderRes.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found.' });
    }

    await db.query('DELETE FROM order_status_history WHERE order_id = $1', [id]);
    await db.query('DELETE FROM orders WHERE id = $1', [id]);

    res.json({ message: 'Order deleted successfully.' });
  } catch (err) {
    console.error('Error deleting order:', err);
    res.status(500).json({ error: 'Server error deleting order.' });
  }
};

// Reverse / Undo Inventory Handoff (Inventory)
exports.undoHandoff = async (req, res) => {
  try {
    const { order_id } = req.params;

    const orderRes = await db.query('SELECT * FROM orders WHERE id = $1', [order_id]);
    if (orderRes.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found.' });
    }

    const order = orderRes.rows[0];
    if (order.status !== 'handed_to_delivery') {
      return res.status(400).json({ error: `Cannot undo handoff for an order with status '${order.status}'. Order must be 'handed_to_delivery'.` });
    }

    const oldStatus = order.status;
    const newStatus = 'notified_inventory';

    const updateRes = await db.query(
      `UPDATE orders
       SET status = $1, inventory_handoff_by = NULL, inventory_note = NULL, updated_at = NOW()
       WHERE id = $2 RETURNING *`,
      [newStatus, order_id]
    );

    await db.query(
      `INSERT INTO order_status_history (order_id, old_status, new_status, changed_by, comment)
       VALUES ($1, $2, $3, $4, 'Inventory handoff reversed / undone')`,
      [order_id, oldStatus, newStatus, req.user.id]
    );

    res.json({ message: 'Inventory handoff undone successfully.', order: updateRes.rows[0] });
  } catch (err) {
    console.error('Error undoing inventory handoff:', err);
    res.status(500).json({ error: 'Server error undoing inventory handoff.' });
  }
};

// Assign Order to Delivery Guy & Notify Inventory (Supervisor)
exports.assignOrder = async (req, res) => {
  try {
    const { order_id } = req.params;
    const { delivery_guy_id } = req.body;

    if (!delivery_guy_id) {
      return res.status(400).json({ error: 'Delivery guy ID is required.' });
    }

    const orderRes = await db.query('SELECT * FROM orders WHERE id = $1', [order_id]);
    if (orderRes.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found.' });
    }

    const oldStatus = orderRes.rows[0].status;
    const newStatus = 'notified_inventory';

    const updateRes = await db.query(
      `UPDATE orders
       SET delivery_guy_id = $1, status = $2, supervisor_id = $3, updated_at = NOW()
       WHERE id = $4 RETURNING *`,
      [delivery_guy_id, newStatus, req.user.id, order_id]
    );

    const updatedOrder = updateRes.rows[0];

    await db.query(
      `INSERT INTO order_status_history (order_id, old_status, new_status, changed_by, comment)
       VALUES ($1, $2, $3, $4, 'Supervisor assigned order and notified inventory')`,
      [order_id, oldStatus, newStatus, req.user.id]
    );

    res.json({ message: 'Order assigned and inventory notified.', order: updatedOrder });
  } catch (err) {
    console.error('Error assigning order:', err);
    res.status(500).json({ error: 'Server error assigning order.' });
  }
};

// Inventory Handoff Confirmation (Inventory)
exports.inventoryHandoff = async (req, res) => {
  try {
    const { order_id } = req.params;
    const { handed_over, note } = req.body;

    const orderRes = await db.query('SELECT * FROM orders WHERE id = $1', [order_id]);
    if (orderRes.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found.' });
    }

    const order     = orderRes.rows[0];
    const oldStatus = order.status;

    // Guard: only allow handoff from valid pre-handoff statuses
    const validHandoffStatuses = ['assigned', 'notified_inventory'];
    if (!validHandoffStatuses.includes(oldStatus)) {
      return res.status(400).json({
        error: `Cannot perform inventory handoff on an order with status '${oldStatus}'. Order must be 'assigned' or 'notified_inventory'.`
      });
    }

    const newStatus = handed_over ? 'handed_to_delivery' : 'pickup_failed';

    const updateRes = await db.query(
      `UPDATE orders
       SET status = $1, inventory_handoff_by = $2, inventory_note = $3, updated_at = NOW()
       WHERE id = $4 RETURNING *`,
      [newStatus, req.user.id, note || null, order_id]
    );

    const updatedOrder = updateRes.rows[0];

    await db.query(
      `INSERT INTO order_status_history (order_id, old_status, new_status, changed_by, comment)
       VALUES ($1, $2, $3, $4, $5)`,
      [order_id, oldStatus, newStatus, req.user.id,
       note || (handed_over ? 'Order handed over to delivery guy' : 'Order pickup failed')]
    );

    res.json({ message: `Order status updated to ${newStatus}`, order: updatedOrder });
  } catch (err) {
    console.error('Error in inventory handoff:', err);
    res.status(500).json({ error: 'Server error updating inventory handoff.' });
  }
};

// Update Delivery Status (Delivery Guy)
exports.updateDeliveryStatus = async (req, res) => {
  let client;
  try {
    const { order_id } = req.params;
    const { status, failure_reason, cash_amount } = req.body;

    const validStatuses = ['in_transit', 'delivered', 'delivery_failed', 'returned_to_company'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        error: `Invalid delivery status '${status}'. Must be one of: ${validStatuses.join(', ')}`
      });
    }

    client = await db.getClient();
    await client.query('BEGIN');

    const orderRes = await client.query('SELECT * FROM orders WHERE id = $1', [order_id]);
    if (orderRes.rows.length === 0) {
      await client.query('ROLLBACK');
      client.release();
      return res.status(404).json({ error: 'Order not found.' });
    }

    const order     = orderRes.rows[0];
    const oldStatus = order.status;

    // Enforce sequential status flow
    const validPredecessors = VALID_PREDECESSORS[status];
    if (validPredecessors && !validPredecessors.includes(oldStatus)) {
      await client.query('ROLLBACK');
      client.release();
      return res.status(400).json({
        error: `Cannot transition order from '${oldStatus}' to '${status}'. Expected current status: ${validPredecessors.join(' or ')}.`
      });
    }

    // Verify the order belongs to this delivery guy
    if (order.delivery_guy_id !== req.user.id) {
      await client.query('ROLLBACK');
      client.release();
      return res.status(403).json({ error: 'This order is not assigned to you.' });
    }

    const cashCollected = status === 'delivered'
      ? (parseFloat(cash_amount) || parseFloat(order.order_amount))
      : 0.00;

    const updateRes = await client.query(
      `UPDATE orders
       SET status = $1,
           delivery_failure_reason = $2,
           cash_collected = $3,
           delivered_at = CASE WHEN $1 = 'delivered' THEN NOW() ELSE delivered_at END,
           updated_at = NOW()
       WHERE id = $4 RETURNING *`,
      [status, failure_reason || null, cashCollected, order_id]
    );

    const updatedOrder = updateRes.rows[0];

    // Deposit cash into Collection Wallet on successful delivery
    if (status === 'delivered' && cashCollected > 0) {
      await client.query(
        'INSERT INTO collection_wallets (delivery_guy_id) VALUES ($1) ON CONFLICT DO NOTHING',
        [req.user.id]
      );
      await client.query(
        `UPDATE collection_wallets
         SET current_balance = current_balance + $1, updated_at = NOW()
         WHERE delivery_guy_id = $2`,
        [cashCollected, req.user.id]
      );

      const walletRes = await client.query(
        'SELECT current_balance FROM collection_wallets WHERE delivery_guy_id = $1',
        [req.user.id]
      );
      const newBal = walletRes.rows[0]?.current_balance || cashCollected;

      await client.query(
        `INSERT INTO wallet_transactions
           (wallet_type, delivery_guy_id, transaction_type, amount, balance_after, performed_by, notes_or_reason, related_order_id)
         VALUES ('collection', $1, 'cash_collected', $2, $3, $4, 'Cash collected from client delivery', $5)`,
        [req.user.id, cashCollected, newBal, req.user.id, order_id]
      );
    }

    await client.query(
      `INSERT INTO order_status_history (order_id, old_status, new_status, changed_by, comment)
       VALUES ($1, $2, $3, $4, $5)`,
      [order_id, oldStatus, status, req.user.id,
       failure_reason || `Delivery status changed to ${status}`]
    );

    await client.query('COMMIT');
    client.release();

    const io = req.app.get('io');
    if (io) {
      io.emit('status_changed', { order_id, oldStatus, newStatus: status });
      io.emit('wallet_updated', { delivery_guy_id: req.user.id });
    }

    res.json({ message: `Delivery status updated to ${status}`, order: updatedOrder });
  } catch (err) {
    if (client) {
      try { await client.query('ROLLBACK'); } catch (_) {}
      client.release();
    }
    console.error('Error updating delivery status:', err);
    res.status(500).json({ error: 'Server error updating delivery status.' });
  }
};

// Get Orders for Delivery Guy
exports.getDeliveryGuyOrders = async (req, res) => {
  try {
    const result = await db.query(
      `SELECT o.*, s.name as supervisor_name
       FROM orders o
       LEFT JOIN users s ON o.supervisor_id = s.id
       WHERE o.delivery_guy_id = $1
       ORDER BY o.created_at DESC`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching delivery guy orders:', err);
    res.status(500).json({ error: 'Failed to fetch orders.' });
  }
};

// Get Inventory Handoff Queue (all orders with join)
exports.getInventoryQueue = async (req, res) => {
  try {
    const result = await db.query(
      `SELECT o.*, s.name as supervisor_name, d.name as delivery_guy_name, d.online_status as delivery_guy_status
       FROM orders o
       LEFT JOIN users s ON o.supervisor_id = s.id
       LEFT JOIN users d ON o.delivery_guy_id = d.id
       ORDER BY o.updated_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching inventory queue:', err);
    res.status(500).json({ error: 'Failed to fetch inventory queue.' });
  }
};

// Get All Orders (any authenticated role)
exports.getAllOrders = async (req, res) => {
  try {
    const result = await db.query(
      `SELECT o.*,
              s.name as supervisor_name,
              d.name as delivery_guy_name, d.online_status as delivery_guy_status,
              h.name as inventory_handed_by_name
       FROM orders o
       LEFT JOIN users s ON o.supervisor_id = s.id
       LEFT JOIN users d ON o.delivery_guy_id = d.id
       LEFT JOIN users h ON o.inventory_handoff_by = h.id
       ORDER BY o.created_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching all orders:', err);
    res.status(500).json({ error: 'Failed to fetch orders.' });
  }
};

// Get Chronological Order Audit Trail
exports.getOrderAuditTrail = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query(
      `SELECT h.*, u.name as changed_by_name, u.role as changed_by_role
       FROM order_status_history h
       LEFT JOIN users u ON h.changed_by = u.id
       WHERE h.order_id = $1
       ORDER BY h.created_at ASC`,
      [id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching order audit trail:', err);
    res.status(500).json({ error: 'Failed to fetch order audit trail.' });
  }
};
