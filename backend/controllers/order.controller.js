const db = require('../config/db');
const { DELIVERY_OUTCOMES, getOutcomeByKey, findOutcome } = require('../config/deliveryOutcomes');
const { sendPushNotification } = require('../utils/pushNotifier');

// Sequential status flow rules (server-side enforcement)
// handed_to_delivery → in_transit (driver picks up from warehouse)
// in_transit → delivered | delivery_failed (driver completes or fails)
// delivery_failed → returned_to_company (driver returns package)
const VALID_PREDECESSORS = {
  in_transit:          ['handed_to_delivery', 'assigned'],
  delivered:           ['in_transit', 'handed_to_delivery'],
  delivery_failed:     ['in_transit', 'handed_to_delivery'],
  returned_to_company: ['delivery_failed']
};

// Create Order (Supervisor)
exports.createOrder = async (req, res) => {
  try {
    const { tracking_number: customTracking, client_address, order_details, order_amount, delivery_guy_id, payment_type } = req.body;

    if (!client_address || !client_address.trim()) {
      return res.status(400).json({ error: 'Delivery address is required to create an order.' });
    }

    const cAddress = client_address.trim();
    const cDetails = order_details || 'Standard package';

    if (!customTracking || !customTracking.trim()) {
      return res.status(400).json({ error: 'Order Number / Code is strictly required and must be provided by the supervisor.' });
    }

    const tracking_number = customTracking.trim();
    const amount           = parseFloat(order_amount) || 0.00;
    const initialStatus    = delivery_guy_id ? 'assigned' : 'created';
    const validPaymentTypes = ['full_upfront', 'pay_after_delivery', 'accounts_payable', 'installments', 'other'];
    const pType            = (payment_type && validPaymentTypes.includes(payment_type)) ? payment_type : 'pay_after_delivery';

    const result = await db.query(
      `INSERT INTO orders (tracking_number, client_address, order_details, order_amount, status, supervisor_id, delivery_guy_id, payment_type)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [tracking_number, cAddress, cDetails, amount, initialStatus, req.user.id, delivery_guy_id || null, pType]
    );

    const newOrder = result.rows[0];

    await db.query(
      `INSERT INTO order_status_history (order_id, old_status, new_status, changed_by, comment)
       VALUES ($1, NULL, $2, $3, 'Order created by supervisor')`,
      [newOrder.id, initialStatus, req.user.id]
    );

    const io = req.app.get('io');
    const bufferEvent = req.app.get('bufferEvent');
    if (io && newOrder.delivery_guy_id) {
      const payload = {
        order_id: newOrder.id,
        delivery_guy_id: newOrder.delivery_guy_id,
        tracking_number: newOrder.tracking_number
      };
      io.emit('order_assigned', payload);
      if (bufferEvent) bufferEvent(newOrder.delivery_guy_id, 'order_assigned', payload);
      sendPushNotification(
        newOrder.delivery_guy_id,
        'New Delivery Assigned',
        `Order #${newOrder.tracking_number} assigned to you. Address: ${newOrder.client_address}`,
        { order_id: newOrder.id, tracking_number: newOrder.tracking_number }
      );
    }

    res.status(201).json({ message: 'Order created successfully.', order: newOrder });
  } catch (err) {
    console.error('Error creating order:', err);
    // Handle unique constraint violation for tracking_number
    if (err.code === '23505' && err.constraint && err.constraint.includes('tracking_number')) {
      return res.status(409).json({ error: `Order number "${err.detail?.match(/'([^']+)'/)?.[1] || 'provided'}" already exists. Order numbers must be unique.` });
    }
    if (err.code === '23505') {
      return res.status(409).json({ error: 'An order with this order number already exists. Please use a unique order number.' });
    }
    res.status(500).json({ error: err.message || 'Server error creating order.' });
  }
};

