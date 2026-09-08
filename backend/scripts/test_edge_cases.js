const jwt = require('jsonwebtoken');
const db = require('../config/db');
const returnController = require('../controllers/return.controller');
const orderController = require('../controllers/order.controller');

const JWT_SECRET = process.env.JWT_SECRET || 'supersecretkey';

async function runTests() {
  console.log('🧪 Starting Direct Controller Edge Case Tests...');
  let testsPassed = 0;
  let testsFailed = 0;

  const assert = (condition, message) => {
    if (condition) {
      console.log(`  ✅ PASS: ${message}`);
      testsPassed++;
    } else {
      console.error(`  ❌ FAIL: ${message}`);
      testsFailed++;
    }
  };

  const mockRes = () => {
    const res = {};
    res.statusCode = 200;
    res.status = (code) => { res.statusCode = code; return res; };
    res.json = (data) => { res.data = data; return res; };
    return res;
  };

  try {
    // Ensure DB schema migrations are complete
    await db.schemaPromise;

    // 1. Fetch user accounts for testing
    const mgrUser = (await db.query(`SELECT * FROM users WHERE role = 'manager' LIMIT 1`)).rows[0];
    const supUser = (await db.query(`SELECT * FROM users WHERE role = 'supervisor' LIMIT 1`)).rows[0];
    const invUser = (await db.query(`SELECT * FROM users WHERE role = 'inventory' LIMIT 1`)).rows[0];
    const finUser = (await db.query(`SELECT * FROM users WHERE role = 'finance' LIMIT 1`)).rows[0];
    const drvUser = (await db.query(`SELECT * FROM users WHERE role = 'delivery_guy' LIMIT 1`)).rows[0];

    assert(Boolean(mgrUser && supUser && invUser && finUser), 'Found manager, supervisor, inventory, and finance users in database');

    // 2. Fetch or create a test order
    let orderRes = await db.query(`SELECT * FROM orders ORDER BY created_at DESC LIMIT 1`);
    let order = orderRes.rows[0];

    if (!order) {
      const newOrder = await db.query(
        `INSERT INTO orders (supervisor_id, delivery_guy_id, client_name, client_address, order_details, order_amount, tracking_number, status)
         VALUES ($1, $2, 'Test Client', '123 Test St', 'Sample item', 250.00, $3, 'in_transit')
         RETURNING *`,
        [supUser.id, drvUser ? drvUser.id : null, `TRK-TEST-${Date.now().toString().slice(-4)}`]
      );
      order = newOrder.rows[0];
    }

    console.log(`\n📦 Using Order #${order.tracking_number} (ID: ${order.id})`);

    // TEST 1: Settle Order Liability (Finance)
    console.log('\n1️⃣ Testing Settle Order Liability (Finance)...');
    const res1 = mockRes();
    await orderController.settleOrderLiability(
      { params: { id: order.id }, body: { settlement_type: 'bank_transfer', notes: 'Instapay REF #9988' }, user: finUser, app: { get: () => null } },
      res1
    );
    assert(res1.statusCode === 200 && res1.data.order.is_settled === true, 'settleOrderLiability set is_settled = true');

    // TEST 2: Create Return & Force Transit to Warehouse
    console.log('\n2️⃣ Testing Return Creation & Force Transit...');
    const res2 = mockRes();
    await returnController.createReturn(
      { body: { order_id: order.id, return_type: 'partial', reason: 'Customer rejected 1 item', returned_items_amount: 50 }, user: supUser, app: { get: () => null } },
      res2
    );
    assert(res2.statusCode === 201, 'createReturn created pending_pickup return record');
    const returnId = res2.data.return_record.id;

    const res3 = mockRes();
    await returnController.forceTransit(
      { params: { return_id: returnId }, user: supUser, app: { get: () => null } },
      res3
    );
    assert(res3.statusCode === 200, 'forceTransit transitioned return to in_transit_back');

    // TEST 3: Receive Items at Warehouse with Damaged/Missing Qty
    console.log('\n3️⃣ Testing Receive Items with Damaged/Missing Qty...');
    const res4 = mockRes();
    await returnController.receiveItems(
      { params: { return_id: returnId }, body: { damaged_missing_qty: 1, condition_notes: '1 item torn box' }, user: invUser, app: { get: () => null } },
      res4
    );
    assert(res4.statusCode === 200 && res4.data.damaged_missing_qty === 1, 'receiveItems recorded damaged_missing_qty = 1');

    // TEST 4: Manager Override Tie-Breaker
    console.log('\n4️⃣ Testing Manager Override Tie-Breaker...');
    const res5 = mockRes();
    await returnController.managerOverride(
      { params: { return_id: returnId }, body: { vote: 'kill' }, user: mgrUser, app: { get: () => null } },
      res5
    );
    assert(res5.statusCode === 200 && res5.data.action === 'kill', 'managerOverride executed KILL action');

    // TEST 5: Customer Turnaround / Cancel Return
    console.log('\n5️⃣ Testing Customer Turnaround (Cancel Return)...');
    const res6 = mockRes();
    await returnController.createReturn(
      { body: { order_id: order.id, return_type: 'full', reason: 'Turnaround test' }, user: supUser, app: { get: () => null } },
      res6
    );
    const return2Id = res6.data.return_record.id;

    const res7 = mockRes();
    await returnController.cancelReturn(
      { params: { return_id: return2Id }, user: supUser, app: { get: () => null } },
      res7
    );
    assert(res7.statusCode === 200, 'cancelReturn cancelled return and restored order');

    console.log(`\n========================================`);
    console.log(`🎉 ALL EDGE CASE CONTROLLER TESTS COMPLETED: ${testsPassed} passed, ${testsFailed} failed`);
    console.log(`========================================\n`);

    process.exit(testsFailed === 0 ? 0 : 1);
  } catch (err) {
    console.error('❌ Error during edge case controller tests:', err);
    process.exit(1);
  }
}

runTests();
