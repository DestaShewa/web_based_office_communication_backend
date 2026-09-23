const express = require('express');
const notificationController = require('./notification.controller');
const { protect } = require('../../middlewares/auth.middleware');

const router = express.Router();

// All notification routes require authentication
router.use(protect);

router.get('/', notificationController.getMyNotifications);
router.get('/unread/count', notificationController.getUnreadCount);
router.patch('/read-all', notificationController.markAllAsRead);
router.patch('/:id/read', notificationController.markAsRead);

module.exports = router;
