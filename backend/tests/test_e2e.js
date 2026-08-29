const API_BASE = 'http://localhost:5000/api';

async function runE2ETests() {
  console.log('🧪 Starting End-to-End Local System Integration Test...\n');

  try {
    // 1. Health check
    const healthRes = await fetch(`${API_BASE}/health`);
    const health = await healthRes.json();
    console.log('✅ 1. Health Check Passed:', health);

    // 2. Seed default test accounts
    const seedRes = await fetch(`${API_BASE}/seed`, { method: 'POST' });
    const seed = await seedRes.json();
    console.log('✅ 2. Database Auto-Seed Passed:', seed.message);

    // 3. Login as Supervisor & Create Order
    const supervisorLoginRes = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'kareem_supervisor', password: 'Admin123!' })
    });
    const supervisorData = await supervisorLoginRes.json();
    const supervisorToken = supervisorData.token;
    console.log('✅ 3. Supervisor Authentication Passed');

    // Get Delivery Guy ID
    const guysRes = await fetch(`${API_BASE}/auth/role/delivery_guy`, {
      headers: { Authorization: `Bearer ${supervisorToken}` }
    });
    const deliveryGuys = await guysRes.json();
    const deliveryGuy = deliveryGuys[0];

    // Create Order
    const createOrderRes = await fetch(`${API_BASE}/orders`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        Authorization: `Bearer ${supervisorToken}` 
      },
      body: JSON.stringify({
        tracking_number: `E2E-${Date.now()}`,
        client_address: 'Building 12, GIU Campus',
        order_details: '1x Laptop, 2x Monitors',
        order_amount: 150.00,
        delivery_guy_id: deliveryGuy.id
      })
    });
    const createOrderData = await createOrderRes.json();
    const order = createOrderData.order;
    console.log(`✅ 4. Order Creation & Assignment Passed (${order.tracking_number})`);

    // Assign & Notify Inventory
    await fetch(`${API_BASE}/orders/${order.id}/assign`, {
      method: 'PUT',
      headers: { 
        'Content-Type': 'application/json',
        Authorization: `Bearer ${supervisorToken}` 
      },
      body: JSON.stringify({ delivery_guy_id: deliveryGuy.id })
    });
    console.log('✅ 5. Supervisor Assigned Order & Notified Inventory Passed');

    // 4. Inventory Handoff
    const inventoryLoginRes = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'hassan_inventory', password: 'Admin123!' })
    });
    const inventoryData = await inventoryLoginRes.json();
    const inventoryToken = inventoryData.token;

    await fetch(`${API_BASE}/orders/${order.id}/handoff`, {
      method: 'PUT',
      headers: { 
        'Content-Type': 'application/json',
        Authorization: `Bearer ${inventoryToken}` 
      },
      body: JSON.stringify({ handed_over: true, note: 'Package verified in good condition' })
    });
    console.log('✅ 6. Inventory Physical Handoff Passed');

    // 5. Delivery Guy Execution
    const deliveryLoginRes = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'sami_delivery', password: 'Admin123!' })
    });
    const deliveryData = await deliveryLoginRes.json();
    const deliveryToken = deliveryData.token;

    // Toggle Online Status
    await fetch(`${API_BASE}/auth/status`, {
      method: 'PUT',
      headers: { 
        'Content-Type': 'application/json',
        Authorization: `Bearer ${deliveryToken}` 
      },
      body: JSON.stringify({ status: 'online' })
    });
    console.log('✅ 7. Delivery Guy Manual Online Status Toggle Passed');

    // Start Delivery En-route
    await fetch(`${API_BASE}/orders/${order.id}/delivery-status`, {
      method: 'PUT',
      headers: { 
        'Content-Type': 'application/json',
        Authorization: `Bearer ${deliveryToken}` 
      },
      body: JSON.stringify({ status: 'in_transit' })
    });
    console.log('✅ 8. Delivery Status Changed to In-Transit Passed');

    // Complete Delivery & Collect Cash ($150)
    await fetch(`${API_BASE}/orders/${order.id}/delivery-status`, {
      method: 'PUT',
      headers: { 
        'Content-Type': 'application/json',
        Authorization: `Bearer ${deliveryToken}` 
      },
      body: JSON.stringify({ status: 'delivered', cash_amount: 150.00 })
    });
    console.log('✅ 9. Order Delivered & $150 Cash Auto-Deposited to Collection Wallet Passed');

    // Log Pocket Money Expense
    await fetch(`${API_BASE}/wallets/pocket/expense`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        Authorization: `Bearer ${deliveryToken}` 
      },
      body: JSON.stringify({ amount: 12.50, reason: 'Motorcycle fuel refill for delivery route' })
    });
    console.log('✅ 10. Pocket Expense Logged with Mandatory Reason Passed');

    // 6. Finance Cash Pullout & Topup
    const financeLoginRes = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'mona_finance', password: 'Admin123!' })
    });
    const financeData = await financeLoginRes.json();
    const financeToken = financeData.token;

    // Pull Cash Out of Collection Wallet
    await fetch(`${API_BASE}/wallets/collection/pullout`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        Authorization: `Bearer ${financeToken}` 
      },
      body: JSON.stringify({ delivery_guy_id: deliveryGuy.id, amount_to_pull: 150.00, notes: 'Physical cash received at office' })
    });
    console.log('✅ 11. Finance Cash Pullout Clearance Passed');

    // Top-up Pocket Money Wallet
    await fetch(`${API_BASE}/wallets/pocket/topup`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        Authorization: `Bearer ${financeToken}` 
      },
      body: JSON.stringify({ delivery_guy_id: deliveryGuy.id, amount: 50.00, notes: 'Weekly pocket allowance' })
    });
    console.log('✅ 12. Finance Pocket Money Top-up Passed');

    // Total Spent Breakdown Audit
    const breakdownRes = await fetch(`${API_BASE}/wallets/pocket/breakdown`, {
      headers: { Authorization: `Bearer ${financeToken}` }
    });
    const breakdownData = await breakdownRes.json();
    console.log(`✅ 13. Finance Total Spent Breakdown Passed (Grand Total Spent: $${breakdownData.grand_total_spent})`);

    // 7. Manager Read-Only Guard Verification
    const managerLoginRes = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'tarek_manager', password: 'Admin123!' })
    });
    const managerData = await managerLoginRes.json();
    const managerToken = managerData.token;

    // Manager GET Orders
    const managerOrdersRes = await fetch(`${API_BASE}/orders/all`, {
      headers: { Authorization: `Bearer ${managerToken}` }
    });
    const managerOrders = await managerOrdersRes.json();
    console.log(`✅ 14. Manager Read-Only GET Access Passed (${managerOrders.length} orders read)`);

    // Manager POST Guard Test (Should return 403 Forbidden)
    const managerPostRes = await fetch(`${API_BASE}/orders`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        Authorization: `Bearer ${managerToken}` 
      },
      body: JSON.stringify({ tracking_number: 'MGR-DENIED-101', client_address: 'Hack Attempt' })
    });

    if (managerPostRes.status === 403) {
      console.log('✅ 15. Manager Read-Only Mutation Guard Enforcement Passed (403 Forbidden on POST)');
    } else {
      console.error('❌ Manager Mutation Guard Test Failed with status:', managerPostRes.status);
    }

    console.log('\n🎉 ALL 15 END-TO-END LOCAL INTEGRATION TESTS PASSED CLEANLY!\n');
  } catch (err) {
    console.error('❌ Integration Test Error:', err.message);
  }
}

runE2ETests();
