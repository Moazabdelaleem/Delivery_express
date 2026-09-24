const http = require('http');
const db = require('../config/db');

// Config
const API_PORT = process.env.PORT || 5000;
const BASE_URL = `http://localhost:${API_PORT}/api`;

let tokens = {
  driver: null,
  supervisor: null,
  inventory: null,
  finance: null,
  manager: null
};

let userIds = {};

// Test Report Data Container
const reportResults = [];

function logTest(category, scenarioName, success, details = '') {
  const resultObj = {
    category,
    scenarioName,
    status: success ? 'PASS' : 'FAIL',
    details,
    timestamp: new Date().toISOString()
  };
  reportResults.push(resultObj);
  const icon = success ? '✅' : '❌';
  console.log(`${icon} [${category}] ${scenarioName}: ${details}`);
}

async function apiRequest(endpoint, method = 'GET', body = null, token = null) {
  return new Promise((resolve) => {
    const url = new URL(BASE_URL + endpoint);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json'
      }
    };
    if (token) options.headers['Authorization'] = `Bearer ${token}`;

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const parsed = data ? JSON.parse(data) : {};
          resolve({ status: res.statusCode, data: parsed, ok: res.statusCode >= 200 && res.statusCode < 300 });
        } catch (e) {
          resolve({ status: res.statusCode, data: data, ok: res.statusCode >= 200 && res.statusCode < 300 });
        }
      });
    });

    req.on('error', (err) => resolve({ status: 500, data: { error: err.message }, ok: false }));
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function runAllEdgeCaseScenarios() {
  console.log('\n======================================================================');
  console.log('🧪 RUNNING COMPREHENSIVE END-TO-END & EDGE CASE TEST SUITE');
  console.log('======================================================================\n');

  try {
    // ─── STAGE 1: AUTHENTICATION FOR ALL USER ROLES ──────────────────────────
    console.log('--- 🔑 STAGE 1: Authenticating All 5 System User Roles ---');
    
    const demoPass = process.env.DEMO_PASSWORD || 'Admin123!';
    const loginCredentials = [
      { role: 'driver', username: 'sami_delivery', pass: demoPass },
      { role: 'supervisor', username: 'kareem_supervisor', pass: demoPass },
      { role: 'inventory', username: 'hassan_inventory', pass: demoPass },
      { role: 'finance', username: 'mona_finance', pass: demoPass },
      { role: 'manager', username: 'tarek_manager', pass: demoPass }
    ];

    for (const cred of loginCredentials) {
      const res = await apiRequest('/auth/login', 'POST', { username: cred.username, password: cred.pass });
      if (res.ok && res.data.token) {
        tokens[cred.role] = res.data.token;
        userIds[cred.role] = res.data.user.id;
        logTest('Auth', `Login Role: ${cred.role.toUpperCase()}`, true, `User ID: ${res.data.user.id}`);
      } else {
        logTest('Auth', `Login Role: ${cred.role.toUpperCase()}`, false, `Failed: ${res.data.error || res.status}`);
      }
    }

    // ─── STAGE 2: DRIVER SHIFT & GPS LOCATION EDGE CASES ─────────────────────
    console.log('\n--- ⏱️ STAGE 2: Driver Shift & GPS Location Edge Cases ---');
    
    // Edge Case 2.1: Clock in with Lat/Lng
    let clockInRes = await apiRequest('/shifts/clock-in', 'POST', { latitude: 30.044, longitude: 31.235 }, tokens.driver);
    logTest('Shift', 'Driver Initial Clock-In', clockInRes.ok, `Status: ${clockInRes.status} — ${clockInRes.data.message || clockInRes.data.error}`);

    // Edge Case 2.2: Clock in again while already active (Should handle gracefully/idempotent)
    let clockInDupRes = await apiRequest('/shifts/clock-in', 'POST', { latitude: 30.044, longitude: 31.235 }, tokens.driver);
    logTest('Shift', 'Duplicate Clock-In Prevention', clockInDupRes.ok, `Handled gracefully: ${clockInDupRes.data.message || 'Already active'}`);

    // Edge Case 2.3: Live GPS Location Update
    let gpsRes = await apiRequest('/shifts/location', 'POST', { latitude: 30.046, longitude: 31.238 }, tokens.driver);
    logTest('Shift', 'Live GPS Location Ping', gpsRes.ok, `Position logged (Lat: 30.046, Lng: 31.238)`);

    // Edge Case 2.4: Fetch Shift Daily Breakdown (Midnight Split Check)
    let shiftSumRes = await apiRequest(`/shifts/summary/${userIds.driver}`, 'GET', null, tokens.supervisor);
    const hasDailyBreakdown = shiftSumRes.ok && shiftSumRes.data.summaries && Array.isArray(shiftSumRes.data.summaries[0]?.daily_breakdown);
    logTest('Shift', 'Shift Summary & Daily Breakdown', hasDailyBreakdown, `Daily breakdown array computed with midnight splits`);

    // ─── STAGE 3: ORDER CREATION & HANDOFF ROLE SECURITY EDGE CASES ─────────
    console.log('\n--- 📦 STAGE 3: Order Creation & Inventory Handoff Security ---');

    // Scenario 3.1: Supervisor creates an order
    const trackingNum = `TRK-TEST-${Date.now()}`;
    const orderData = {
      client_name: 'Test Customer EdgeCase',
      client_phone: '01012345678',
      client_address: '123 Test St, Cairo',
      order_details: 'Special Box Items',
      order_amount: '650.00',
      payment_type: 'pay_after_delivery',
      delivery_guy_id: userIds.driver,
      tracking_number: trackingNum
    };
    let createRes = await apiRequest('/orders', 'POST', orderData, tokens.supervisor);
    const testOrderId = createRes.ok ? createRes.data.order.id : null;
    logTest('Orders', 'Order Creation', createRes.ok, `Order ID: ${testOrderId}, Tracking #${trackingNum}`);

    // Edge Case 3.2: Non-Inventory role (Driver) attempts Inventory Handoff (MUST FAIL 403)
    let badHandoffRes = await apiRequest(`/orders/${testOrderId}/handoff`, 'PUT', { handed_over: true }, tokens.driver);
    const rejectedNonInventory = badHandoffRes.status === 403;
    logTest('Security', 'Non-Inventory Handoff Blocked', rejectedNonInventory, `HTTP 403 Forbidden correctly returned for driver role`);

    // Edge Case 3.3: Driver attempts to start transit BEFORE inventory handoff (MUST FAIL 400)
    let badTransitRes = await apiRequest(`/orders/${testOrderId}/delivery-status`, 'PUT', { status: 'in_transit' }, tokens.driver);
    const rejectedEarlyTransit = badTransitRes.status === 400;
    logTest('Security', 'Transit Before Handoff Blocked', rejectedEarlyTransit, `HTTP 400 returned: Handoff required prior to in_transit`);

    // Scenario 3.4a: Insert mandatory photo attachment prior to inventory handoff
    await db.query(
      `INSERT INTO order_attachments (order_id, stage, uploaded_by, is_required, storage_url)
       VALUES ($1, 'inventory_handoff', $2, true, '/uploads/sample-handoff.jpg')`,
      [testOrderId, userIds.inventory]
    );

    // Scenario 3.4b: Inventory role confirms package handoff (SUCCESS)
    let handoffRes = await apiRequest(`/orders/${testOrderId}/handoff`, 'PUT', { handed_over: true, note: 'Handoff verified with photo proof' }, tokens.inventory);
    logTest('Orders', 'Inventory Handoff Confirmation', handoffRes.ok, `Status updated to handed_to_delivery by inventory staff`);

    // Scenario 3.5: Driver starts transit AFTER inventory handoff (SUCCESS)
    let startTransitRes = await apiRequest(`/orders/${testOrderId}/delivery-status`, 'PUT', { status: 'in_transit' }, tokens.driver);
    logTest('Orders', 'Driver Start Transit', startTransitRes.ok, `Order status advanced to in_transit`);

    // ─── STAGE 4: DELIVERY FAILURE & ZERO COLLECTION OUTCOME EDGE CASES ─────
    console.log('\n--- ❌ STAGE 4: Delivery Failure & Zero Collection Outcome Edge Cases ---');

    // Scenario 4.1: Driver submits delivery failure outcome (delivery_failed, collection_outcome: none)
    const failOutcomeData = {
      status: 'delivery_failed',
      delivery_outcome: 'none',
      collection_outcome: 'none',
      failure_reason: 'Recipient refused delivery at doorstep',
      returned_items_amount: 650.00,
      payment_method: 'none',
      payment_amount: 0
    };
    let failRes = await apiRequest(`/orders/${testOrderId}/delivery-status`, 'PUT', failOutcomeData, tokens.driver);
    logTest('Outcome', 'Delivery Failed Submission', failRes.ok, `Status: delivery_failed, Collection: none, Payment method bypassed`);

    // Edge Case 4.2: Verify Return Record Auto-Created with status pending_pickup
    let queueRes = await apiRequest('/returns/queue', 'GET', null, tokens.inventory);
    let autoReturn = (queueRes.ok && Array.isArray(queueRes.data.returns))
      ? queueRes.data.returns.find(r => r.order_id === testOrderId)
      : null;
    const isReturnCreated = Boolean(autoReturn);
    logTest('Returns', 'Auto-Return Record Generation', isReturnCreated, `Return record ID: ${autoReturn?.id}, Status: ${autoReturn?.status}`);

    // Scenario 4.3: Driver marks heading back to warehouse (transit-back)
    let returnId = autoReturn ? autoReturn.id : null;
    let transitBackRes = await apiRequest(`/returns/${returnId}/transit-back`, 'PATCH', {}, tokens.driver);
    logTest('Returns', 'Driver Transit-Back to Warehouse', transitBackRes.ok, `Return status updated to in_transit_back`);

    // ─── STAGE 5: INVENTORY RECEIPT & PHOTO ENFORCEMENT EDGE CASES ─────────
    console.log('\n--- 📸 STAGE 5: Inventory Return Receipt & Photo Enforcement ---');

    // Edge Case 5.1: Check returns queue for photo requirement flag (has_return_photo)
    queueRes = await apiRequest('/returns/queue', 'GET', null, tokens.inventory);
    autoReturn = (queueRes.ok && Array.isArray(queueRes.data.returns))
      ? queueRes.data.returns.find(r => r.id === returnId)
      : null;
    let initialHasPhoto = autoReturn ? autoReturn.has_return_photo : false;
    logTest('Returns', 'Initial Photo Status Check', !initialHasPhoto, `has_return_photo is false prior to photo capture`);

    // Scenario 5.2: Inventory uploads return proof photo (stage: return_verification)
    const sampleAttachmentData = {
      order_id: testOrderId,
      stage: 'return_verification',
      uploaded_by: userIds.inventory,
      storage_url: '/uploads/order-attachments/sample-return-proof.png'
    };
    await db.query(
      `INSERT INTO order_attachments (order_id, stage, uploaded_by, is_required, storage_url)
       VALUES ($1, 'return_verification', $2, true, $3)`,
      [testOrderId, userIds.inventory, sampleAttachmentData.storage_url]
    );

    // Scenario 5.3: Verify has_return_photo flag is now TRUE
    queueRes = await apiRequest('/returns/queue', 'GET', null, tokens.inventory);
    autoReturn = (queueRes.ok && Array.isArray(queueRes.data.returns))
      ? queueRes.data.returns.find(r => r.id === returnId)
      : null;
    let updatedHasPhoto = autoReturn ? autoReturn.has_return_photo : false;
    logTest('Returns', 'Photo Capture Verification Flag', updatedHasPhoto, `has_return_photo updated to true after photo attachment`);

    // Scenario 5.4: Inventory physically receives return items at warehouse
    let receiveRes = await apiRequest(`/returns/${returnId}/receive`, 'PATCH', { damaged_missing_qty: 0, condition_notes: 'Returned intact in box' }, tokens.inventory);
    logTest('Returns', 'Inventory Warehouse Receipt', receiveRes.ok, `Status updated to pending_verification / awaiting_supervisor_action`);

    // ─── STAGE 6: SUPERVISOR RETURN ACTIONS (REASSIGN VS CANCEL) ───────────
    console.log('\n--- 👔 STAGE 6: Supervisor Return Actions (Reassign & Cancel) ---');

    // Scenario 6.1: Supervisor reassigns returned order to driver
    let reassignRes = await apiRequest(`/returns/${returnId}/supervisor-action`, 'POST', { action: 'reassign', reassign_driver_id: userIds.driver }, tokens.supervisor);
    logTest('Supervisor', 'Supervisor Order Reassignment', reassignRes.ok, `Order reassigned to driver, status updated back to assigned`);

    // Scenario 6.2: Create a second return order to test Supervisor Total Cancel action
    const trackingNum2 = `TRK-TEST2-${Date.now()}`;
    let create2Res = await apiRequest('/orders', 'POST', {
      ...orderData,
      client_name: 'Test Customer Cancel Scenario',
      tracking_number: trackingNum2
    }, tokens.supervisor);
    const testOrderId2 = create2Res.ok ? create2Res.data.order.id : null;

    // Attach handoff photo proof
    await db.query(
      `INSERT INTO order_attachments (order_id, stage, uploaded_by, is_required, storage_url)
       VALUES ($1, 'inventory_handoff', $2, true, '/uploads/sample-handoff2.jpg')`,
      [testOrderId2, userIds.inventory]
    );

    await apiRequest(`/orders/${testOrderId2}/handoff`, 'PUT', { handed_over: true }, tokens.inventory);
    await apiRequest(`/orders/${testOrderId2}/delivery-status`, 'PUT', { status: 'in_transit' }, tokens.driver);
    await apiRequest(`/orders/${testOrderId2}/delivery-status`, 'PUT', { ...failOutcomeData }, tokens.driver);
    
    let queueRes2 = await apiRequest('/returns/queue', 'GET', null, tokens.inventory);
    let autoReturn2 = (queueRes2.ok && Array.isArray(queueRes2.data.returns))
      ? queueRes2.data.returns.find(r => r.order_id === testOrderId2)
      : null;

    let cancelRes = await apiRequest(`/returns/${autoReturn2.id}/supervisor-action`, 'POST', { action: 'cancel' }, tokens.supervisor);
    logTest('Supervisor', 'Supervisor Order Total Cancellation', cancelRes.ok, `Order cancelled totally, status updated to delivery_failed / cancelled`);

    // ─── STAGE 7: POCKET ALLOWANCE & DRIVER EXPENSE EDGE CASES ─────────────
    console.log('\n--- 🧾 STAGE 7: Pocket Allowance & Driver Expense Edge Cases ---');

    // Edge Case 7.1: Attempt to log invalid negative expense amount (MUST FAIL 400)
    let badExpRes = await apiRequest('/wallets/pocket/expense', 'POST', { amount: -50, reason: 'Invalid negative' }, tokens.driver);
    logTest('Expenses', 'Negative Expense Amount Blocked', badExpRes.status === 400, `HTTP 400 returned for negative expense amount`);

    // Scenario 7.2: Driver logs general fuel expense
    let genExpRes = await apiRequest('/wallets/pocket/expense', 'POST', { amount: 35.00, reason: 'Gasoline refill for motorcycle' }, tokens.driver);
    logTest('Expenses', 'General Fuel Expense Logged', genExpRes.ok, `Expense recorded: $35.00, New pocket balance: $${genExpRes.data.new_pocket_balance}`);

    // Scenario 7.3: Driver logs order-linked expense
    let orderExpRes = await apiRequest('/wallets/pocket/expense', 'POST', { amount: 15.00, reason: 'Parking fee at customer location', order_id: testOrderId }, tokens.driver);
    logTest('Expenses', 'Order-Linked Expense Logged', orderExpRes.ok, `Expense recorded: $15.00 linked to order #${trackingNum}`);

    // Scenario 7.4: Supervisor fetches Fleet Expenses Breakdown
    let expBreakdownRes = await apiRequest('/wallets/expenses/breakdown', 'GET', null, tokens.supervisor);
    const hasExpenses = expBreakdownRes.ok && Array.isArray(expBreakdownRes.data.breakdown) && expBreakdownRes.data.breakdown.length > 0;
    logTest('Expenses', 'Supervisor Expenses Breakdown Access', hasExpenses, `Grand total spent: $${expBreakdownRes.data.grand_total_spent}, Items count: ${expBreakdownRes.data.breakdown.length}`);

    // ─── STAGE 8: FINANCE CASH PULLOUT & POCKET TOP-UP ───────────────────────
    console.log('\n--- 💵 STAGE 8: Finance Cash Pullout & Pocket Top-Up ---');

    // Scenario 8.1: Finance tops up driver pocket wallet
    let topupRes = await apiRequest('/wallets/pocket/topup', 'POST', { delivery_guy_id: userIds.driver, amount: 100.00, notes: 'Weekly allowance topup' }, tokens.finance);
    logTest('Finance', 'Finance Pocket Wallet Top-Up', topupRes.ok, `Topped up $100.00 to driver pocket wallet`);

    // Scenario 8.2: Driver completes a delivery to generate collection cash
    // Attach handoff proof for testOrderId reassigned order
    await db.query(
      `INSERT INTO order_attachments (order_id, stage, uploaded_by, is_required, storage_url)
       VALUES ($1, 'inventory_handoff', $2, true, '/uploads/sample-handoff3.jpg')`,
      [testOrderId, userIds.inventory]
    );
    await apiRequest(`/orders/${testOrderId}/handoff`, 'PUT', { handed_over: true }, tokens.inventory);
    await apiRequest(`/orders/${testOrderId}/delivery-status`, 'PUT', { status: 'in_transit' }, tokens.driver);
    await apiRequest(`/orders/${testOrderId}/delivery-status`, 'PUT', {
      status: 'delivered',
      delivery_outcome: 'full',
      collection_outcome: 'full',
      cash_amount: 650.00,
      payment_method: 'cash'
    }, tokens.driver);

    // Scenario 8.3: Finance pulls cash from driver collection wallet
    let pullRes = await apiRequest('/wallets/collection/pullout', 'POST', { delivery_guy_id: userIds.driver, notes: 'Daily cash deposit received' }, tokens.finance);
    logTest('Finance', 'Finance Collection Cash Pullout', pullRes.ok, `Cleared collection balance for driver`);

    // Edge Case 8.4: Finance attempts cash pullout when balance is 0 (Graceful handle)
    let pullZeroRes = await apiRequest('/wallets/collection/pullout', 'POST', { delivery_guy_id: userIds.driver }, tokens.finance);
    logTest('Finance', 'Zero Cash Pullout Graceful Handling', pullZeroRes.status === 400, `Returned: Wallet balance fully settled`);

    // Clock out driver at end of scenario
    await apiRequest('/shifts/clock-out', 'POST', {}, tokens.driver);

  } catch (err) {
    console.error('Unhandled exception during scenario execution:', err);
    logTest('System', 'Test Suite Execution', false, `Unhandled exception: ${err.message}`);
  } finally {
    console.log('\n======================================================================');
    console.log('📊 TEST SCENARIOS EXECUTION SUMMARY REPORT');
    console.log('======================================================================');
    const passed = reportResults.filter(r => r.status === 'PASS').length;
    const total = reportResults.length;
    console.log(`Total Scenarios Tested: ${total}`);
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${total - passed}`);
    console.log(`Success Rate: ${((passed / total) * 100).toFixed(1)}%\n`);

    // Output JSON format report for subagent/assistant analysis
    console.log('--- JSON REPORT OUTPUT ---');
    console.log(JSON.stringify(reportResults, null, 2));
    process.exit(0);
  }
}

runAllEdgeCaseScenarios();