// Edit / Update Order (Supervisor)
exports.updateOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const { tracking_number, client_address, order_amount, delivery_guy_id, payment_type } = req.body;

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
    const validPaymentTypes = ['full_upfront', 'pay_after_delivery', 'accounts_payable', 'other'];
    const newPaymentType    = payment_type && validPaymentTypes.includes(payment_type) ? payment_type : currentOrder.payment_type;

    const updateRes = await db.query(
      `UPDATE orders
       SET tracking_number = $1, client_address = $2, order_amount = $3, delivery_guy_id = $4, status = $5, payment_type = $6, updated_at = NOW()
       WHERE id = $7 RETURNING *`,
      [newTracking, newAddress, newAmount, newDriverId, newStatus, newPaymentType, id]
    );

    await db.query(
      `INSERT INTO order_status_history (order_id, old_status, new_status, changed_by, comment)
       VALUES ($1, $2, $3, $4, 'Order details updated by supervisor')`,
      [id, currentOrder.status, newStatus, req.user.id]
    );

    res.json({ message: 'Order updated successfully.', order: updateRes.rows[0] });
  } catch (err) {
    console.error('Error updating order:', err);
    if (err.code === '23505') {
      return res.status(409).json({ error: 'An order with this order number already exists. Order numbers must be unique.' });
    }
    res.status(500).json({ error: err.message || 'Server error updating order.' });
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
    res.status(500).json({ error: err.message || 'Server error deleting order.' });
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
    res.status(500).json({ error: err.message || 'Server error undoing inventory handoff.' });
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

    const io = req.app.get('io');
    const bufferEvent = req.app.get('bufferEvent');
    if (io && updatedOrder.delivery_guy_id) {
      const payload = {
        order_id: updatedOrder.id,
        delivery_guy_id: updatedOrder.delivery_guy_id,
        tracking_number: updatedOrder.tracking_number
      };
      io.emit('order_assigned', payload);
      if (bufferEvent) bufferEvent(updatedOrder.delivery_guy_id, 'order_assigned', payload);
      sendPushNotification(
        updatedOrder.delivery_guy_id,
        'New Delivery Assigned',
        `Order #${updatedOrder.tracking_number} assigned to you. Address: ${updatedOrder.client_address}`,
        { order_id: updatedOrder.id, tracking_number: updatedOrder.tracking_number }
      );
    }

    res.json({ message: 'Order assigned and inventory notified.', order: updatedOrder });
  } catch (err) {
    console.error('Error assigning order:', err);
    res.status(500).json({ error: err.message || 'Server error assigning order.' });
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

    // MANDATORY PHOTO PROOF GUARD FOR WAREHOUSE HANDOFF
    if (handed_over) {
      const attCheck = await db.query(
        'SELECT id FROM order_attachments WHERE order_id = $1',
        [order_id]
      );
      if (attCheck.rows.length === 0) {
        return res.status(400).json({
          error: 'Photo proof required! Please capture and attach an image of the order condition before confirming warehouse handoff.'
        });
      }
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

    const io = req.app.get('io');
    if (io) {
      io.emit('status_changed', {
        order_id,
        oldStatus,
        newStatus,
        delivery_outcome: updatedOrder.delivery_outcome || null,
        collection_outcome: updatedOrder.collection_outcome || null
      });
    }

    if (updatedOrder.delivery_guy_id) {
      sendPushNotification(
        updatedOrder.delivery_guy_id,
        'Order Status Updated',
        `Order #${updatedOrder.tracking_number} is now ${newStatus.replace(/_/g, ' ')}`,
        { order_id: updatedOrder.id, status: newStatus }
      );
    }

    res.json({ message: `Order status updated to ${newStatus}`, order: updatedOrder });
  } catch (err) {
    console.error('Error in inventory handoff:', err);
    res.status(500).json({ error: err.message || 'Server error updating inventory handoff.' });
  }
};

