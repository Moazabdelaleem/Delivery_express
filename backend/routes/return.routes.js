const express = require('express');
const router = express.Router();
const returnController = require('../controllers/return.controller');
const authMiddleware = require('../middleware/auth');
const roleCheck = require('../middleware/roleCheck');

// Initiate a return — Supervisor, Manager
router.post('/', authMiddleware, roleCheck(['supervisor', 'manager']), returnController.createReturn);

// Get returns queue — Inventory, Supervisor, Manager, Finance
router.get('/queue', authMiddleware, roleCheck(['inventory', 'supervisor', 'manager', 'finance']), returnController.getReturnsQueue);

// Get assigned return pickups for driver
router.get('/my-pickups', authMiddleware, roleCheck(['delivery_guy']), returnController.getDriverReturnPickups);

// Driver: heading back to warehouse
router.patch('/:return_id/transit-back', authMiddleware, roleCheck(['delivery_guy']), returnController.transitBack);

// Inventory: physically receives items at warehouse
router.patch('/:return_id/receive', authMiddleware, roleCheck(['inventory']), returnController.receiveItems);

// Inventory + Supervisor: cast vote (kill | reassign)
router.post('/:return_id/vote', authMiddleware, roleCheck(['inventory', 'supervisor']), returnController.castVote);

// Legacy: verify/reject return — Inventory (kept for backward compat)
router.put('/:return_id/verify', authMiddleware, roleCheck(['inventory']), returnController.verifyReturn);

// Manager / Admin: override vote conflict tie-breaker
router.post('/:return_id/manager-override', authMiddleware, roleCheck(['manager', 'admin']), returnController.managerOverride);

// Supervisor / Inventory / Manager: force transit to warehouse
router.patch('/:return_id/force-transit', authMiddleware, roleCheck(['supervisor', 'inventory', 'manager']), returnController.forceTransit);

// Supervisor / Manager: cancel return (customer turnaround mid-transit)
router.post('/:return_id/cancel-return', authMiddleware, roleCheck(['supervisor', 'manager']), returnController.cancelReturn);

module.exports = router;
