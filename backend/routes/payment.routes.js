const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/payment.controller');
const authMiddleware = require('../middleware/auth');
const roleCheck = require('../middleware/roleCheck');

// List pending payments for Finance & Manager
router.get('/pending', authMiddleware, roleCheck(['finance', 'manager']), paymentController.getPendingPayments);

// Confirm payment (Finance only)
router.put('/:payment_id/confirm', authMiddleware, roleCheck(['finance']), paymentController.confirmPayment);

// Reject payment (Finance only)
router.put('/:payment_id/reject', authMiddleware, roleCheck(['finance']), paymentController.rejectPayment);

module.exports = router;