// Update Delivery Status (Delivery Guy)
exports.updateDeliveryStatus = async (req, res) => {
  let client;
  try {
    const { order_id } = req.params;
    const {
      status: inputStatus,
      outcome_key,
      delivery_outcome: inputDeliveryOutcome,
      collection_outcome: inputCollectionOutcome,
      delivered_items_amount,
      returned_items_amount,
      returned_quantity,
      return_notes,
      failure_reason,
      cash_amount,
      payment_amount,
      payment_method
    } = req.body;

    let outcomeObj = null;
    if (outcome_key) {
      outcomeObj = getOutcomeByKey(outcome_key);
    } else if (inputDeliveryOutcome && inputCollectionOutcome) {
      outcomeObj = findOutcome(inputDeliveryOutcome, inputCollectionOutcome);
    }

    let status = inputStatus;
    if (!status && outcomeObj) {
      status = outcomeObj.status;
    }
    if (!status) {
      status = 'delivered';
    }

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

    const deliveryOutcome   = outcomeObj ? outcomeObj.delivery_outcome : (inputDeliveryOutcome || (status === 'delivered' ? 'full' : 'none'));
    const collectionOutcome = outcomeObj ? outcomeObj.collection_outcome : (inputCollectionOutcome || (status === 'delivered' ? 'cash_full' : 'none'));

    const orderTotalAmount = parseFloat(order.order_amount || 0);
    let delAmount = delivered_items_amount !== undefined && delivered_items_amount !== null
      ? parseFloat(delivered_items_amount)
      : (deliveryOutcome === 'full' ? orderTotalAmount : 0.00);

    let retAmount = returned_items_amount !== undefined && returned_items_amount !== null
      ? parseFloat(returned_items_amount)
      : (deliveryOutcome === 'partial' ? Math.max(0, orderTotalAmount - delAmount) : (deliveryOutcome === 'none' ? orderTotalAmount : 0.00));

    if (deliveryOutcome === 'partial' && delAmount + retAmount === 0) {
      if (cash_amount || payment_amount) {
        delAmount = parseFloat(cash_amount || payment_amount);
        retAmount = Math.max(0, orderTotalAmount - delAmount);
      }
    }

    const isDelivered = (status === 'delivered');

    // Calculate collection amount if outcome requires payment or payment amounts passed
    let paymentToRecord = 0.00;
    if (payment_amount !== undefined && payment_amount !== null && parseFloat(payment_amount) > 0) {
      paymentToRecord = parseFloat(payment_amount);
    } else if (cash_amount !== undefined && cash_amount !== null && parseFloat(cash_amount) > 0) {
      paymentToRecord = parseFloat(cash_amount);
    } else if (collectionOutcome === 'cash_full' || collectionOutcome === 'transfer_full') {
      paymentToRecord = orderTotalAmount;
    } else if (collectionOutcome === 'cash_partial' || collectionOutcome === 'transfer_partial') {
      paymentToRecord = delAmount > 0 ? delAmount : orderTotalAmount;
    } else if (collectionOutcome === 'shipping_fee_only') {
      paymentToRecord = 50.00; // default shipping fee
    }

    let pMethod = payment_method || (outcomeObj ? outcomeObj.payment_method : 'cash');
    if (pMethod === 'none' || !pMethod) pMethod = 'cash';

    const updateRes = await client.query(
      `UPDATE orders
       SET status = $1,
           delivery_outcome = $2,
           collection_outcome = $3,
           delivered_items_amount = $4,
           returned_items_amount = $5,
           returned_quantity = $6,
           return_notes = $7,
           delivery_failure_reason = $8,
           delivered_at = CASE WHEN $10 = true THEN NOW() ELSE delivered_at END,
           updated_at = NOW()
       WHERE id = $9 RETURNING *`,
      [
        status,
        deliveryOutcome,
        collectionOutcome,
        delAmount,
        retAmount,
        parseInt(returned_quantity) || 0,
        return_notes || null,
        failure_reason || null,
        order_id,
        isDelivered
      ]
    );

    const updatedOrder = updateRes.rows[0];

    // Trigger Prompt 1 order_payments recording if collection outcome involves an amount > 0
    if (paymentToRecord > 0 && collectionOutcome !== 'none') {
      const existingPayments = await client.query(
        `SELECT COALESCE(SUM(amount), 0.00) as total
         FROM order_payments
         WHERE order_id = $1 AND confirmation_status IN ('confirmed', 'pending_finance_review')`,
        [order_id]
      );
      const recordedSum = parseFloat(existingPayments.rows[0]?.total || 0);

      if (recordedSum < paymentToRecord) {
        const deltaAmount = paymentToRecord - recordedSum;
        await client.query(
          `INSERT INTO order_payments (order_id, amount, payment_method, recorded_by, confirmation_status)
           VALUES ($1, $2, $3, $4, 'pending_finance_review')`,
          [order_id, deltaAmount, pMethod, req.user.id]
        );
      }
    }

    // Prompt 3: Auto-create return record when delivery outcome indicates returned portion
    if (retAmount > 0 || ['partial', 'none', 'not_shipped'].includes(deliveryOutcome)) {
      const existingReturn = await client.query(
        `SELECT id FROM returns WHERE order_id = $1 AND status IN ('pending_pickup', 'pending_verification')`,
        [order_id]
      );
      if (existingReturn.rows.length === 0) {
        const rType = deliveryOutcome === 'partial' ? 'partial' : 'full';
        const rReason = return_notes || failure_reason || (outcomeObj ? outcomeObj.label_ar : `Automatic return created from ${deliveryOutcome} outcome`);
        await client.query(
          `INSERT INTO returns (order_id, initiated_by, return_type, reason, status, returned_items_amount, returned_quantity)
           VALUES ($1, $2, $3, $4, 'pending_verification', $5, $6)`,
          [order_id, req.user.id, rType, rReason, retAmount, parseInt(returned_quantity) || 0]
        );
      }
    }

    const commentText = outcomeObj
      ? `${outcomeObj.label_ar} (${outcomeObj.label_en})`
      : (failure_reason || `Delivery status changed to ${status}`);

    await client.query(
      `INSERT INTO order_status_history (order_id, old_status, new_status, changed_by, comment)
       VALUES ($1, $2, $3, $4, $5)`,
      [order_id, oldStatus, status, req.user.id, commentText]
    );

    await client.query('COMMIT');
    client.release();

    const io = req.app.get('io');
    if (io) {
      io.emit('status_changed', { order_id, oldStatus, newStatus: status, delivery_outcome: deliveryOutcome, collection_outcome: collectionOutcome });
      io.emit('wallet_updated', { delivery_guy_id: req.user.id });
    }

    res.json({
      message: `Delivery status updated to ${status}`,
      order: updatedOrder,
      outcome: outcomeObj
    });
  } catch (err) {
    if (client) {
      try { await client.query('ROLLBACK'); } catch (_) {}
      client.release();
    }
    console.error('Error updating delivery status:', err);
    res.status(500).json({ error: err.message || 'Server error updating delivery status.' });
  }
};

