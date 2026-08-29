const express = require('express');
const router = express.Router();
const shiftController = require('../controllers/shift.controller');
const authMiddleware = require('../middleware/auth');
const roleCheck = require('../middleware/roleCheck');

// Clock In / Go Active (Location confirmed within warehouse radius) - Delivery Guy
router.post('/clock-in', authMiddleware, roleCheck(['delivery_guy']), shiftController.clockIn);

// Clock Out / Go Offline (No location restriction) - Delivery Guy
router.post('/clock-out', authMiddleware, roleCheck(['delivery_guy']), shiftController.clockOut);

// Update background Live GPS location - Delivery Guy
router.post('/location', authMiddleware, roleCheck(['delivery_guy']), shiftController.updateLocation);

// Read-only worked hours summary - Supervisor, Manager
router.get('/summary', authMiddleware, roleCheck(['supervisor', 'manager']), shiftController.getShiftSummary);
router.get('/summary/:driver_id', authMiddleware, roleCheck(['supervisor', 'manager']), shiftController.getShiftSummary);

module.exports = router;
