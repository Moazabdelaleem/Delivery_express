const express = require('express');
const router = express.Router();
const walletController = require('../controllers/wallet.controller');
const authMiddleware = require('../middleware/auth');
const roleCheck = require('../middleware/roleCheck');

// Get wallet summary
router.get('/summary', authMiddleware, walletController.getWalletsSummary);

// Finance pull cash out of Collection Wallet (Bulk or Per-Order)
router.post('/collection/pullout', authMiddleware, roleCheck(['finance']), walletController.financePullCashOut);
router.post('/collection/clear-order', authMiddleware, roleCheck(['finance']), walletController.financeClearOrderCash);

// Finance top up Pocket Money Wallet
router.post('/pocket/topup', authMiddleware, roleCheck(['finance']), walletController.financeTopUpPocketMoney);

// Delivery guy record expense with mandatory reason
router.post('/pocket/expense', authMiddleware, roleCheck(['delivery_guy']), walletController.recordPocketExpense);

// Total spent summation & breakdown (Finance, Supervisor, Manager)
router.get('/pocket/breakdown', authMiddleware, roleCheck(['finance', 'supervisor', 'manager']), walletController.getExpensesBreakdown);
router.get('/expenses/breakdown', authMiddleware, roleCheck(['finance', 'supervisor', 'manager']), walletController.getExpensesBreakdown);

// Detailed Driver Pocket Wallet Ledger History (Finance, Manager)
router.get('/ledger/:delivery_guy_id', authMiddleware, roleCheck(['finance', 'manager']), walletController.getDriverWalletLedger);

// Global Wallet Transactions Audit Trail (Finance, Manager)
router.get('/audit', authMiddleware, roleCheck(['finance', 'manager']), walletController.getGlobalAuditTrail);

module.exports = router;