// Get Orders for Delivery Guy
exports.getDeliveryGuyOrders = async (req, res) => {
  try {
    const result = await db.query(
      `SELECT o.*, s.name as supervisor_name,
              COALESCE((SELECT SUM(amount) FROM order_payments WHERE order_id = o.id AND confirmation_status = 'confirmed'), 0.00) as confirmed_paid,
              COALESCE((SELECT SUM(amount) FROM order_payments WHERE order_id = o.id AND confirmation_status = 'pending_finance_review'), 0.00) as pending_paid,
              GREATEST(0, CAST(o.order_amount AS NUMERIC) - COALESCE((SELECT SUM(amount) FROM order_payments WHERE order_id = o.id AND confirmation_status = 'confirmed'), 0.00)) as outstanding_balance
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
      `SELECT o.*, s.name as supervisor_name, d.name as delivery_guy_name, d.online_status as delivery_guy_status,
              COALESCE((SELECT SUM(amount) FROM order_payments WHERE order_id = o.id AND confirmation_status = 'confirmed'), 0.00) as confirmed_paid,
              COALESCE((SELECT SUM(amount) FROM order_payments WHERE order_id = o.id AND confirmation_status = 'pending_finance_review'), 0.00) as pending_paid,
              GREATEST(0, CAST(o.order_amount AS NUMERIC) - COALESCE((SELECT SUM(amount) FROM order_payments WHERE order_id = o.id AND confirmation_status = 'confirmed'), 0.00)) as outstanding_balance
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
              h.name as inventory_handed_by_name,
              COALESCE((SELECT SUM(amount) FROM order_payments WHERE order_id = o.id AND confirmation_status = 'confirmed'), 0.00) as confirmed_paid,
              COALESCE((SELECT SUM(amount) FROM order_payments WHERE order_id = o.id AND confirmation_status = 'pending_finance_review'), 0.00) as pending_paid,
              GREATEST(0, CAST(o.order_amount AS NUMERIC) - COALESCE((SELECT SUM(amount) FROM order_payments WHERE order_id = o.id AND confirmation_status = 'confirmed'), 0.00)) as outstanding_balance
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

// Record Partial or Full Payment on Order (Delivery Guy en route, Finance, Supervisor)
exports.recordPayment = async (req, res) => {
  try {
    const { order_id } = req.params;
    const { amount, payment_method, proof_attachment_id } = req.body;

    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      return res.status(400).json({ error: 'Valid payment amount greater than zero is required.' });
    }

    const validMethods = ['cash', 'e_wallet', 'instapay', 'vodafone_cash', 'other'];
    const pMethod = payment_method && validMethods.includes(payment_method) ? payment_method : 'cash';

    const orderRes = await db.query('SELECT * FROM orders WHERE id = $1', [order_id]);
    if (orderRes.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found.' });
    }
    const order = orderRes.rows[0];

    // If delivery guy, check assigned order
    if (req.user.role === 'delivery_guy' && order.delivery_guy_id !== req.user.id) {
      return res.status(403).json({ error: 'This order is not assigned to you.' });
    }

    let attachmentId = proof_attachment_id || null;

    // Handle e-payment proof image upload if image string provided
    if (req.body.image && !attachmentId) {
      const { uploadToStorage } = require('../config/storage');
      const storageUrl = await uploadToStorage(req.body.image, `order-${order_id}-payment_confirmation`);
      const attRes = await db.query(
        `INSERT INTO order_attachments (order_id, stage, uploaded_by, is_required, storage_url)
         VALUES ($1, 'payment_confirmation', $2, true, $3)
         RETURNING id`,
        [order_id, req.user.id, storageUrl]
      );
      attachmentId = attRes.rows[0].id;
    }

    const insertRes = await db.query(
      `INSERT INTO order_payments (order_id, amount, payment_method, recorded_by, confirmation_status, proof_attachment_id)
       VALUES ($1, $2, $3, $4, 'pending_finance_review', $5)
       RETURNING *`,
      [order_id, numAmount, pMethod, req.user.id, attachmentId]
    );

    const newPayment = insertRes.rows[0];

    // Fetch updated balance summary
    const summaryRes = await db.query(
      `SELECT
         COALESCE(SUM(CASE WHEN confirmation_status = 'confirmed' THEN amount ELSE 0 END), 0.00) as confirmed_total,
         COALESCE(SUM(CASE WHEN confirmation_status = 'pending_finance_review' THEN amount ELSE 0 END), 0.00) as pending_total
       FROM order_payments
       WHERE order_id = $1`,
      [order_id]
    );

    const confirmedTotal = parseFloat(summaryRes.rows[0].confirmed_total);
    const pendingTotal   = parseFloat(summaryRes.rows[0].pending_total);
    const orderAmount    = parseFloat(order.order_amount);
    const outstanding    = Math.max(0, orderAmount - confirmedTotal);

    const io = req.app.get('io');
    if (io) {
      io.emit('payment_recorded', { order_id, payment: newPayment });
    }

    res.status(201).json({
      message: 'Payment recorded successfully and submitted for Finance confirmation.',
      payment: newPayment,
      summary: {
        order_amount: orderAmount,
        confirmed_total: confirmedTotal,
        pending_total: pendingTotal,
        outstanding_balance: outstanding
      }
    });
  } catch (err) {
    console.error('Error recording payment:', err);
    res.status(500).json({ error: err.message || 'Server error recording payment.' });
  }
};

// Get all payment records for an order
exports.getOrderPayments = async (req, res) => {
  try {
    const { order_id } = req.params;

    const orderRes = await db.query('SELECT * FROM orders WHERE id = $1', [order_id]);
    if (orderRes.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found.' });
    }
    const order = orderRes.rows[0];

    const paymentsRes = await db.query(
      `SELECT p.*,
              u.name as recorded_by_name, u.role as recorded_by_role,
              c.name as confirmed_by_name
       FROM order_payments p
       LEFT JOIN users u ON p.recorded_by = u.id
       LEFT JOIN users c ON p.confirmed_by = c.id
       WHERE p.order_id = $1
       ORDER BY p.paid_at DESC`,
      [order_id]
    );

    const summaryRes = await db.query(
      `SELECT
         COALESCE(SUM(CASE WHEN confirmation_status = 'confirmed' THEN amount ELSE 0 END), 0.00) as confirmed_total,
         COALESCE(SUM(CASE WHEN confirmation_status = 'pending_finance_review' THEN amount ELSE 0 END), 0.00) as pending_total
       FROM order_payments
       WHERE order_id = $1`,
      [order_id]
    );

    const confirmedTotal = parseFloat(summaryRes.rows[0]?.confirmed_total || 0);
    const pendingTotal   = parseFloat(summaryRes.rows[0]?.pending_total || 0);
    const orderAmount    = parseFloat(order.order_amount);
    const outstanding    = Math.max(0, orderAmount - confirmedTotal);

    res.json({
      order_id,
      order_amount: orderAmount,
      payment_type: order.payment_type || 'pay_after_delivery',
      confirmed_total: confirmedTotal,
      pending_total: pendingTotal,
      outstanding_balance: outstanding,
      payments: paymentsRes.rows
    });
  } catch (err) {
    console.error('Error fetching order payments:', err);
    res.status(500).json({ error: err.message || 'Server error fetching payments.' });
  }
};
