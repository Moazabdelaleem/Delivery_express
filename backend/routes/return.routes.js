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

module.exports = router;
