const { pool } = require('../config/db');

const API_BASE = 'http://localhost:5000/api';

async function loginUser(username, password) {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Login failed for ${username}: ${data.error || res.statusText}`);
  return { token: data.token, user: data.user };
}

async function runConcurrencyTest() {
  console.log('======================================================================');
  console.log('⚡ STARTING CONCURRENT WALLET LOAD & ROW-LOCKING TEST');
  console.log('======================================================================\n');

  try {
    // 0. Authenticate
    const driverAuth = await loginUser('sami_delivery', 'Admin123!');
    const supervisorAuth = await loginUser('kareem_supervisor', 'Admin123!');
    const inventoryAuth = await loginUser('hassan_inventory', 'Admin123!');
    const financeAuth = await loginUser('mona_finance', 'Admin123!');

    const driverId = driverAuth.user.id;

    // Reset driver wallet state for clean baseline
    await pool.query('DELETE FROM wallet_transactions WHERE delivery_guy_id = $1', [driverId]);
    await pool.query('DELETE FROM pocket_expenses WHERE delivery_guy_id = $1', [driverId]);
    await pool.query('UPDATE pocket_wallets SET current_balance = 0.00, total_topped_up = 0.00, total_spent = 0.00 WHERE delivery_guy_id = $1', [driverId]);

    // ======================================================================
    // SCENARIO A: Two Simultaneous Cash Pullouts (Collection Wallet)
    // ======================================================================
    console.log('--- SCENARIO A: Two Simultaneous Finance Cash Pullouts ---');

    // Create and deliver a $100.00 order
    const trackingCode = `CONCUR-A-${Date.now()}`;
    const orderRes = await fetch(`${API_BASE}/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${supervisorAuth.token}` },
      body: JSON.stringify({
        tracking_number: trackingCode,
        client_address: '100 Concurrency Lane',
        order_details: 'Test Item Concurrency A',
        order_amount: 100.00,
        delivery_guy_id: driverId
      })
    });
    const orderData = await orderRes.json();
    const orderId = orderData.order.id;

    // Attach mandatory handoff photo proof
    await pool.query(
      `INSERT INTO order_attachments (order_id, stage, uploaded_by, is_required, storage_url)
       VALUES ($1, 'inventory_handoff', $2, true, 'http://example.com/proof.jpg')`,
      [orderId, supervisorAuth.user.id]
    );

    // Handoff -> In-Transit -> Delivered
    await fetch(`${API_BASE}/orders/${orderId}/handoff`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${inventoryAuth.token}` },
      body: JSON.stringify({ handed_over: true, note: 'Handoff concurrency test' })
    });
    await fetch(`${API_BASE}/orders/${orderId}/delivery-status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${driverAuth.token}` },
      body: JSON.stringify({ status: 'in_transit' })
    });
    await fetch(`${API_BASE}/orders/${orderId}/delivery-status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${driverAuth.token}` },
      body: JSON.stringify({ status: 'delivered', cash_amount: 100.00 })
    });

    // Check collection wallet balance before pullout
    const collectionBeforeRes = await pool.query(
      "SELECT COALESCE(SUM(CAST(order_amount AS NUMERIC)), 0.00) as bal FROM orders WHERE delivery_guy_id = $1 AND status = 'delivered'",
      [driverId]
    );
    const collectionBalBefore = parseFloat(collectionBeforeRes.rows[0].bal);
    console.log(`       Collection Balance BEFORE pullouts: $${collectionBalBefore.toFixed(2)}`);

    // Fire 2 simultaneous pullouts at the exact same moment
    const pulloutPromise1 = fetch(`${API_BASE}/wallets/collection/pullout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${financeAuth.token}` },
      body: JSON.stringify({ delivery_guy_id: driverId, amount_to_pull: 100.00, notes: 'Pullout Req 1' })
    });
    const pulloutPromise2 = fetch(`${API_BASE}/wallets/collection/pullout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${financeAuth.token}` },
      body: JSON.stringify({ delivery_guy_id: driverId, amount_to_pull: 100.00, notes: 'Pullout Req 2' })
    });

    const [pullRes1, pullRes2] = await Promise.all([pulloutPromise1, pulloutPromise2]);
    const pullData1 = await pullRes1.json();
    const pullData2 = await pullRes2.json();

    console.log(`       Pullout Req 1 Response (${pullRes1.status}):`, JSON.stringify(pullData1));
    console.log(`       Pullout Req 2 Response (${pullRes2.status}):`, JSON.stringify(pullData2));

    const collectionAfterRes = await pool.query(
      "SELECT COALESCE(SUM(CAST(order_amount AS NUMERIC)), 0.00) as bal FROM orders WHERE delivery_guy_id = $1 AND status = 'delivered'",
      [driverId]
    );
    const collectionBalAfter = parseFloat(collectionAfterRes.rows[0].bal);
    console.log(`       Collection Balance AFTER pullouts:  $${collectionBalAfter.toFixed(2)}`);
    console.log(`       Expected Collection Balance:        $0.00`);
    const passScenarioA = (collectionBalAfter === 0.00) && (pullRes1.status === 200 || pullRes2.status === 200) && (pullRes1.status !== 200 || pullRes2.status !== 200);
    console.log(`       Result: ${passScenarioA ? '[PASS] Controlled row-locking prevented double pullout' : '[FAIL OR DISCREPANCY DETECTED]'}\n`);

    // ======================================================================
    // SCENARIO B: Two Simultaneous Pocket Expenses (Pocket Wallet)
    // ======================================================================
    console.log('--- SCENARIO B: Two Simultaneous Pocket Expense Logs ---');

    // Top up pocket wallet to $100.00 baseline
    await fetch(`${API_BASE}/wallets/pocket/topup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${financeAuth.token}` },
      body: JSON.stringify({ delivery_guy_id: driverId, amount: 100.00, notes: 'Baseline topup for Scenario B' })
    });

    const pocketBeforeB = await pool.query('SELECT current_balance, total_spent FROM pocket_wallets WHERE delivery_guy_id = $1', [driverId]);
    const pBalBeforeB = parseFloat(pocketBeforeB.rows[0].current_balance);
    console.log(`       Pocket Balance BEFORE expenses: $${pBalBeforeB.toFixed(2)}`);

    // Fire 2 simultaneous expenses ($30.00 and $40.00)
    const expPromise1 = fetch(`${API_BASE}/wallets/pocket/expense`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${driverAuth.token}` },
      body: JSON.stringify({ amount: 30.00, reason: 'Concurrent Fuel A' })
    });
    const expPromise2 = fetch(`${API_BASE}/wallets/pocket/expense`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${driverAuth.token}` },
      body: JSON.stringify({ amount: 40.00, reason: 'Concurrent Fuel B' })
    });

    const [expRes1, expRes2] = await Promise.all([expPromise1, expPromise2]);
    const expData1 = await expRes1.json();
    const expData2 = await expRes2.json();

    console.log(`       Expense Req 1 ($30) Response (${expRes1.status}):`, JSON.stringify(expData1));
    console.log(`       Expense Req 2 ($40) Response (${expRes2.status}):`, JSON.stringify(expData2));

    const pocketAfterB = await pool.query('SELECT current_balance, total_spent FROM pocket_wallets WHERE delivery_guy_id = $1', [driverId]);
    const pBalAfterB = parseFloat(pocketAfterB.rows[0].current_balance);
    const pSpentAfterB = parseFloat(pocketAfterB.rows[0].total_spent);
    console.log(`       Pocket Balance AFTER expenses:  $${pBalAfterB.toFixed(2)} (Total Spent: $${pSpentAfterB.toFixed(2)})`);
    console.log(`       Expected Pocket Balance:        $30.00 ($100 - $30 - $40)`);
    const passScenarioB = (pBalAfterB === 30.00) && (expRes1.status === 201) && (expRes2.status === 201);
    console.log(`       Result: ${passScenarioB ? '[PASS] Exact mathematical balance maintained under concurrent write' : '[FAIL OR DISCREPANCY DETECTED]'}\n`);

    // ======================================================================
    // SCENARIO C: Simultaneous Top-Up ($50) and Expense ($20)
    // ======================================================================
    console.log('--- SCENARIO C: Simultaneous Top-Up ($50) and Expense ($20) ---');

    const pocketBeforeC = await pool.query('SELECT current_balance FROM pocket_wallets WHERE delivery_guy_id = $1', [driverId]);
    const pBalBeforeC = parseFloat(pocketBeforeC.rows[0].current_balance);
    console.log(`       Pocket Balance BEFORE mixed ops: $${pBalBeforeC.toFixed(2)}`);

    // Fire 1 top-up ($50.00) and 1 expense ($20.00) at the exact same moment
    const topupPromiseC = fetch(`${API_BASE}/wallets/pocket/topup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${financeAuth.token}` },
      body: JSON.stringify({ delivery_guy_id: driverId, amount: 50.00, notes: 'Simultaneous topup' })
    });
    const expensePromiseC = fetch(`${API_BASE}/wallets/pocket/expense`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${driverAuth.token}` },
      body: JSON.stringify({ amount: 20.00, reason: 'Simultaneous expense' })
    });

    const [mixTopRes, mixExpRes] = await Promise.all([topupPromiseC, expensePromiseC]);
    const mixTopData = await mixTopRes.json();
    const mixExpData = await mixExpRes.json();

    console.log(`       Top-up Req ($50) Response (${mixTopRes.status}):`, JSON.stringify(mixTopData));
    console.log(`       Expense Req ($20) Response (${mixExpRes.status}):`, JSON.stringify(mixExpData));

    const pocketAfterC = await pool.query('SELECT current_balance, total_topped_up, total_spent FROM pocket_wallets WHERE delivery_guy_id = $1', [driverId]);
    const pBalAfterC = parseFloat(pocketAfterC.rows[0].current_balance);
    const expectedC = pBalBeforeC + 50.00 - 20.00;
    console.log(`       Pocket Balance AFTER mixed ops: $${pBalAfterC.toFixed(2)}`);
    console.log(`       Expected Pocket Balance:        $${expectedC.toFixed(2)} ($${pBalBeforeC.toFixed(2)} + $50 - $20)`);
    const passScenarioC = (pBalAfterC === expectedC) && (mixTopRes.status === 200) && (mixExpRes.status === 201);
    console.log(`       Result: ${passScenarioC ? '[PASS] FOR UPDATE locking serialized mixed topup/expense accurately' : '[FAIL OR DISCREPANCY DETECTED]'}\n`);

    // Clean up test order
    await pool.query('DELETE FROM order_attachments WHERE order_id = $1', [orderId]);
    await pool.query('DELETE FROM order_status_history WHERE order_id = $1', [orderId]);
    await pool.query('DELETE FROM orders WHERE id = $1', [orderId]);

  } catch (err) {
    console.error('CONCURRENCY TEST ERROR:', err.message);
  } finally {
    await pool.end();
    console.log('======================================================================');
    console.log('CONCURRENT WALLET LOAD TEST COMPLETED');
    console.log('======================================================================\n');
  }
}

runConcurrencyTest();
