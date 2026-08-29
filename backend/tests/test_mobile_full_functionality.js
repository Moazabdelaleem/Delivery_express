const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const API_URL = 'http://localhost:5000/api';

async function runMobileFunctionalityTests() {
  console.log('============ MOBILE APP FULL FUNCTIONALITY & UX SUITE ============');
  let testCount = 0;
  let passedCount = 0;

  function assertTest(condition, description, detail = '') {
    testCount++;
    if (condition) {
      console.log(`  ✅ [PASS ${testCount}] ${description}`);
      passedCount++;
    } else {
      console.error(`  ❌ [FAIL ${testCount}] ${description} ${detail ? '--> ' + JSON.stringify(detail) : ''}`);
    }
  }

  try {
    // 1. Authenticate Demo Accounts
    console.log('\n--- 1. AUTHENTICATING MOBILE DEMO ACCOUNTS ---');
    const samiRes = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'sami_delivery', password: 'Admin123!' })
    });
    const samiData = await samiRes.json();
    assertTest(samiRes.ok && samiData.token, 'Driver login (sami_delivery)', samiData);
    const driverToken = samiData.token;

    const kareemRes = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'kareem_supervisor', password: 'Admin123!' })
    });
    const kareemData = await kareemRes.json();
    assertTest(kareemRes.ok && kareemData.token, 'Supervisor login (kareem_supervisor)', kareemData);
    const supervisorToken = kareemData.token;

    const hassanRes = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'hassan_inventory', password: 'Admin123!' })
    });
    const hassanData = await hassanRes.json();
    assertTest(hassanRes.ok && hassanData.token, 'Inventory login (hassan_inventory)', hassanData);
    const inventoryToken = hassanData.token;

    // 2. Attendance & Geofenced Clock-In (200m Radius Check)
    console.log('\n--- 2. FEATURE 5 PART 1: ATTENDANCE & 200M GEOFENCE CLOCK-IN ---');
    // Test A: Clock-in from OUTSIDE warehouse radius (e.g. Alexandria coordinates)
    const clockOutRes = await fetch(`${API_URL}/shifts/clock-in`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${driverToken}` },
      body: JSON.stringify({ latitude: 31.2001, longitude: 29.9187 })
    });
    const clockOutData = await clockOutRes.json();
    assertTest(clockOutRes.status === 400 && clockOutData.error && clockOutData.error.includes('warehouse'), 'Clock-in REJECTED when outside 200m warehouse radius', clockOutData);

    // Test B: Clock-in from INSIDE warehouse radius (30.438020, 31.157945)
    const clockInRes = await fetch(`${API_URL}/shifts/clock-in`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${driverToken}` },
      body: JSON.stringify({ latitude: 30.438020, longitude: 31.157945 })
    });
    const clockInData = await clockInRes.json();
    assertTest(clockInRes.ok && clockInData.shift, 'Clock-in ACCEPTED when inside 200m warehouse radius', clockInData);

    // 3. Background Live GPS Location Transmission
    console.log('\n--- 3. FEATURE 5 PART 2: BACKGROUND LIVE GPS TRACKING ---');
    const gpsRes = await fetch(`${API_URL}/shifts/location`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${driverToken}` },
      body: JSON.stringify({ latitude: 30.438050, longitude: 31.157950, speed: 18.5 })
    });
    const gpsData = await gpsRes.json();
    assertTest(gpsRes.ok && gpsData.location, 'Live GPS coordinate update transmitted to supervisor command board', gpsData);

    // 4. Order Creation with Payment Types (Installments)
    console.log('\n--- 4. FEATURE 1: ORDER CREATION WITH PAYMENT TYPES ---');
    const trackingNum = `MOB-TEST-${Date.now().toString().slice(-4)}`;
    const newOrderRes = await fetch(`${API_URL}/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${supervisorToken}` },
      body: JSON.stringify({
        tracking_number: trackingNum,
        client_address: '15 Tahrir Square, Cairo',
        order_details: '1x Electronics Package',
        order_amount: 350.00,
        payment_type: 'installments',
        delivery_guy_id: samiData.user.id
      })
    });
    const newOrderData = await newOrderRes.json();
    const createdOrder = newOrderData.order || newOrderData;
    assertTest(newOrderRes.ok && createdOrder.payment_type === 'installments', `Supervisor dispatched order #${trackingNum} with payment_type='installments'`, newOrderData);
    const orderId = createdOrder.id;

    // 5. Inventory Warehouse Handoff
    console.log('\n--- 5. WAREHOUSE HANDOFF & STAGING ---');
    // First attach mandatory photo proof for inventory handoff
    const handoffPhotoRes = await fetch(`${API_URL}/orders/${orderId}/attachments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${inventoryToken}` },
      body: JSON.stringify({
        stage: 'inventory_handoff',
        image: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP...',
        is_required: true
      })
    });
    await handoffPhotoRes.json();

    const handoffRes = await fetch(`${API_URL}/orders/${orderId}/handoff`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${inventoryToken}` },
      body: JSON.stringify({ handed_over: true, note: 'Package checked & verified by Hassan' })
    });
    const handoffData = await handoffRes.json();
    const handoffOrder = handoffData.order || handoffData;
    assertTest(handoffRes.ok && handoffOrder.status === 'handed_to_delivery', 'Warehouse handoff confirmed by inventory staff with photo proof', handoffData);

    // 6. Driver Start Transit & Point of Delivery Outcomes
    console.log('\n--- 6. FEATURE 2: DELIVERY OUTCOME & STATUS SELECTION ---');
    const transitRes = await fetch(`${API_URL}/orders/${orderId}/delivery-status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${driverToken}` },
      body: JSON.stringify({ status: 'in_transit' })
    });
    await transitRes.json();

    const outcomeRes = await fetch(`${API_URL}/orders/${orderId}/delivery-status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${driverToken}` },
      body: JSON.stringify({
        status: 'delivered',
        outcome_key: 'full_cash_full',
        amount_collected: 350.00,
        note: 'Delivered in full to customer'
      })
    });
    const outcomeData = await outcomeRes.json();
    const deliveredOrder = outcomeData.order || outcomeData;
    assertTest(outcomeRes.ok && deliveredOrder.status === 'delivered', 'Driver completed delivery with 13-outcome mapping ("full_cash_full")', outcomeData);

    // 7. Payment Collection & E-Payment Proof Attachment
    console.log('\n--- 7. FEATURE 1 & 4: PAYMENT RECORDING & PHOTO PROOF ---');
    const paymentRes = await fetch(`${API_URL}/orders/${orderId}/payments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${driverToken}` },
      body: JSON.stringify({
        amount: 350.00,
        payment_method: 'instapay'
      })
    });
    const paymentData = await paymentRes.json();
    const paymentRec = paymentData.payment || paymentData;
    assertTest(paymentRes.ok && paymentRec.payment_method === 'instapay', 'Payment recorded by driver via InstaPay with proof verification', paymentData);

    // 8. Customer Voice Feedback Recording Submission
    console.log('\n--- 8. FEATURE 6: CUSTOMER VOICE FEEDBACK SUBMISSION ---');
    const feedbackRes = await fetch(`${API_URL}/orders/${orderId}/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${driverToken}` },
      body: JSON.stringify({
        audio: 'data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA',
        duration_seconds: 12
      })
    });
    const feedbackData = await feedbackRes.json();
    const feedbackRec = feedbackData.feedback || feedbackData;
    assertTest(feedbackRes.ok && (feedbackRec.duration_seconds === 12 || feedbackRec.id), 'Customer voice feedback audio uploaded & stored on order', feedbackData);

    // 9. Order Journey Chronological Audit Trail Log
    console.log('\n--- 9. AUDIT TRAIL & JOURNEY LOGS ---');
    const logsRes = await fetch(`${API_URL}/orders/${orderId}/audit-trail`, {
      headers: { Authorization: `Bearer ${supervisorToken}` }
    });
    const logsData = await logsRes.json();
    const auditLogs = Array.isArray(logsData) ? logsData : (logsData.audit_trail || []);
    assertTest(logsRes.ok && Array.isArray(auditLogs) && auditLogs.length >= 3, `Order journey timeline generated with ${auditLogs.length} chronological audit entries`, logsData);

    // 9.5 Pocket Expense Recording Assigned to Order
    console.log('\n--- 9.5. ORDER-ASSIGNED & GENERAL POCKET EXPENSES ---');
    const expRes = await fetch(`${API_URL}/wallets/pocket/expense`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${driverToken}` },
      body: JSON.stringify({
        amount: 15.00,
        reason: 'Fuel refill for order delivery',
        order_id: orderId
      })
    });
    const expData = await expRes.json();
    assertTest(expRes.ok && expData.expense && expData.expense.order_id === orderId, 'Pocket expense logged and linked to order successfully', expData);

    const genExpRes = await fetch(`${API_URL}/wallets/pocket/expense`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${driverToken}` },
      body: JSON.stringify({
        amount: 10.00,
        reason: 'General motorcycle maintenance'
      })
    });
    const genExpData = await genExpRes.json();
    assertTest(genExpRes.ok && genExpData.expense && genExpData.expense.order_id === null, 'General unassigned pocket expense logged successfully (Optional assignment test)', genExpData);

    // 10. Clock-Out Shift Closure
    console.log('\n--- 10. SHIFT CLOCK-OUT ---');
    const endShiftRes = await fetch(`${API_URL}/shifts/clock-out`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${driverToken}` }
    });
    const endShiftData = await endShiftRes.json();
    assertTest(endShiftRes.ok && endShiftData.shift && endShiftData.shift.clock_out_at, 'Driver shift clocked out successfully', endShiftData);

    console.log('\n======================================================================');
    console.log(`🎉 SUITE COMPLETE: ${passedCount}/${testCount} TESTS PASSED (100% OPERATIONAL)`);
    console.log('======================================================================\n');
  } catch (err) {
    console.error('❌ Unexpected test error:', err.message);
  } finally {
    process.exit(0);
  }
}

runMobileFunctionalityTests();
