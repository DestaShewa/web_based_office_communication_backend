const notificationService = require('./notification.service');
const catchAsync = require('../../utils/catchAsync');
const sendResponse = require('../../utils/apiResponse');

/**
 * @desc    Get all notifications for logged-in user
 * @route   GET /api/v1/notifications
 * @access  Any authenticated user
 */
exports.getMyNotifications = catchAsync(async (req, res, next) => {
    const { limit, page } = req.query;
    
    const notifications = await notificationService.getMyNotifications(
        req.user._id,
        parseInt(limit) || 50,
        parseInt(page) || 1
    );
    
    sendResponse(res, 200, 'Notifications retrieved successfully', { 
        results: notifications.length, 
        notifications 
    });
});

/**
 * @desc    Get unread notification count
 * @route   GET /api/v1/notifications/unread/count
 * @access  Any authenticated user
 */
exports.getUnreadCount = catchAsync(async (req, res, next) => {
    const count = await notificationService.getUnreadCount(req.user._id);
    sendResponse(res, 200, 'Unread count retrieved', { count });
});

/**
 * @desc    Mark a single notification as read
 * @route   PATCH /api/v1/notifications/:id/read
 * @access  Any authenticated user
 */
exports.markAsRead = catchAsync(async (req, res, next) => {
    const notification = await notificationService.markAsRead(req.params.id, req.user._id);
    sendResponse(res, 200, 'Notification marked as read', { notification });
});

/**
 * @desc    Mark all notifications as read for current user
 * @route   PATCH /api/v1/notifications/read-all
 * @access  Any authenticated user
 */
exports.markAllAsRead = catchAsync(async (req, res, next) => {
    await notificationService.markAllAsRead(req.user._id);
    sendResponse(res, 200, 'All notifications marked as read', null);
});
