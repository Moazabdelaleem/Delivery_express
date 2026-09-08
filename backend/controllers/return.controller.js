const db = require('../config/db');
const { sendPushNotification, sendPushToRole } = require('../utils/pushNotifier');

// ─── helpers ─────────────────────────────────────────────────────────────────

async function executeAgreedAction(returnRec, vote, io, bufferEvent) {
  const { id: return_id, order_id, reassign_driver_id } = returnRec;

  // Fetch original order details for the follow-up order creation
  const orderRes = await db.query('SELECT * FROM orders WHERE id = $1', [order_id]);
  const order = orderRes.rows[0];

  if (vote === 'kill') {
    await db.query(
      `UPDATE returns SET status = 'cancelled', updated_at = NOW() WHERE id = $1`,
      [return_id]
    );
    await db.query(
      `UPDATE orders SET items_resolution = 'cancelled', updated_at = NOW() WHERE id = $1`,
      [order_id]
    );
    await db.query(
      `INSERT INTO order_status_history (order_id, old_status, new_status, changed_by, comment)
       VALUES ($1, $2, $2, $3, $4)`,
      [order_id, order.status, null, 'Both parties agreed: remaining items cancelled']
    );
    if (io) {
      io.to('role_supervisor').to('role_inventory').to('role_manager').to('role_finance')
        .emit('return_updated', { return_id, order_id, status: 'cancelled' });
      if (order.delivery_guy_id) {
        io.to(`user_${order.delivery_guy_id}`).emit('return_resolved', { return_id, order_id, action: 'kill' });
      }
    }
    // Notify driver
    if (order.delivery_guy_id) {
      sendPushNotification(
        order.delivery_guy_id,
        '✅ Return Closed',
        `Order #${order.tracking_number} — remaining items have been cancelled. No further action needed.`,
        { order_id, return_id, action: 'kill' }
      );
    }
    sendPushToRole('finance',
      '📋 Partial Order Closed',
      `Remaining items for order #${order.tracking_number} were cancelled. Check outstanding cash liability if any.`,
      { order_id }
    );
  } else if (vote === 'reassign') {
    // Create follow-up order
    const followupRes = await db.query(
      `INSERT INTO orders
         (supervisor_id, delivery_guy_id, client_name, client_phone, client_address,
          order_details, order_amount, payment_type, tracking_number, status, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'assigned',$10)
       RETURNING *`,
      [
        order.supervisor_id,
        reassign_driver_id || order.delivery_guy_id,
        order.client_name,
        order.client_phone,
        order.client_address,
        order.order_details,
        order.returned_items_amount || order.order_amount,
        order.payment_type,
        `${order.tracking_number}-R`,   // e.g. TRK-1651-R
        order.notes ? `[Follow-up for #${order.tracking_number}] ${order.notes}` : `Follow-up for #${order.tracking_number}`
      ]
    );
    const followupOrder = followupRes.rows[0];

    await db.query(
      `UPDATE returns SET status = 'reassigned', updated_at = NOW() WHERE id = $1`,
      [return_id]
    );
    await db.query(
      `UPDATE orders
       SET items_resolution = 'reassigned', followup_order_id = $1, updated_at = NOW()
       WHERE id = $2`,
      [followupOrder.id, order_id]
    );
    await db.query(
      `INSERT INTO order_status_history (order_id, old_status, new_status, changed_by, comment)
       VALUES ($1, $2, 'assigned', $3, $4)`,
      [followupOrder.id, 'assigned', reassign_driver_id || order.delivery_guy_id,
       `Follow-up order created from partial return of #${order.tracking_number}`]
    );

    if (io) {
      io.to('role_supervisor').to('role_inventory').to('role_manager').to('role_finance')
        .emit('return_updated', { return_id, order_id, status: 'reassigned', followup_order_id: followupOrder.id });
      const driverId = reassign_driver_id || order.delivery_guy_id;
      if (driverId) {
        const payload = { order_id: followupOrder.id, tracking_number: followupOrder.tracking_number };
        io.to(`user_${driverId}`).emit('order_assigned', payload);
        if (bufferEvent) bufferEvent(driverId, 'order_assigned', payload);
      }
    }
    // Notify driver of new order
    const driverId = reassign_driver_id || order.delivery_guy_id;
    if (driverId) {
      sendPushNotification(
        driverId,
        '📦 New Delivery Assigned',
        `Follow-up order #${followupOrder.tracking_number} — ${order.client_address}`,
        { order_id: followupOrder.id, tracking_number: followupOrder.tracking_number }
      );
    }
    sendPushToRole('finance',
      '🔄 Follow-up Order Created',
      `Partial return from #${order.tracking_number} reassigned as new order #${followupOrder.tracking_number}.`,
      { order_id: followupOrder.id }
    );
  }
}

