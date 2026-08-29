const ioClient = require('socket.io-client');
const path = require('path');
const { pool } = require('../config/db');

const API_BASE = 'http://localhost:5000/api';
const SOCKET_URL = 'http://localhost:5000';

function formatLog(status, scenarioName, detail) {
  const statusStr = status ? '[PASS]' : '[FAIL]';
  console.log(`${statusStr} ${scenarioName}`);
  if (detail) console.log(`       Detail: ${detail}`);
}

async function loginUser(username, password) {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Login failed for ${username}: ${data.error || res.statusText}`);
  }
  return { token: data.token, user: data.user };
}

function waitForEvent(socket, eventName, timeoutMs = 1000) {
  return new Promise((resolve) => {
    let timer = null;

    const listener = (data) => {
      clearTimeout(timer);
      socket.off(eventName, listener);
      resolve({ received: true, eventName, payload: data });
    };

    socket.on(eventName, listener);

    timer = setTimeout(() => {
      socket.off(eventName, listener);
      resolve({ received: false, eventName, payload: null });
    }, timeoutMs);
  });
}

async function runNotificationsTest() {
  console.log('======================================================================');
  console.log('STARTING AUTOMATED SOCKET.IO NOTIFICATION SYSTEM INTEGRATION TEST');
  console.log('======================================================================\n');

  let driverSocket = null;
  let supervisorSocket = null;
  let financeSocket = null;
  const createdOrderIds = [];

  try {
    // 0. Authenticate Seed Users
    console.log('--- Step 0: Authenticating Seed Accounts & Initializing Sockets ---');
    const driverAuth = await loginUser('sami_delivery', 'Admin123!');
    const supervisorAuth = await loginUser('kareem_supervisor', 'Admin123!');
    const inventoryAuth = await loginUser('hassan_inventory', 'Admin123!');
    const financeAuth = await loginUser('mona_finance', 'Admin123!');

    console.log(`Authenticated Driver: ${driverAuth.user.name} (${driverAuth.user.id})`);
    console.log(`Authenticated Supervisor: ${supervisorAuth.user.name} (${supervisorAuth.user.id})`);
    console.log(`Authenticated Inventory: ${inventoryAuth.user.name} (${inventoryAuth.user.id})`);
    console.log(`Authenticated Finance: ${financeAuth.user.name} (${financeAuth.user.id})`);

    // Connect Socket Clients
    driverSocket = ioClient(SOCKET_URL, { transports: ['websocket', 'polling'], forceNew: true, auth: { token: driverAuth.token }, query: { userId: driverAuth.user.id } });
    supervisorSocket = ioClient(SOCKET_URL, { transports: ['websocket', 'polling'], forceNew: true, auth: { token: supervisorAuth.token }, query: { userId: supervisorAuth.user.id } });
    financeSocket = ioClient(SOCKET_URL, { transports: ['websocket', 'polling'], forceNew: true, auth: { token: financeAuth.token }, query: { userId: financeAuth.user.id } });

    await Promise.all([
      new Promise((res) => driverSocket.on('connect', res)),
      new Promise((res) => supervisorSocket.on('connect', res)),
      new Promise((res) => financeSocket.on('connect', res))
    ]);

    console.log('Sockets connected successfully.\n');

    // ======================================================================
    // SCENARIO 1: Order Assignment
    // ======================================================================
    console.log('--- Scenario 1: Order Assignment (POST /api/orders) ---');
    const orderTracking1 = `TEST-NOTIF-${Date.now()}-1`;

    const eventPromise1 = waitForEvent(driverSocket, 'order_assigned', 500);
    const startTime1 = Date.now();

    const createRes1 = await fetch(`${API_BASE}/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${supervisorAuth.token}`
      },
      body: JSON.stringify({
        tracking_number: orderTracking1,
        client_address: '101 Test Road, Cairo',
        order_details: 'Test Item S1',
        order_amount: 200.00,
        delivery_guy_id: driverAuth.user.id
      })
    });

    const createData1 = await createRes1.json();
    const httpDuration1 = Date.now() - startTime1;
    if (createData1.order) createdOrderIds.push(createData1.order.id);

    const eventResult1 = await eventPromise1;
    const totalDuration1 = Date.now() - startTime1;

    if (eventResult1.received) {
      formatLog(true, 'Scenario 1: Order Assignment Socket Event',
        `Event: 'order_assigned', Latency: ${totalDuration1 - httpDuration1}ms, Payload: ${JSON.stringify(eventResult1.payload)}`
      );
    } else {
      formatLog(false, 'Scenario 1: Order Assignment Socket Event',
        `HTTP POST returned 201 Created in ${httpDuration1}ms, but no 'order_assigned' socket event was emitted by backend controller within 500ms.`
      );
    }

    const testOrderId = createData1.order ? createData1.order.id : null;

    // ======================================================================
    // SCENARIO 2: Status Change on Handoff
    // ======================================================================
    console.log('\n--- Scenario 2: Status Change on Handoff (PUT /api/orders/:id/handoff) ---');
    if (testOrderId) {
      // First attach mandatory photo attachment for warehouse handoff guard
      await pool.query(
        `INSERT INTO order_attachments (order_id, stage, uploaded_by, is_required, storage_url)
         VALUES ($1, 'inventory_handoff', $2, true, 'http://example.com/proof.jpg')`,
        [testOrderId, supervisorAuth.user.id]
      );

      const driverHandoffPromise = waitForEvent(driverSocket, 'status_changed', 2000);
      const superHandoffPromise = waitForEvent(supervisorSocket, 'status_changed', 2000);

      const startTime2 = Date.now();

      const handoffRes = await fetch(`${API_BASE}/orders/${testOrderId}/handoff`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${inventoryAuth.token}`
        },
        body: JSON.stringify({ handed_over: true, note: 'Handoff test note' })
      });

      const handoffData = await handoffRes.json();
      const httpDuration2 = Date.now() - startTime2;

      const [driverRes2, superRes2] = await Promise.all([driverHandoffPromise, superHandoffPromise]);
      const totalDuration2 = Date.now() - startTime2;

      if (driverRes2.received || superRes2.received) {
        formatLog(true, 'Scenario 2: Status Change on Handoff Socket Event',
          `Event: 'status_changed', Latency: ${totalDuration2 - httpDuration2}ms, Payload: ${JSON.stringify(driverRes2.payload || superRes2.payload)}`
        );
      } else {
        formatLog(false, 'Scenario 2: Status Change on Handoff Socket Event',
          `HTTP PUT returned status 200 in ${httpDuration2}ms (status: ${handoffData.order?.status}), but no status-change socket event was emitted by backend controller.`
        );
      }
    } else {
      formatLog(false, 'Scenario 2: Status Change on Handoff', 'Skipped because order creation in Scenario 1 failed.');
    }

    // ======================================================================
    // SCENARIO 3: Delivery Outcome Status Change ONLY
    // ======================================================================
    console.log('\n--- Scenario 3: Delivery Outcome Status Change (PUT /api/orders/:id/delivery-status) ---');
    if (testOrderId) {
      // First update status to in_transit so valid predecessor check passes
      await fetch(`${API_BASE}/orders/${testOrderId}/delivery-status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${driverAuth.token}`
        },
        body: JSON.stringify({ status: 'in_transit' })
      });

      const superOutcomePromise = waitForEvent(supervisorSocket, 'status_changed', 2000);
      const startTime3 = Date.now();

      const statusRes = await fetch(`${API_BASE}/orders/${testOrderId}/delivery-status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${driverAuth.token}`
        },
        body: JSON.stringify({
          status: 'delivered',
          delivery_outcome: 'full',
          collection_outcome: 'cash_full',
          cash_amount: 200.00
        })
      });

      const statusData = await statusRes.json();
      const httpDuration3 = Date.now() - startTime3;

      const eventResult3 = await superOutcomePromise;
      const totalDuration3 = Date.now() - startTime3;

      if (eventResult3.received) {
        formatLog(true, 'Scenario 3: Delivery Outcome Status Change Event',
          `Event: '${eventResult3.eventName}', Latency: ${totalDuration3 - httpDuration3}ms, Payload: ${JSON.stringify(eventResult3.payload)}`
        );
      } else {
        formatLog(false, 'Scenario 3: Delivery Outcome Status Change Event',
          `HTTP PUT returned status 200 in ${httpDuration3}ms, but event 'status_changed' was not received within 500ms.`
        );
      }
    } else {
      formatLog(false, 'Scenario 3: Delivery Outcome Status Change', 'Skipped because order creation failed.');
    }

    // ======================================================================
    // SCENARIO 4: Payment Submission & Finance Clearance
    // ======================================================================
    console.log('\n--- Scenario 4: Payment Submission & Finance Clearance ---');
    let paymentId = null;

    if (testOrderId) {
      // Part A: Payment Submission
      const financePaymentPromise = waitForEvent(financeSocket, 'payment_recorded', 500);
      const startTime4a = Date.now();

      const payRes = await fetch(`${API_BASE}/orders/${testOrderId}/payments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${driverAuth.token}`
        },
        body: JSON.stringify({
          amount: 200.00,
          payment_method: 'cash'
        })
      });

      const payData = await payRes.json();
      const httpDuration4a = Date.now() - startTime4a;
      if (payData.payment) paymentId = payData.payment.id;

      const eventResult4a = await financePaymentPromise;
      const totalDuration4a = Date.now() - startTime4a;

      if (eventResult4a.received) {
        formatLog(true, 'Scenario 4a: Payment Submission Event',
          `Event: '${eventResult4a.eventName}', Latency: ${totalDuration4a - httpDuration4a}ms, Payload: ${JSON.stringify(eventResult4a.payload)}`
        );
      } else {
        formatLog(false, 'Scenario 4a: Payment Submission Event',
          `HTTP POST returned 201 in ${httpDuration4a}ms, but event 'payment_recorded' was not received within 500ms.`
        );
      }

      // Part B: Finance Confirmation
      if (paymentId) {
        const driverWalletPromise = waitForEvent(driverSocket, 'wallet_updated', 1000);
        const financeConfirmPromise = waitForEvent(financeSocket, 'payment_confirmed', 1000);
        const startTime4b = Date.now();

        const confirmRes = await fetch(`${API_BASE}/payments/${paymentId}/confirm`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${financeAuth.token}`
          }
        });

        const confirmData = await confirmRes.json();
        const httpDuration4b = Date.now() - startTime4b;

        const [driverWalletRes, financeConfirmRes] = await Promise.all([driverWalletPromise, financeConfirmPromise]);
        const totalDuration4b = Date.now() - startTime4b;

        const pass4b = driverWalletRes.received && financeConfirmRes.received;
        formatLog(pass4b, 'Scenario 4b: Finance Payment Confirmation Events',
          `Events Received: 'payment_confirmed' (${financeConfirmRes.received}), 'wallet_updated' (${driverWalletRes.received}), Latency: ${totalDuration4b - httpDuration4b}ms, Confirm Payload: ${JSON.stringify(financeConfirmRes.payload)}, Wallet Payload: ${JSON.stringify(driverWalletRes.payload)}`
        );
      } else {
        formatLog(false, 'Scenario 4b: Finance Confirmation', 'Skipped because payment creation in 4a failed.');
      }
    } else {
      formatLog(false, 'Scenario 4: Payment Submission & Finance Clearance', 'Skipped because order creation failed.');
    }

    // ======================================================================
    // SCENARIO 5: Clock-In & GPS Tracking Start
    // ======================================================================
    console.log('\n--- Scenario 5: Clock-In & GPS Tracking Start ---');

    const superClockPromise = waitForEvent(supervisorSocket, 'online_status_changed', 500);
    const superDriverClockPromise = waitForEvent(supervisorSocket, 'driver_clocked_in', 500);
    const startTime5 = Date.now();

    const clockInRes = await fetch(`${API_BASE}/shifts/clock-in`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${driverAuth.token}`
      },
      body: JSON.stringify({
        lat: 30.438020,
        lng: 31.157945
      })
    });

    const clockInData = await clockInRes.json();
    const httpDuration5 = Date.now() - startTime5;

    const [statusResult5, clockedInResult5] = await Promise.all([superClockPromise, superDriverClockPromise]);
    const totalDuration5 = Date.now() - startTime5;

    const pass5a = statusResult5.received && clockedInResult5.received;
    formatLog(pass5a, 'Scenario 5a: Clock-In Socket Events',
      `Events Received: 'online_status_changed' (${statusResult5.received}), 'driver_clocked_in' (${clockedInResult5.received}), Latency: ${totalDuration5 - httpDuration5}ms, Status Payload: ${JSON.stringify(statusResult5.payload)}, ClockIn Payload: ${JSON.stringify(clockedInResult5.payload)}`
    );

    // Part 5b: Check Backend GPS Gating State (clock out driver and test location rejection)
    await fetch(`${API_BASE}/shifts/clock-out`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${driverAuth.token}`
      }
    });

    const gpsRes = await fetch(`${API_BASE}/shifts/location`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${driverAuth.token}`
      },
      body: JSON.stringify({ lat: 30.440000, lng: 31.160000, speed: 25.5 })
    });
    const gpsData = await gpsRes.json();

    const pass5b = gpsRes.status === 403;
    formatLog(pass5b, 'Scenario 5b: Backend GPS Gating Enforcement',
      `HTTP POST /api/shifts/location while clocked out returned status ${gpsRes.status} (${gpsData.error || 'Success'})`
    );

    // ======================================================================
    // SCENARIO 6: Disconnect & Reconnect Delivery Gap
    // ======================================================================
    console.log('\n--- Scenario 6: Disconnect & Reconnect Delivery Gap ---');

    console.log('       Step 6.1: Forcibly disconnecting driver socket...');
    driverSocket.disconnect();

    const orderTracking6 = `TEST-NOTIF-${Date.now()}-6`;
    console.log('       Step 6.2: Supervisor creating order while driver socket is disconnected...');

    const createRes6 = await fetch(`${API_BASE}/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${supervisorAuth.token}`
      },
      body: JSON.stringify({
        tracking_number: orderTracking6,
        client_address: '202 Offline Street, Cairo',
        order_details: 'Test Item S6',
        order_amount: 120.00,
        delivery_guy_id: driverAuth.user.id
      })
    });
    const createData6 = await createRes6.json();
    if (createData6.order) createdOrderIds.push(createData6.order.id);

    console.log('       Step 6.3: Reconnecting driver socket and listening for buffered events...');
    driverSocket.connect();
    await new Promise((res) => driverSocket.on('connect', res));

    const reconnectedEventResult = await waitForEvent(driverSocket, 'order_assigned', 1500);

    if (reconnectedEventResult.received) {
      formatLog(true, 'Scenario 6: Disconnect & Reconnect Delivery Gap',
        `Missed event was received upon reconnection: ${JSON.stringify(reconnectedEventResult.payload)}`
      );
    } else {
      formatLog(false, 'Scenario 6: Disconnect & Reconnect Delivery Gap (Architectural Finding)',
        `Missed event 'order_assigned' (and other socket events emitted while offline) were NOT delivered upon socket reconnection. Socket.io operates strictly on a transient broadcast model without server-side event buffering or offline queueing.`
      );
    }

    // ======================================================================
    // SCENARIO 7: Wallet Topup Event Replay on Reconnect
    // ======================================================================
    console.log('\n--- Scenario 7: Wallet Topup Event Replay on Reconnect ---');
    console.log('       Step 7.1: Forcibly disconnecting driver socket...');
    driverSocket.disconnect();

    console.log('       Step 7.2: Finance topping up pocket wallet while driver socket is disconnected...');
    await fetch(`${API_BASE}/wallets/pocket/topup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${financeAuth.token}`
      },
      body: JSON.stringify({
        delivery_guy_id: driverAuth.user.id,
        amount: 30.00,
        notes: 'Scenario 7 test topup'
      })
    });

    console.log('       Step 7.3: Reconnecting driver socket and listening for buffered wallet events...');
    driverSocket.connect();
    await new Promise((res) => driverSocket.on('connect', res));

    const reconnectedWalletResult = await waitForEvent(driverSocket, 'wallet_updated', 1500);

    if (reconnectedWalletResult.received) {
      formatLog(true, 'Scenario 7: Wallet Topup Event Replay on Reconnect',
        `Missed wallet event was received upon reconnection: ${JSON.stringify(reconnectedWalletResult.payload)}`
      );
    } else {
      formatLog(false, 'Scenario 7: Wallet Topup Event Replay on Reconnect',
        'Missed event wallet_updated was NOT delivered upon socket reconnection.'
      );
    }

    // Clean up created test orders
    console.log('\n--- Cleanup: Purging Test Data ---');
    for (const oId of createdOrderIds) {
      await pool.query('UPDATE wallet_transactions SET related_order_id = NULL WHERE related_order_id = $1', [oId]);
      await pool.query('UPDATE pocket_expenses SET order_id = NULL WHERE order_id = $1', [oId]);
      await pool.query('DELETE FROM order_status_history WHERE order_id = $1', [oId]);
      await pool.query('DELETE FROM order_payments WHERE order_id = $1', [oId]);
      await pool.query('DELETE FROM order_attachments WHERE order_id = $1', [oId]);
      await pool.query('DELETE FROM returns WHERE order_id = $1', [oId]);
      await pool.query('DELETE FROM orders WHERE id = $1', [oId]);
    }
    console.log(`Cleaned up ${createdOrderIds.length} test order(s) from database.\n`);

  } catch (err) {
    console.error('TEST RUNNER ERROR:', err.message);
  } finally {
    if (driverSocket) driverSocket.disconnect();
    if (supervisorSocket) supervisorSocket.disconnect();
    if (financeSocket) financeSocket.disconnect();
    await pool.end();

    console.log('======================================================================');
    console.log('NOTIFICATION SYSTEM INTEGRATION TEST COMPLETED');
    console.log('======================================================================\n');
  }
}

runNotificationsTest();
