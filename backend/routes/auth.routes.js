const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const auth = require('../middleware/auth');
const roleCheck = require('../middleware/roleCheck');

const rateLimit = require('express-rate-limit');

// Rate limiter for Auth routes (10 requests per 15 mins)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many attempts, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Public Auth Routes
router.get('/check-username/:username', authController.checkUsernameAvailability);
router.post('/register', authLimiter, authController.register);
router.post('/login', authLimiter, authController.login);

// Online Status Toggle (Authenticated)
router.put('/status', auth, authController.updateOnlineStatus);

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