// ─── Initiate a Return (Supervisor or System) ─────────────────────────────────

exports.createReturn = async (req, res) => {
  try {
    const { order_id, return_type, reason, returned_items_amount, returned_quantity } = req.body;

    if (!order_id) return res.status(400).json({ error: 'Order ID is required.' });
    if (!return_type || !['full', 'partial'].includes(return_type))
      return res.status(400).json({ error: "Return type must be 'full' or 'partial'." });
    if (!reason || !reason.trim())
      return res.status(400).json({ error: 'Reason is required for initiating a return.' });

    const orderRes = await db.query('SELECT * FROM orders WHERE id = $1', [order_id]);
    if (orderRes.rows.length === 0) return res.status(404).json({ error: 'Order not found.' });

    const order = orderRes.rows[0];
    const orderTotal = parseFloat(order.order_amount || 0);
    let retAmt = parseFloat(returned_items_amount || 0);
    if (return_type === 'full') retAmt = orderTotal;
    else if (retAmt <= 0) { retAmt = parseFloat(order.returned_items_amount || 0); if (retAmt <= 0) retAmt = orderTotal; }

    const insertRes = await db.query(
      `INSERT INTO returns (order_id, initiated_by, return_type, reason, status, returned_items_amount, returned_quantity)
       VALUES ($1,$2,$3,$4,'pending_pickup',$5,$6) RETURNING *`,
      [order_id, req.user.id, return_type, reason.trim(), retAmt,
       parseInt(returned_quantity) || parseInt(order.returned_quantity || 0)]
    );

    await db.query(
      `INSERT INTO order_status_history (order_id, old_status, new_status, changed_by, comment)
       VALUES ($1,$2,$2,$3,$4)`,
      [order_id, order.status, req.user.id, `Return initiated (${return_type}): ${reason.trim()}`]
    );

    const io = req.app.get('io');
    if (io) {
      const payload = { return_id: insertRes.rows[0].id, order_id, status: 'pending_pickup' };
      io.to('role_inventory').to('role_supervisor').to('role_manager').emit('return_updated', payload);
      if (order.delivery_guy_id) io.to(`user_${order.delivery_guy_id}`).emit('return_updated', payload);
    }

    if (order.delivery_guy_id) {
      sendPushNotification(
        order.delivery_guy_id,
        '🔄 Return to Warehouse',
        `Order #${order.tracking_number} — please bring the items back to the warehouse.`,
        { order_id, return_id: insertRes.rows[0].id, type: 'return_pickup' }
      );
    }
    sendPushToRole('inventory',
      '📦 Incoming Return',
      `${return_type === 'full' ? 'Full' : 'Partial'} return incoming for order #${order.tracking_number}. Reason: ${reason.trim()}`,
      { order_id, return_id: insertRes.rows[0].id }
    );

    res.status(201).json({ message: 'Return initiated successfully', return_record: insertRes.rows[0] });
  } catch (err) {
    console.error('Error creating return:', err);
    res.status(500).json({ error: err.message || 'Server error creating return.' });
  }
};

// ─── Driver: marks they are heading back to warehouse ─────────────────────────

