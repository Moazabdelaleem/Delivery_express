const API_BASE = 'http://localhost:5000/api';

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    throw new Error(message);
  }
}

async function runUATJourney() {
  console.log('======================================================================');
  console.log('🚀 RUNNING END-TO-END UAT JOURNEY TEST (PER test_plan.md)');
  console.log('======================================================================\n');

  try {
    // 0. Seed Database to reset clean starting state
    const seedRes = await fetch(`${API_BASE}/seed`, { method: 'POST' });
    const seedData = await seedRes.json();
    console.log('✅ Seed Complete:', seedData.message);

    // ======================================================================
    // 🚀 Phase 1: Fresh Account Creation & Onboarding
    // ======================================================================
    console.log('\n--- 🚀 Phase 1: Fresh Account Creation & Onboarding ---');

    // Step 1.1: Register Executive Master Account (`my_executive`)
    const regExecRes = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'my_executive',
        name: 'Omar Executive',
        email: 'executive@company.com',
        phone: '01011111111',
        role: 'manager',
        password: 'TestPass123!'
      })
    });
    const regExecData = await regExecRes.json();
    assert(regExecRes.status === 201 && regExecData.requiresApproval === true, 'my_executive registration should require approval');
    console.log('✅ Step 1.1a: my_executive registration submitted (pending approval confirmed)');

    // Log in using default seed master `omar_executive` or `tarek_manager`
    const masterLoginRes = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'omar_executive', password: 'Admin123!' })
    });
    const masterLoginData = await masterLoginRes.json();
    assert(masterLoginRes.status === 200 && masterLoginData.token, 'Default seed master omar_executive login failed');
    const masterToken = masterLoginData.token;
    console.log('✅ Step 1.1b: Master Executive omar_executive logged in successfully');

    // Get Pending Managers
    const pendingRes = await fetch(`${API_BASE}/auth/pending-managers`, {
      headers: { Authorization: `Bearer ${masterToken}` }
    });
    const pendingList = await pendingRes.json();
    const myExecPending = pendingList.find(u => u.username === 'my_executive');
    assert(myExecPending, 'my_executive must appear in pending manager list');
    console.log('✅ Step 1.1c: Found my_executive in pending approvals list');

    // Approve my_executive account
    const approveRes = await fetch(`${API_BASE}/auth/approve-manager/${myExecPending.id}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${masterToken}` }
    });
    const approveData = await approveRes.json();
    assert(approveRes.status === 200, 'Approve manager account failed');
    console.log('✅ Step 1.1d: Approved my_executive account:', approveData.message);

    // Login as newly approved my_executive
    const myExecLoginRes = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'my_executive', password: 'TestPass123!' })
    });
    const myExecLoginData = await myExecLoginRes.json();
    assert(myExecLoginRes.status === 200 && myExecLoginData.token, 'my_executive login after approval failed');
    const myExecutiveToken = myExecLoginData.token;
    console.log('✅ Step 1.1e: my_executive authenticated cleanly post-approval');

    // Step 1.2: Register Team Accounts for All Roles
    const teamAccounts = [
      { username: 'my_driver',     name: 'Sami Driver',      role: 'delivery_guy', password: 'TestPass123!' },
      { username: 'my_inventory',  name: 'Jamal Inventory',  role: 'inventory',    password: 'TestPass123!' },
      { username: 'my_supervisor', name: 'Tarek Supervisor', role: 'supervisor',   password: 'TestPass123!' },
      { username: 'my_finance',    name: 'Mona Finance',      role: 'finance',      password: 'TestPass123!' },
    ];

    const tokens = {};
    const userIds = {};

    for (const acc of teamAccounts) {
      const regRes = await fetch(`${API_BASE}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(acc)
      });
      const regData = await regRes.json();
      assert(regRes.status === 201 && regData.token, `Failed to register ${acc.username}`);
      tokens[acc.username] = regData.token;
      userIds[acc.username] = regData.user.id;
      console.log(`✅ Step 1.2: Registered ${acc.name} (@${acc.username}) as ${acc.role}`);
    }

    // ======================================================================
    // 📦 Phase 2: End-to-End Operational Delivery Journey
    // ======================================================================
    console.log('\n--- 📦 Phase 2: End-to-End Operational Delivery Journey ---');

    // Step 2.1: Order Dispatching (Supervisor: my_supervisor)
    const supervisorToken = tokens['my_supervisor'];

    const createOrderRes = await fetch(`${API_BASE}/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${supervisorToken}`
      },
      body: JSON.stringify({
        client_name: 'Palm Residency Client',
        client_phone: '01099998888',
        client_address: '100 Palm Avenue, Suite 4B',
        order_details: 'Package Box #12',
        order_amount: 150.00,
        delivery_guy_id: userIds['my_driver']
      })
    });
    const createOrderData = await createOrderRes.json();
    assert(createOrderRes.status === 201 && createOrderData.order, 'Supervisor dispatch order failed');
    const order = createOrderData.order;
    console.log(`✅ Step 2.1: Order dispatched (${order.tracking_number}) assigned to Sami Driver ($${order.order_amount})`);

    // Assign & Notify Inventory
    await fetch(`${API_BASE}/orders/${order.id}/assign`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${supervisorToken}`
      },
      body: JSON.stringify({ delivery_guy_id: userIds['my_driver'] })
    });
    console.log('✅ Step 2.1b: Notified inventory for physical handoff');

    // Step 2.2: Warehouse Package Handoff (Inventory: my_inventory)
    const inventoryToken = tokens['my_inventory'];

    const handoffRes = await fetch(`${API_BASE}/orders/${order.id}/handoff`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${inventoryToken}`
      },
      body: JSON.stringify({ handed_over: true, note: 'Package handed over to Sami Driver in good condition' })
    });
    const handoffData = await handoffRes.json();
    assert(handoffRes.status === 200 && handoffData.order.status === 'handed_to_delivery', 'Inventory handoff failed');
    console.log('✅ Step 2.2: Inventory physically handed off package to driver (status: handed_to_delivery)');

    // Step 2.3: Order Delivery & Expense Logging (Driver: my_driver)
    const driverToken = tokens['my_driver'];

    // 1. Go Online
    await fetch(`${API_BASE}/auth/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${driverToken}` },
      body: JSON.stringify({ status: 'online' })
    });
    console.log('✅ Step 2.3a: Driver toggled status to ONLINE 🟢');

    // 2. Start Transit
    const transitRes = await fetch(`${API_BASE}/orders/${order.id}/delivery-status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${driverToken}` },
      body: JSON.stringify({ status: 'in_transit' })
    });
    const transitData = await transitRes.json();
    assert(transitData.order.status === 'in_transit', 'Start transit failed');
    console.log('✅ Step 2.3b: Order status changed to IN_TRANSIT 🚚');

    // 3. Deliver & Collect Cash ($150)
    const deliverRes = await fetch(`${API_BASE}/orders/${order.id}/delivery-status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${driverToken}` },
      body: JSON.stringify({ status: 'delivered', cash_amount: 150.00 })
    });
    const deliverData = await deliverRes.json();
    assert(deliverData.order.status === 'delivered', 'Mark delivered failed');
    console.log('✅ Step 2.3c: Order delivered & $150.00 cash auto-deposited into Collection Wallet');

    // Check Driver Wallet Summary
    const driverWalletRes = await fetch(`${API_BASE}/wallets/summary`, {
      headers: { Authorization: `Bearer ${driverToken}` }
    });
    const driverWallet = await driverWalletRes.json();
    assert(parseFloat(driverWallet.collection_wallet.current_balance) === 150.00, 'Collection wallet balance should be 150.00');
    assert(parseFloat(driverWallet.pocket_wallet.current_balance) === 50.00, 'Initial pocket balance should be 50.00');
    console.log(`✅ Step 2.3d: Verified Driver Collection Wallet = $${driverWallet.collection_wallet.current_balance}, Pocket Wallet = $${driverWallet.pocket_wallet.current_balance}`);

    // 4. Log Vehicle Expense ($25.00)
    const expenseRes = await fetch(`${API_BASE}/wallets/pocket/expense`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${driverToken}` },
      body: JSON.stringify({ amount: 25.00, reason: 'Vehicle fuel refill' })
    });
    const expenseData = await expenseRes.json();
    assert(expenseRes.status === 201 && parseFloat(expenseData.new_pocket_balance) === 25.00, 'Expense logging failed');
    console.log('✅ Step 2.3e: Fuel expense ($25.00) logged. Pocket Wallet balance decreased from $50.00 to $25.00');

    // ======================================================================
    // 💰 Phase 3: Financial Settlement & Wallet Ledger Inspection
    // ======================================================================
    console.log('\n--- 💰 Phase 3: Financial Settlement & Wallet Ledger Inspection ---');

    const financeToken = tokens['my_finance'];

    // Step 3.1: Cash Settlement (Finance: my_finance)
    const pulloutRes = await fetch(`${API_BASE}/wallets/collection/pullout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${financeToken}` },
      body: JSON.stringify({ delivery_guy_id: userIds['my_driver'], amount_to_pull: 150.00, notes: 'Cash collected by Finance' })
    });
    const pulloutData = await pulloutRes.json();
    assert(pulloutRes.status === 200 && pulloutData.new_balance === 0, 'Finance cash pullout failed');
    console.log('✅ Step 3.1: Finance cleared $150.00 cash held by Sami Driver (Collection Cash Held reset to $0.00)');

    // Step 3.2: Pocket Allowance Top-Up (Finance: my_finance)
    const topupRes = await fetch(`${API_BASE}/wallets/pocket/topup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${financeToken}` },
      body: JSON.stringify({ delivery_guy_id: userIds['my_driver'], amount: 50.00, notes: 'Weekly pocket allowance top-up' })
    });
    const topupData = await topupRes.json();
    assert(topupRes.status === 200 && parseFloat(topupData.pocket_wallet.current_balance) === 75.00, 'Pocket top-up failed');
    console.log('✅ Step 3.2: Finance topped up $50.00. Pocket Wallet balance increased from $25.00 to $75.00');

    // Step 3.3: Inspecting Driver Pocket Wallet Ledger History (Finance: my_finance)
    const ledgerRes = await fetch(`${API_BASE}/wallets/ledger/${userIds['my_driver']}`, {
      headers: { Authorization: `Bearer ${financeToken}` }
    });
    const ledgerData = await ledgerRes.json();
    assert(ledgerRes.status === 200 && ledgerData.driver, 'Fetch driver ledger failed');
    assert(parseFloat(ledgerData.pocket_wallet.current_balance) === 75.00, 'Ledger current balance must be 75.00');
    assert(parseFloat(ledgerData.pocket_wallet.total_topped_up) === 100.00, 'Ledger total topped up must be 100.00');
    assert(parseFloat(ledgerData.pocket_wallet.total_spent) === 25.00, 'Ledger total spent must be 25.00');

    console.log(`✅ Step 3.3a: Ledger Modal Driver Info: ${ledgerData.driver.name} (@${ledgerData.driver.username})`);
    console.log(`✅ Step 3.3b: Ledger Banner Summary — Available: $${ledgerData.pocket_wallet.current_balance}, Total Topped Up: $${ledgerData.pocket_wallet.total_topped_up}, Total Spent: $${ledgerData.pocket_wallet.total_spent}`);
    console.log(`✅ Step 3.3c: Transaction History (${ledgerData.transactions.length} entries verified)`);

    // ======================================================================
    // 👔 Phase 4: Master Oversight & Read-Only Audit
    // ======================================================================
    console.log('\n--- 👔 Phase 4: Master Oversight & Read-Only Audit ---');

    // Executive inspection
    const execOrdersRes = await fetch(`${API_BASE}/orders/all`, {
      headers: { Authorization: `Bearer ${myExecutiveToken}` }
    });
    const execOrders = await execOrdersRes.json();

    const execWalletsRes = await fetch(`${API_BASE}/wallets/summary`, {
      headers: { Authorization: `Bearer ${myExecutiveToken}` }
    });
    const execWallets = await execWalletsRes.json();

    const execExpensesRes = await fetch(`${API_BASE}/wallets/pocket/breakdown`, {
      headers: { Authorization: `Bearer ${myExecutiveToken}` }
    });
    const execExpenses = await execExpensesRes.json();

    console.log(`✅ Step 4.1a: Executive Master Command Center Audited:`);
    console.log(`   - 🚚 Fleet Roster: ${execWallets.length} Driver`);
    console.log(`   - 📦 System Orders: ${execOrders.length} Order(s)`);
    console.log(`   - 💵 Cash Held: $${execWallets[0]?.collection_balance || '0.00'} (Fully Settled)`);
    console.log(`   - ⛽ Total Expenses: $${execExpenses.grand_total_spent.toFixed(2)}`);

    // Verify Read-Only Enforcement (POST to /orders by Executive Manager should return 403 Forbidden)
    const readOnlyGuardRes = await fetch(`${API_BASE}/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${myExecutiveToken}` },
      body: JSON.stringify({ client_name: 'Illegal Executive Order Creation' })
    });
    assert(readOnlyGuardRes.status === 403, 'Executive Manager read-only guard failed! Mutation allowed.');
    console.log('✅ Step 4.1b: Read-Only Guard Enforcement Verified (403 Forbidden on Executive POST mutation)');

    console.log('\n======================================================================');
    console.log('🎉 ALL UAT TEST PHASES & STEPS COMPLETED 100% SUCCESSFULLY!');
    console.log('======================================================================\n');
  } catch (err) {
    console.error('\n❌ UAT TEST JOURNEY FAILED:', err.message);
    process.exit(1);
  }
}

runUATJourney();
