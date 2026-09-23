const Notification = require('./notification.model');
const socketUtil = require('../../utils/socket');
const AppError = require('../../utils/AppError');
const { resolveId, getIdentifierQuery } = require('../../utils/helpers');

/**
 * Send a notification (creates DB record + emits via Socket.IO)
 */
const sendNotification = async ({ recipient, type, title, message, link, targetId, sender }) => {
    // Resolve recipient ID
    const resolvedRecipient = await resolveId(recipient, 'User');

    // 1. Create the persistent DB record
    const notification = await Notification.create({
        recipient: resolvedRecipient,
        type,
        title,
        message,
        link,
        targetId,
        sender,
    });

    // 2. Emit the real-time event to the user
    socketUtil.emitToUser(resolvedRecipient.toString(), 'new_notification', notification);
    socketUtil.emitToUser(resolvedRecipient.toString(), 'notification_count_update');

    return notification;
};

/**
 * Send a notification to all users of a specific role (e.g., ADMIN)
 */
const notifyRole = async (role, { type, title, message, link, targetId, sender }) => {
    const User = require('../users/user.model');
    const users = await User.find({ role, isActive: true }).select('_id customId');

    const notifications = await Promise.all(
        users.map(user => 
            sendNotification({
                recipient: user.customId,
                type,
                title,
                message,
                link,
                targetId,
                sender,
            })
        )
    );

    return notifications;
};

/**
 * Get a user's notifications (paginated)
 */
const getMyNotifications = async (userId, limit = 50, page = 1) => {
    const resolvedUserId = await resolveId(userId, 'User');
    const skip = (page - 1) * limit;

    // Only return unread notifications as per the new UX: once read, they leave the active list
    const notifications = await Notification.find({ recipient: resolvedUserId, isRead: false })
        .sort({ createdAt: -1 }) // Newest first
        .skip(skip)
        .limit(limit)
        .populate('recipientData', 'name customId')
        .populate('senderData', 'name profilePhoto customId');

    return notifications;
};

/**
 * Mark a single notification as read
 */
const markAsRead = async (notificationId, userId) => {
    const resolvedUserId = await resolveId(userId, 'User');
    const notification = await Notification.findOne({ 
        ...getIdentifierQuery(notificationId), 
        recipient: resolvedUserId 
    });

    if (!notification) {
        throw new AppError('Notification not found or access denied', 404);
    }

    notification.isRead = true;
    await notification.save();

    // Emit live count update and list refresh event
    socketUtil.emitToUser(resolvedUserId, 'notification_count_update');
    socketUtil.emitToUser(resolvedUserId, 'new_notification');

    return notification;
};

/**
 * Mark all unread notifications as read for a user
 */
const markAllAsRead = async (userId) => {
    const resolvedUserId = await resolveId(userId, 'User');
    await Notification.updateMany({ recipient: resolvedUserId, isRead: false }, { isRead: true });
    
    // Emit live count update and list refresh event
    socketUtil.emitToUser(resolvedUserId, 'notification_count_update');
    socketUtil.emitToUser(resolvedUserId, 'new_notification');

    return true;
};

/**
 * Get the count of unread notifications for a user
 */
const getUnreadCount = async (userId) => {
    const resolvedUserId = await resolveId(userId, 'User');
    const count = await Notification.countDocuments({ recipient: resolvedUserId, isRead: false });
    return count;
};

module.exports = {
    sendNotification,
    getMyNotifications,
    markAsRead,
    markAllAsRead,
    getUnreadCount,
    notifyRole,
};