exports.transitBack = async (req, res) => {
  try {
    const { return_id } = req.params;

    const returnRes = await db.query(
      `SELECT r.*, o.tracking_number, o.delivery_guy_id
       FROM returns r JOIN orders o ON r.order_id = o.id
       WHERE r.id = $1`,
      [return_id]
    );
    if (returnRes.rows.length === 0) return res.status(404).json({ error: 'Return not found.' });

    const ret = returnRes.rows[0];
    if (ret.delivery_guy_id !== req.user.id)
      return res.status(403).json({ error: 'This return is not assigned to you.' });
    if (ret.status !== 'pending_pickup')
      return res.status(400).json({ error: `Cannot transit from status '${ret.status}'. Must be 'pending_pickup'.` });

    await db.query(
      `UPDATE returns SET status = 'in_transit_back', updated_at = NOW() WHERE id = $1`,
      [return_id]
    );

    const io = req.app.get('io');
    if (io) {
      const payload = { return_id, order_id: ret.order_id, status: 'in_transit_back' };
      io.to('role_inventory').to('role_supervisor').to('role_manager').emit('return_updated', payload);
    }

    sendPushToRole('inventory',
      '🚗 Driver Heading Back',
      `Driver is on the way back to the warehouse with items for order #${ret.tracking_number}.`,
      { order_id: ret.order_id, return_id }
    );

    res.json({ message: 'Return marked as in transit back to warehouse.' });
  } catch (err) {
    console.error('Error in transitBack:', err);
    res.status(500).json({ error: err.message || 'Server error.' });
  }
};

// ─── Inventory: physically receives items at warehouse ────────────────────────

exports.receiveItems = async (req, res) => {
  try {
    const { return_id } = req.params;

    const returnRes = await db.query(
      `SELECT r.*, o.tracking_number FROM returns r JOIN orders o ON r.order_id = o.id WHERE r.id = $1`,
      [return_id]
    );
    if (returnRes.rows.length === 0) return res.status(404).json({ error: 'Return not found.' });

    const ret = returnRes.rows[0];
    if (!['in_transit_back', 'pending_pickup'].includes(ret.status))
      return res.status(400).json({ error: `Cannot receive from status '${ret.status}'.` });

    await db.query(
      `UPDATE returns SET status = 'pending_verification', updated_at = NOW() WHERE id = $1`,
      [return_id]
    );
    await db.query(
      `UPDATE orders SET items_resolution = 'received', updated_at = NOW() WHERE id = $1`,
      [ret.order_id]
    );

    const io = req.app.get('io');
    if (io) {
      const payload = { return_id, order_id: ret.order_id, status: 'pending_verification' };
      io.to('role_inventory').to('role_supervisor').to('role_manager').emit('return_updated', payload);
    }

    sendPushToRole('supervisor',
      '📦 Items Back at Warehouse',
      `Return for order #${ret.tracking_number} received. Please coordinate with Inventory on next steps.`,
      { order_id: ret.order_id, return_id }
    );
    sendPushToRole('inventory',
      '✅ Items Received — Vote Required',
      `Items for #${ret.tracking_number} are now in the warehouse. Vote: Kill or Reassign.`,
      { order_id: ret.order_id, return_id }
    );

    res.json({ message: 'Items received at warehouse. Awaiting Kill/Reassign decision from both parties.' });
  } catch (err) {
    console.error('Error in receiveItems:', err);
    res.status(500).json({ error: err.message || 'Server error.' });
  }
};

// ─── Supervisor / Inventory: cast vote (kill | reassign) ─────────────────────

