const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const auth = require('../middleware/auth');
const roleCheck = require('../middleware/roleCheck');

const rateLimit = require('express-rate-limit');

// Rate limiter for login/register (100 per 15 min)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'test' ? 10000 : 100,
  message: { error: 'Too many login attempts, please wait 15 minutes before trying again.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test'
});

// General rate limiter for other auth endpoints (300 per 15 min)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'test' ? 10000 : 300,
  message: { error: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test'
});

// Public Auth Routes
router.get('/check-username/:username', authController.checkUsernameAvailability);
router.post('/register', loginLimiter, authController.register);
router.post('/login', loginLimiter, authController.login);

// Online Status Toggle (Authenticated)
router.put('/status', auth, roleCheck(['delivery_guy', 'supervisor', 'inventory', 'finance']), authController.updateOnlineStatus);

// Push Token Storage (Authenticated)
router.post('/push-token', auth, authController.savePushToken);


// Role-based User Lookups
router.get('/role/:role', auth, authController.getUsersByRole);

// Manager Approval Endpoints (Manager Role Only)
router.get('/pending-users', auth, roleCheck(['manager']), authController.getPendingUsers);
router.get('/pending-managers', auth, roleCheck(['manager']), authController.getPendingUsers);
router.get('/pending-approvals', auth, roleCheck(['manager']), authController.getPendingUsers);
router.put('/approve-user/:id', auth, roleCheck(['manager']), authController.approveUser);
router.put('/approve-manager/:id', auth, roleCheck(['manager']), authController.approveUser);
router.delete('/reject-user/:id', auth, roleCheck(['manager']), authController.rejectUser);
router.delete('/reject-manager/:id', auth, roleCheck(['manager']), authController.rejectUser);

module.exports = router;
