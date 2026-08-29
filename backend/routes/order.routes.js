const express = require('express');
const router = express.Router();
const orderController = require('../controllers/order.controller');
const authMiddleware = require('../middleware/auth');
const roleCheck = require('../middleware/roleCheck');

// Create order - Supervisor
router.post('/', authMiddleware, roleCheck(['supervisor']), orderController.createOrder);

// Edit order - Supervisor
router.put('/:id', authMiddleware, roleCheck(['supervisor']), orderController.updateOrder);

// Delete order - Supervisor
router.delete('/:id', authMiddleware, roleCheck(['supervisor']), orderController.deleteOrder);

// Assign order - Supervisor
router.put('/:order_id/assign', authMiddleware, roleCheck(['supervisor']), orderController.assignOrder);

// Inventory handoff confirmation - Inventory
router.put('/:order_id/handoff', authMiddleware, roleCheck(['inventory']), orderController.inventoryHandoff);

// Inventory undo handoff - Inventory
router.put('/:order_id/undo-handoff', authMiddleware, roleCheck(['inventory']), orderController.undoHandoff);

// Update delivery status - Delivery Guy
router.put('/:order_id/delivery-status', authMiddleware, roleCheck(['delivery_guy']), orderController.updateDeliveryStatus);

// Get orders for current Delivery Guy (Assigned + Current Day History)
router.get('/my-deliveries', authMiddleware, roleCheck(['delivery_guy']), orderController.getDeliveryGuyOrders);

// Get all orders - Supervisor, Inventory, Finance, Manager
router.get('/all', authMiddleware, roleCheck(['supervisor', 'inventory', 'finance', 'manager']), orderController.getAllOrders);

// Get Order Action Audit Log History
router.get('/:id/audit-trail', authMiddleware, orderController.getOrderAuditTrail);

// Record partial or full payment on order - Delivery Guy, Finance, Supervisor
router.post('/:order_id/payments', authMiddleware, roleCheck(['delivery_guy', 'finance', 'supervisor']), orderController.recordPayment);

const attachmentController = require('../controllers/attachment.controller');
const feedbackController = require('../controllers/feedback.controller');

// Upload photo attachment for order (Generic endpoint) - All authenticated roles
router.post('/:id/attachments', authMiddleware, attachmentController.uploadAttachment);

// Get list of attachments for order (Generic endpoint) - All authenticated roles
router.get('/:id/attachments', authMiddleware, attachmentController.getOrderAttachments);

// Submit customer voice feedback for order - Delivery Guy
router.post('/:id/feedback', authMiddleware, roleCheck(['delivery_guy']), feedbackController.submitOrderFeedback);

// Get customer voice feedback for order - All authenticated roles
router.get('/:id/feedback', authMiddleware, feedbackController.getOrderFeedback);

module.exports = router;