exports.castVote = async (req, res) => {
  try {
    const { return_id } = req.params;
    const { vote, driver_id } = req.body;

    if (!['kill', 'reassign'].includes(vote))
      return res.status(400).json({ error: "Vote must be 'kill' or 'reassign'." });
    if (vote === 'reassign' && !driver_id)
      return res.status(400).json({ error: 'driver_id is required when voting reassign.' });

    const returnRes = await db.query(
      `SELECT r.*, o.tracking_number, o.delivery_guy_id
       FROM returns r JOIN orders o ON r.order_id = o.id
       WHERE r.id = $1`,
      [return_id]
    );
    if (returnRes.rows.length === 0) return res.status(404).json({ error: 'Return not found.' });

    const ret = returnRes.rows[0];
    const allowedStatuses = ['pending_verification', 'awaiting_second_vote', 'vote_conflict'];
    if (!allowedStatuses.includes(ret.status))
      return res.status(400).json({ error: `Cannot vote on a return with status '${ret.status}'.` });

    const role = req.user.role;
    const voteField = role === 'inventory' ? 'inventory_vote' : 'supervisor_vote';
    const otherVoteField = role === 'inventory' ? 'supervisor_vote' : 'inventory_vote';

    // Save this party's vote
    const updatedRes = await db.query(
      `UPDATE returns
       SET ${voteField} = $1,
           reassign_driver_id = CASE WHEN $2::int IS NOT NULL THEN $2::int ELSE reassign_driver_id END,
           updated_at = NOW()
       WHERE id = $3 RETURNING *`,
      [vote, vote === 'reassign' ? (driver_id || ret.delivery_guy_id) : null, return_id]
    );
    const updatedRet = updatedRes.rows[0];

    const myVote = vote;
    const theirVote = updatedRet[otherVoteField];

    // Both have voted
    if (myVote && theirVote) {
      if (myVote === theirVote) {
        // ✅ Agreement — execute the action
        const io = req.app.get('io');
        const bufferEvent = req.app.get('bufferEvent');
        await executeAgreedAction(updatedRet, myVote, io, bufferEvent);
        return res.json({
          message: `Both parties agreed: ${myVote}. Action executed.`,
          action: myVote
        });
      } else {
        // ⚠️ Conflict
        await db.query(
          `UPDATE returns SET status = 'vote_conflict', updated_at = NOW() WHERE id = $1`,
          [return_id]
        );
        const io = req.app.get('io');
        if (io) {
          io.to('role_inventory').to('role_supervisor').to('role_manager')
            .emit('return_updated', { return_id, order_id: ret.order_id, status: 'vote_conflict' });
        }
        sendPushToRole('inventory',
          '⚠️ Decision Conflict',
          `Order #${ret.tracking_number}: Inventory and Supervisor disagree — please align.`,
          { return_id, order_id: ret.order_id }
        );
        sendPushToRole('supervisor',
          '⚠️ Decision Conflict',
          `Order #${ret.tracking_number}: Inventory and Supervisor disagree — please align.`,
          { return_id, order_id: ret.order_id }
        );
        return res.json({
          message: 'Vote recorded but parties disagree. Both will be notified to align.',
          conflict: true,
          inventory_vote: updatedRet.inventory_vote,
          supervisor_vote: updatedRet.supervisor_vote
        });
      }
    }

    // Only one vote so far — waiting for the other party
    await db.query(
      `UPDATE returns SET status = 'awaiting_second_vote', updated_at = NOW() WHERE id = $1`,
      [return_id]
    );
    const io = req.app.get('io');
    if (io) {
      io.to('role_inventory').to('role_supervisor').to('role_manager')
        .emit('return_updated', { return_id, order_id: ret.order_id, status: 'awaiting_second_vote' });
    }

    const otherRoleLabel = role === 'inventory' ? 'Supervisor' : 'Inventory';
    const otherRole = role === 'inventory' ? 'supervisor' : 'inventory';
    sendPushToRole(otherRole,
      '🗳️ Your Vote Needed',
      `Order #${ret.tracking_number}: ${role === 'inventory' ? 'Inventory' : 'Supervisor'} voted "${vote}". Your input is needed to proceed.`,
      { return_id, order_id: ret.order_id }
    );

    res.json({
      message: `Vote recorded (${vote}). Waiting for ${otherRoleLabel}'s vote.`,
      your_vote: vote,
      waiting_for: otherRoleLabel
    });
  } catch (err) {
    console.error('Error in castVote:', err);
    res.status(500).json({ error: err.message || 'Server error.' });
  }
};

// ─── Verify Return — legacy endpoint (kept for backward compat) ───────────────

