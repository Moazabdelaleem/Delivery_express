const express = require('express');
const router = express.Router();
const returnController = require('../controllers/return.controller');
const authMiddleware = require('../middleware/auth');
const roleCheck = require('../middleware/roleCheck');

// Initiate a return - Supervisor, Manager
router.post('/', authMiddleware, roleCheck(['supervisor', 'manager']), returnController.createReturn);

// Get returns queue for warehouse verification - Inventory, Supervisor, Manager, Finance
router.get('/queue', authMiddleware, roleCheck(['inventory', 'supervisor', 'manager', 'finance']), returnController.getReturnsQueue);

// Get assigned return pickups for delivery driver - Delivery Guy
router.get('/my-pickups', authMiddleware, roleCheck(['delivery_guy']), returnController.getDriverReturnPickups);

// Verify or reject a return record - Inventory
router.put('/:return_id/verify', authMiddleware, roleCheck(['inventory']), returnController.verifyReturn);

module.exports = router;
