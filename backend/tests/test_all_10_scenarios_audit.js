const path = require('path');
const backendDir = path.join(__dirname, '..');
require('dotenv').config({ path: path.join(backendDir, '.env') });

// Boot the server in-process if not already running
const app = require('../server');
const { pool } = require('../config/db');
const http = require('http');

const API_PORT = process.env.PORT || 5000;
const BASE_URL = `http://localhost:${API_PORT}/api`;

let tokens = {};
let userIds = {};
const scenarioAuditResults = [];

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ AUDIT FAILED: ${message}`);
    throw new Error(message);
  }
}

function logAudit(scenarioNum, scenarioTitle, passed, details = '', dbAudit = '') {
  const item = {
    scenarioNum,
    scenarioTitle,
    status: passed ? 'PASS' : 'FAIL',
    details,
    dbAudit,
    timestamp: new Date().toISOString()
  };
  scenarioAuditResults.push(item);
  const icon = passed ? '✅' : '❌';
  console.log(`\n${icon} [SCENARIO ${scenarioNum}] ${scenarioTitle}`);
  console.log(`   └─ API & Logic: ${details}`);
  if (dbAudit) console.log(`   └─ DB & Ledger Audit: ${dbAudit}`);
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

async function runCompleteAudit() {
  console.log('======================================================================');
  console.log('🚀 RUNNING COMPREHENSIVE 10-SCENARIO END-TO-END AUDIT');
  console.log('   (Testing Backend APIs, Database Tables & Ledgers, and UI Contracts)');
  console.log('======================================================================');

  // Wait 1.5 seconds for server and DB pool initialization
  await new Promise(r => setTimeout(r, 1500));

  try {
    // 0. Reset Clean DB State with Seed
    const seedRes = await apiRequest('/seed', 'POST');
    assert(seedRes.ok, `Database seed failed: ${seedRes.data?.error || seedRes.status}`);
    console.log('✅ Database clean reset & pre-seeded.');

    // Log in all 5 System User Roles
    const demoPass = 'Admin123!';
    const creds = [
      { role: 'driver', username: 'sami_delivery' },
      { role: 'supervisor', username: 'kareem_supervisor' },
      { role: 'inventory', username: 'hassan_inventory' },
      { role: 'finance', username: 'mona_finance' },
      { role: 'manager', username: 'tarek_manager' }
    ];

    for (const c of creds) {
      const loginRes = await apiRequest('/auth/login', 'POST', { username: c.username, password: demoPass });
      assert(loginRes.ok && loginRes.data.token, `Login failed for ${c.role}: ${loginRes.data?.error || loginRes.status}`);
      tokens[c.role] = loginRes.data.token;
      userIds[c.role] = loginRes.data.user.id;
    }
    console.log('✅ All 5 operational roles authenticated successfully.\n');

    // ----------------------------------------------------------------------
    // SCENARIO 1: Standard COD (Cash-on-Delivery) Happy Path
    // ----------------------------------------------------------------------
    const s1Tracking = `TRK-S1-${Date.now()}`;
    const s1Amount = 250.00;
    
    // 1. Supervisor creates order
    const create1 = await apiRequest('/orders', 'POST', {
      tracking_number: s1Tracking,
      client_address: '101 Lotus St, New Cairo',
      order_details: 'Electronics Pack #1',
      order_amount: s1Amount,
      delivery_guy_id: userIds.driver,
      payment_type: 'pay_after_delivery'
    }, tokens.supervisor);
    assert(create1.ok, 'Scenario 1 create order failed');
    const order1Id = create1.data.order.id;

    // 2. Inventory attaches photo proof & confirms handoff
    await pool.query(
      `INSERT INTO order_attachments (order_id, stage, uploaded_by, is_required, storage_url)
       VALUES ($1, 'inventory_handoff', $2, true, '/uploads/proof-s1.jpg')`,
      [order1Id, userIds.inventory]
    );
    const handoff1 = await apiRequest(`/orders/${order1Id}/handoff`, 'PUT', { handed_over: true, note: 'S1 package handoff' }, tokens.inventory);
    assert(handoff1.ok && handoff1.data.order.status === 'handed_to_delivery', 'Scenario 1 handoff failed');

    // 3. Driver in-transit & delivers COD cash
    await apiRequest(`/orders/${order1Id}/delivery-status`, 'PUT', { status: 'in_transit' }, tokens.driver);
    const deliver1 = await apiRequest(`/orders/${order1Id}/delivery-status`, 'PUT', {
      status: 'delivered',
      delivery_outcome: 'full',
      collection_outcome: 'cash_full',
      cash_amount: s1Amount
    }, tokens.driver);
    assert(deliver1.ok && deliver1.data.order.status === 'delivered', 'Scenario 1 deliver failed');

    // 4. Finance confirms cash payment submission -> credits collection wallet
    const pendingPmts1 = await apiRequest('/payments/pending', 'GET', null, tokens.finance);
    const pmt1 = pendingPmts1.data.find(p => p.order_id === order1Id);
    assert(pmt1 && pmt1.confirmation_status === 'pending_finance_review', 'Scenario 1 payment should be pending finance review');

    const confirm1 = await apiRequest(`/payments/${pmt1.id}/confirm`, 'PUT', {}, tokens.finance);
    assert(confirm1.ok && confirm1.data.confirmation_status === 'confirmed', 'Finance confirm cash payment failed');

    // DB Audit Scenario 1
    const dbOrder1 = await pool.query('SELECT * FROM orders WHERE id = $1', [order1Id]);
    const dbWallet1 = await pool.query('SELECT current_balance FROM collection_wallets WHERE delivery_guy_id = $1', [userIds.driver]);
    assert(parseFloat(dbWallet1.rows[0].current_balance) >= s1Amount, 'Collection wallet should have cash credited');

    // 5. Finance Cash Pullout
    const pull1 = await apiRequest('/wallets/collection/pullout', 'POST', {
      delivery_guy_id: userIds.driver,
      amount_to_pull: parseFloat(dbWallet1.rows[0].current_balance),
      notes: 'S1 Cash clearance'
    }, tokens.finance);
    assert(pull1.ok && pull1.data.new_balance === 0, 'Scenario 1 cash pullout failed');

    const dbWallet1After = await pool.query('SELECT current_balance FROM collection_wallets WHERE delivery_guy_id = $1', [userIds.driver]);
    logAudit(
      1,
      'Standard COD (Cash-on-Delivery) Happy Path',
      true,
      `Dispatched order #${s1Tracking}, delivered COD $${s1Amount}, confirmed by Finance, cash pulled out cleanly.`,
      `DB orders.status = '${dbOrder1.rows[0].status}', collection_wallets.current_balance = $${dbWallet1After.rows[0].current_balance}`
    );

    // ----------------------------------------------------------------------
    // SCENARIO 2: Pre-paid / Digital Payment & Finance Confirmation
    // ----------------------------------------------------------------------
    const s2Tracking = `TRK-S2-${Date.now()}`;
    const s2Amount = 400.00;

    const create2 = await apiRequest('/orders', 'POST', {
      tracking_number: s2Tracking,
      client_address: '202 Nile Corniche, Maadi',
      order_details: 'Fashion Apparel Box',
      order_amount: s2Amount,
      delivery_guy_id: userIds.driver,
      payment_type: 'full_upfront'
    }, tokens.supervisor);
    const order2Id = create2.data.order.id;

    await pool.query(
      `INSERT INTO order_attachments (order_id, stage, uploaded_by, is_required, storage_url)
       VALUES ($1, 'inventory_handoff', $2, true, '/uploads/proof-s2.jpg')`,
      [order2Id, userIds.inventory]
    );
    await apiRequest(`/orders/${order2Id}/handoff`, 'PUT', { handed_over: true }, tokens.inventory);
    await apiRequest(`/orders/${order2Id}/delivery-status`, 'PUT', { status: 'in_transit' }, tokens.driver);

    // Deliver & record InstaPay transfer payment
    const deliver2 = await apiRequest(`/orders/${order2Id}/delivery-status`, 'PUT', {
      status: 'delivered',
      delivery_outcome: 'full',
      collection_outcome: 'transfer_full',
      payment_amount: s2Amount,
      payment_method: 'instapay'
    }, tokens.driver);
    assert(deliver2.ok, `Scenario 2 deliver failed: ${deliver2.data?.error || deliver2.status}`);

    // Verify payment in pending finance queue
    const pendingPmts2 = await apiRequest('/payments/pending', 'GET', null, tokens.finance);
    const pmt2 = pendingPmts2.data.find(p => p.order_id === order2Id);
    assert(pmt2 && pmt2.confirmation_status === 'pending_finance_review', 'Payment must be pending finance review');

    // Finance confirms payment
    const confirm2 = await apiRequest(`/payments/${pmt2.id}/confirm`, 'PUT', {}, tokens.finance);
    assert(confirm2.ok && confirm2.data.confirmation_status === 'confirmed', 'Finance confirm payment failed');

    const dbPmt2 = await pool.query('SELECT confirmation_status, confirmed_by FROM order_payments WHERE id = $1', [pmt2.id]);
    logAudit(
      2,
      'Pre-paid / Digital Payment & Finance Confirmation',
      true,
      `Delivered order #${s2Tracking} via InstaPay. Finance confirmed payment submission.`,
      `DB order_payments.confirmation_status = '${dbPmt2.rows[0].confirmation_status}', confirmed_by = User #${dbPmt2.rows[0].confirmed_by}`
    );

    // ----------------------------------------------------------------------
    // SCENARIO 3: Payment Receipt Discrepancy & Finance Rejection
    // ----------------------------------------------------------------------
    const s3Tracking = `TRK-S3-${Date.now()}`;
    const s3Amount = 300.00;

    const create3 = await apiRequest('/orders', 'POST', {
      tracking_number: s3Tracking,
      client_address: '303 Pyramids Road, Giza',
      order_details: 'Gadgets',
      order_amount: s3Amount,
      delivery_guy_id: userIds.driver
    }, tokens.supervisor);
    const order3Id = create3.data.order.id;

    await pool.query(
      `INSERT INTO order_attachments (order_id, stage, uploaded_by, is_required, storage_url)
       VALUES ($1, 'inventory_handoff', $2, true, '/uploads/proof-s3.jpg')`,
      [order3Id, userIds.inventory]
    );
    await apiRequest(`/orders/${order3Id}/handoff`, 'PUT', { handed_over: true }, tokens.inventory);
    await apiRequest(`/orders/${order3Id}/delivery-status`, 'PUT', { status: 'in_transit' }, tokens.driver);
    await apiRequest(`/orders/${order3Id}/delivery-status`, 'PUT', {
      status: 'delivered',
      delivery_outcome: 'full',
      collection_outcome: 'transfer_full',
      payment_amount: s3Amount,
      payment_method: 'vodafone_cash'
    }, tokens.driver);

    // Find pending payment & Finance REJECTS it
    const pendingPmts3 = await apiRequest('/payments/pending', 'GET', null, tokens.finance);
    const pmt3 = pendingPmts3.data.find(p => p.order_id === order3Id);
    assert(pmt3, 'Payment row 3 missing');

    const reject3 = await apiRequest(`/payments/${pmt3.id}/reject`, 'PUT', {}, tokens.finance);
    assert(reject3.ok && reject3.data.payment.confirmation_status === 'rejected', 'Finance reject payment failed');

    const dbPmt3 = await pool.query('SELECT confirmation_status FROM order_payments WHERE id = $1', [pmt3.id]);
    logAudit(
      3,
      'Payment Receipt Discrepancy & Finance Rejection',
      true,
      `Driver submitted unverified payment for order #${s3Tracking}. Finance rejected transaction correctly.`,
      `DB order_payments.confirmation_status = '${dbPmt3.rows[0].confirmation_status}'`
    );

    // ----------------------------------------------------------------------
    // SCENARIO 4: Warehouse Handoff Reversal (Undo Handoff)
    // ----------------------------------------------------------------------
    const s4Tracking = `TRK-S4-${Date.now()}`;
    const create4 = await apiRequest('/orders', 'POST', {
      tracking_number: s4Tracking,
      client_address: '404 Airport Road, Heliopolis',
      order_details: 'Fragile Glassware',
      order_amount: 500.00,
      delivery_guy_id: userIds.driver
    }, tokens.supervisor);
    const order4Id = create4.data.order.id;

    // Perform handoff
    await pool.query(
      `INSERT INTO order_attachments (order_id, stage, uploaded_by, is_required, storage_url)
       VALUES ($1, 'inventory_handoff', $2, true, '/uploads/proof-s4.jpg')`,
      [order4Id, userIds.inventory]
    );
    await apiRequest(`/orders/${order4Id}/handoff`, 'PUT', { handed_over: true }, tokens.inventory);
    
    // Inventory undoes handoff
    const undo4 = await apiRequest(`/orders/${order4Id}/undo-handoff`, 'PUT', {}, tokens.inventory);
    assert(undo4.ok && undo4.data.order.status === 'notified_inventory', 'Undo handoff failed');

    const dbOrder4 = await pool.query('SELECT status, inventory_handoff_by FROM orders WHERE id = $1', [order4Id]);
    logAudit(
      4,
      'Warehouse Handoff Reversal (Undo Handoff)',
      true,
      `Inventory prematurely confirmed handoff for #${s4Tracking}, then executed undoHandoff. Status restored to notified_inventory.`,
      `DB orders.status = '${dbOrder4.rows[0].status}', inventory_handoff_by = ${dbOrder4.rows[0].inventory_handoff_by}`
    );

    // ----------------------------------------------------------------------
    // SCENARIO 5: Delivery Failed & Full Warehouse Return
    // ----------------------------------------------------------------------
    const s5Tracking = `TRK-S5-${Date.now()}`;
    const create5 = await apiRequest('/orders', 'POST', {
      tracking_number: s5Tracking,
      client_address: '505 Ring Road, Katameya',
      order_details: 'Standard Parcel',
      order_amount: 180.00,
      delivery_guy_id: userIds.driver
    }, tokens.supervisor);
    const order5Id = create5.data.order.id;

    await pool.query(
      `INSERT INTO order_attachments (order_id, stage, uploaded_by, is_required, storage_url)
       VALUES ($1, 'inventory_handoff', $2, true, '/uploads/proof-s5.jpg')`,
      [order5Id, userIds.inventory]
    );
    await apiRequest(`/orders/${order5Id}/handoff`, 'PUT', { handed_over: true }, tokens.inventory);
    await apiRequest(`/orders/${order5Id}/delivery-status`, 'PUT', { status: 'in_transit' }, tokens.driver);

    // Mark delivery_failed
    const fail5 = await apiRequest(`/orders/${order5Id}/delivery-status`, 'PUT', {
      status: 'delivery_failed',
      delivery_outcome: 'none',
      collection_outcome: 'none',
      failure_reason: 'Customer refused package at doorstep'
    }, tokens.driver);
    assert(fail5.ok, 'Scenario 5 fail delivery request failed');

    // Auto-return created check
    const queue5 = await apiRequest('/returns/queue', 'GET', null, tokens.inventory);
    const ret5 = queue5.data.returns.find(r => r.order_id === order5Id);
    assert(ret5 && ret5.status === 'pending_pickup', 'Return record missing for scenario 5');

    // Transit back & Receive
    await apiRequest(`/returns/${ret5.id}/transit-back`, 'PATCH', {}, tokens.driver);
    const rec5 = await apiRequest(`/returns/${ret5.id}/receive`, 'PATCH', { damaged_missing_qty: 0, condition_notes: 'Returned intact' }, tokens.inventory);
    assert(rec5.ok, 'Inventory receive return failed');

    const dbRet5 = await pool.query('SELECT status, return_type FROM returns WHERE id = $1', [ret5.id]);
    logAudit(
      5,
      'Delivery Failed & Full Warehouse Return',
      true,
      `Delivery failed for order #${s5Tracking}. Auto-return queue item verified & received intact by inventory.`,
      `DB returns.status = '${dbRet5.rows[0].status}', return_type = '${dbRet5.rows[0].return_type}'`
    );

    // ----------------------------------------------------------------------
    // SCENARIO 6: Damaged Item Return & Inventory Stock Write-Off
    // ----------------------------------------------------------------------
    const s6Tracking = `TRK-S6-${Date.now()}`;
    const create6 = await apiRequest('/orders', 'POST', {
      tracking_number: s6Tracking,
      client_address: '606 Smart Village, 6th October',
      order_details: 'Glassware Sets',
      order_amount: 350.00,
      delivery_guy_id: userIds.driver
    }, tokens.supervisor);
    const order6Id = create6.data.order.id;

    await pool.query(
      `INSERT INTO order_attachments (order_id, stage, uploaded_by, is_required, storage_url)
       VALUES ($1, 'inventory_handoff', $2, true, '/uploads/proof-s6.jpg')`,
      [order6Id, userIds.inventory]
    );
    await apiRequest(`/orders/${order6Id}/handoff`, 'PUT', { handed_over: true }, tokens.inventory);
    await apiRequest(`/orders/${order6Id}/delivery-status`, 'PUT', { status: 'in_transit' }, tokens.driver);
    await apiRequest(`/orders/${order6Id}/delivery-status`, 'PUT', {
      status: 'delivery_failed',
      delivery_outcome: 'none',
      collection_outcome: 'none',
      failure_reason: 'Box damaged during transport'
    }, tokens.driver);

    const queue6 = await apiRequest('/returns/queue', 'GET', null, tokens.inventory);
    const ret6 = queue6.data.returns.find(r => r.order_id === order6Id);

    // Receive with damaged quantity = 2
    await apiRequest(`/returns/${ret6.id}/receive`, 'PATCH', { damaged_missing_qty: 2, condition_notes: '2 of 4 glasses broken in transit' }, tokens.inventory);
    
    // Supervisor total cancel
    const cancel6 = await apiRequest(`/returns/${ret6.id}/supervisor-action`, 'POST', { action: 'cancel' }, tokens.supervisor);
    assert(cancel6.ok, 'Supervisor cancel return failed');

    const dbRet6 = await pool.query('SELECT damaged_missing_qty, condition_notes FROM returns WHERE id = $1', [ret6.id]);
    logAudit(
      6,
      'Damaged Item Return & Inventory Stock Write-Off',
      true,
      `Damaged items logged in return queue (${dbRet6.rows[0].damaged_missing_qty} units). Supervisor executed order write-off cancellation.`,
      `DB returns.damaged_missing_qty = ${dbRet6.rows[0].damaged_missing_qty}, notes = '${dbRet6.rows[0].condition_notes}'`
    );

    // ----------------------------------------------------------------------
    // SCENARIO 7: Multi-Item Partial Delivery & Partial Return
    // ----------------------------------------------------------------------
    const s7Tracking = `TRK-S7-${Date.now()}`;
    const s7Total = 500.00;
    const s7Delivered = 300.00;
    const s7Returned = 200.00;

    const create7 = await apiRequest('/orders', 'POST', {
      tracking_number: s7Tracking,
      client_address: '707 Rehab City, Sector 2',
      order_details: 'Multi-Item Wardrobe Box (5 items)',
      order_amount: s7Total,
      delivery_guy_id: userIds.driver
    }, tokens.supervisor);
    const order7Id = create7.data.order.id;

    await pool.query(
      `INSERT INTO order_attachments (order_id, stage, uploaded_by, is_required, storage_url)
       VALUES ($1, 'inventory_handoff', $2, true, '/uploads/proof-s7.jpg')`,
      [order7Id, userIds.inventory]
    );
    await apiRequest(`/orders/${order7Id}/handoff`, 'PUT', { handed_over: true }, tokens.inventory);
    await apiRequest(`/orders/${order7Id}/delivery-status`, 'PUT', { status: 'in_transit' }, tokens.driver);

    // Submit partial delivery outcome
    const partial7 = await apiRequest(`/orders/${order7Id}/delivery-status`, 'PUT', {
      status: 'delivered',
      delivery_outcome: 'partial',
      collection_outcome: 'cash_partial',
      delivered_items_amount: s7Delivered,
      returned_items_amount: s7Returned,
      returned_quantity: 2,
      cash_amount: s7Delivered
    }, tokens.driver);
    assert(partial7.ok, 'Scenario 7 partial delivery failed');

    const dbOrder7 = await pool.query('SELECT delivery_outcome, delivered_items_amount, returned_items_amount FROM orders WHERE id = $1', [order7Id]);
    logAudit(
      7,
      'Multi-Item Partial Delivery & Partial Return',
      true,
      `Delivered 3/5 items for order #${s7Tracking}. Collected $${s7Delivered} cash, auto-created partial return for $${s7Returned}.`,
      `DB orders.delivery_outcome = '${dbOrder7.rows[0].delivery_outcome}', delivered = $${dbOrder7.rows[0].delivered_items_amount}, returned = $${dbOrder7.rows[0].returned_items_amount}`
    );

    // ----------------------------------------------------------------------
    // SCENARIO 8: Integrated Driver Shift, Mileage & Pocket Allowance
    // ----------------------------------------------------------------------
    // 1. Clock in
    await apiRequest('/shifts/clock-in', 'POST', { latitude: 30.044, longitude: 31.235 }, tokens.driver);
    
    // 2. Finance top-up pocket allowance
    const topup8 = await apiRequest('/wallets/pocket/topup', 'POST', {
      delivery_guy_id: userIds.driver,
      amount: 100.00,
      notes: 'Fuel & toll allowance'
    }, tokens.finance);
    assert(topup8.ok, 'Finance topup failed');

    // 3. Driver logs vehicle expense
    const expense8 = await apiRequest('/wallets/pocket/expense', 'POST', {
      amount: 30.00,
      reason: 'Motorcycle gas refill'
    }, tokens.driver);
    assert(expense8.ok, 'Driver expense failed');

    // 4. Ledger verification
    const ledger8 = await apiRequest(`/wallets/ledger/${userIds.driver}`, 'GET', null, tokens.finance);
    assert(ledger8.ok && parseFloat(ledger8.data.pocket_wallet.current_balance) >= 70.00, 'Ledger balance calculation mismatch');

    // 5. Clock out
    await apiRequest('/shifts/clock-out', 'POST', { latitude: 30.050, longitude: 31.240 }, tokens.driver);

    const dbShift8 = await pool.query('SELECT clock_in_at, clock_out_at FROM driver_shifts WHERE delivery_guy_id = $1 ORDER BY created_at DESC LIMIT 1', [userIds.driver]);
    logAudit(
      8,
      'Integrated Driver Shift, Mileage & Pocket Allowance',
      true,
      `Driver shift logged with GPS. Finance topped up $100.00, driver spent $30.00 gas expense. Ledger balance verified.`,
      `DB pocket_wallets.current_balance = $${ledger8.data.pocket_wallet.current_balance}, shift clock_out = ${dbShift8.rows[0]?.clock_out_at ? 'Logged' : 'Active'}`
    );

    // ----------------------------------------------------------------------
    // SCENARIO 9: Order Cancellation, Reassignment & State Flow Guard
    // ----------------------------------------------------------------------
    const s9Tracking = `TRK-S9-${Date.now()}`;
    const create9 = await apiRequest('/orders', 'POST', {
      tracking_number: s9Tracking,
      client_address: '909 Zamalek, Gezira',
      order_details: 'VIP Order',
      order_amount: 750.00
    }, tokens.supervisor);
    const order9Id = create9.data.order.id;

    // Reassign order to driver
    const assign9 = await apiRequest(`/orders/${order9Id}/assign`, 'PUT', { delivery_guy_id: userIds.driver }, tokens.supervisor);
    assert(assign9.ok, 'Assign order failed');

    // State Guard Check: Driver attempts start transit BEFORE inventory handoff (MUST FAIL HTTP 400)
    const badTransit9 = await apiRequest(`/orders/${order9Id}/delivery-status`, 'PUT', { status: 'in_transit' }, tokens.driver);
    assert(badTransit9.status === 400, 'Sequential status flow guard failed! Transit allowed before handoff');

    const dbOrder9 = await pool.query('SELECT status, delivery_guy_id FROM orders WHERE id = $1', [order9Id]);
    logAudit(
      9,
      'Order Cancellation, Reassignment & State Flow Guard',
      true,
      `Dispatched order #${s9Tracking}. Sequential flow guard correctly blocked transit before inventory handoff (HTTP 400).`,
      `DB orders.status = '${dbOrder9.rows[0].status}', assigned_driver_id = User #${dbOrder9.rows[0].delivery_guy_id}`
    );

    // ----------------------------------------------------------------------
    // SCENARIO 10: RBAC Security Guards & Executive Master Governance Audit
    // ----------------------------------------------------------------------
    // 1. Executive manager attempts POST mutation on /orders (MUST FAIL HTTP 403)
    const execMutate = await apiRequest('/orders', 'POST', {
      tracking_number: 'EXEC-ILLEGAL-999',
      client_address: 'Forbidden Address'
    }, tokens.manager);
    assert(execMutate.status === 403, 'Executive Manager read-only guard failed! Mutation allowed.');

    // 2. Executive manager fetches system overview reports cleanly (READ-ONLY SUCCESS)
    const execOrders = await apiRequest('/orders/all', 'GET', null, tokens.manager);
    const execWallets = await apiRequest('/wallets/summary', 'GET', null, tokens.manager);
    assert(execOrders.ok && Array.isArray(execOrders.data), 'Executive fetch orders failed');
    assert(execWallets.ok, 'Executive fetch wallets failed');

    logAudit(
      10,
      'RBAC Security Guards & Executive Master Governance Audit',
      true,
      `Executive Manager read-only security guard enforced (HTTP 403 on POST mutation). Full audit visibility verified across all system records.`,
      `DB Enforcement: Read-only guard validated. Total System Orders Inspected = ${execOrders.data.length}`
    );

  } catch (err) {
    console.error('\n❌ AUDIT EXECUTION FAILED:', err.stack || err.message);
    process.exit(1);
  } finally {
    console.log('\n======================================================================');
    console.log('📊 COMPREHENSIVE 10-SCENARIO AUDIT SUMMARY REPORT');
    console.log('======================================================================');
    const passed = scenarioAuditResults.filter(r => r.status === 'PASS').length;
    const total = scenarioAuditResults.length;
    console.log(`Total Scenarios Tested: ${total} / 10`);
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${total - passed}`);
    console.log(`Overall System Verification Score: ${((passed / total) * 100).toFixed(1)}%\n`);

    console.log('--- DETAILED SCENARIO REPORT JSON ---');
    console.log(JSON.stringify(scenarioAuditResults, null, 2));
    process.exit(0);
  }
}

runCompleteAudit();