exports.verifyReturn = async (req, res) => {
  try {
    const { return_id } = req.params;
    const { status, notes } = req.body;

    if (!['verified', 'rejected'].includes(status))
      return res.status(400).json({ error: "Verification status must be 'verified' or 'rejected'." });

    const returnRes = await db.query(
      `SELECT r.*, o.status as current_order_status, o.tracking_number, o.delivery_guy_id
       FROM returns r JOIN orders o ON r.order_id = o.id WHERE r.id = $1`,
      [return_id]
    );
    if (returnRes.rows.length === 0) return res.status(404).json({ error: 'Return record not found.' });

    const returnRec = returnRes.rows[0];
    if (!['pending_pickup', 'pending_verification'].includes(returnRec.status))
      return res.status(400).json({ error: `Return is already '${returnRec.status}' and cannot be re-verified.` });

    const updateRes = await db.query(
      `UPDATE returns SET status = $1, verified_by = $2, verified_at = NOW() WHERE id = $3 RETURNING *`,
      [status, req.user.id, return_id]
    );

    if (status === 'verified') {
      await db.query(
        `UPDATE orders SET status = 'returned_to_company', updated_at = NOW() WHERE id = $1`,
        [returnRec.order_id]
      );
      await db.query(
        `INSERT INTO order_status_history (order_id, old_status, new_status, changed_by, comment)
         VALUES ($1,$2,'returned_to_company',$3,$4)`,
        [returnRec.order_id, returnRec.current_order_status || 'delivery_failed', req.user.id,
         `Inventory verified return (${returnRec.return_type}): ${notes || 'Return physically verified in warehouse'}`]
      );
    } else {
      await db.query(
        `INSERT INTO order_status_history (order_id, old_status, new_status, changed_by, comment)
         VALUES ($1,$2,$2,$3,$4)`,
        [returnRec.order_id, returnRec.current_order_status || 'delivery_failed', req.user.id,
         `Inventory rejected return verification: ${notes || 'Return rejected'}`]
      );
    }

    const io = req.app.get('io');
    if (io) {
      const verifyPayload = { return_id, order_id: returnRec.order_id, status };
      io.to('role_supervisor').to('role_manager').emit('return_updated', verifyPayload);
      if (returnRec.delivery_guy_id) io.to(`user_${returnRec.delivery_guy_id}`).emit('return_updated', verifyPayload);
    }

    if (returnRec.delivery_guy_id) {
      sendPushNotification(
        returnRec.delivery_guy_id,
        status === 'verified' ? '✅ Return Accepted' : '❌ Return Rejected',
        status === 'verified'
          ? `Your return for order #${returnRec.tracking_number} was verified.`
          : `Your return for order #${returnRec.tracking_number} was rejected. ${notes ? 'Note: ' + notes : ''}`,
        { order_id: returnRec.order_id, return_id, status }
      );
    }
    if (status === 'verified') {
      sendPushToRole('supervisor', '🔄 Return Verified',
        `Order #${returnRec.tracking_number} has been returned to warehouse and verified.`,
        { order_id: returnRec.order_id, return_id }
      );
    }

    res.json({ message: `Return record ${status} successfully.`, return_record: updateRes.rows[0] });
  } catch (err) {
    console.error('Error verifying return:', err);
    res.status(500).json({ error: err.message || 'Server error verifying return.' });
  }
};

// ─── Get Returns Queue ────────────────────────────────────────────────────────

exports.getReturnsQueue = async (req, res) => {
  try {
    const { status } = req.query;

    let queryStr = `
      SELECT r.*,
             o.tracking_number, o.client_address, o.order_amount,
             o.delivery_outcome, o.collection_outcome,
             o.returned_items_amount, o.items_resolution,
             u_init.name as initiated_by_name, u_init.role as initiated_by_role,
             u_ver.name as verified_by_name,
             u_drv.name as driver_name, u_drv.phone as driver_phone,
             u_rd.name as reassign_driver_name
      FROM returns r
      JOIN orders o ON r.order_id = o.id
      JOIN users u_init ON r.initiated_by = u_init.id
      LEFT JOIN users u_ver ON r.verified_by = u_ver.id
      LEFT JOIN users u_drv ON o.delivery_guy_id = u_drv.id
      LEFT JOIN users u_rd ON r.reassign_driver_id = u_rd.id
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

// ─── Get Driver Return Pickups ────────────────────────────────────────────────

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
       WHERE o.delivery_guy_id = $1
         AND r.status IN ('pending_pickup','in_transit_back','pending_verification','awaiting_second_vote','vote_conflict')
       ORDER BY r.created_at DESC`,
      [driverId]
    );

    res.json({ return_pickups: result.rows });
  } catch (err) {
    console.error('Error fetching driver return pickups:', err);
    res.status(500).json({ error: err.message || 'Server error fetching driver return pickups.' });
  }
};
