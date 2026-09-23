const messageService = require('./message.service');
const Group = require('./group.model');
const User = require('../users/user.model');
const catchAsync = require('../../utils/catchAsync');
const sendResponse = require('../../utils/apiResponse');
const AppError = require('../../utils/AppError');
const { isAuthorizedToMessage } = require('../../utils/rbac');
const { resolveId } = require('../../utils/helpers');
const logger = require('../../utils/logger');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

/**
 * Get conversation history between current user and another person
 */
exports.getChatHistory = catchAsync(async (req, res, next) => {
    const otherUserId = req.params.userId;
    const { limit, page } = req.query;

    const messages = await messageService.getConversation(
        req.user.customId,
        otherUserId,
        parseInt(limit) || 50,
        parseInt(page) || 1
    );

    sendResponse(res, 200, 'Conversation history retrieved', { 
        results: messages.length, 
        messages 
    });
});

/**
 * Get department message history
 */
exports.getDepartmentChat = catchAsync(async (req, res, next) => {
    const departmentId = req.params.deptId;
    const { limit, page } = req.query;

    // Basic authorization check could be added here to ensure user belongs to dept

    const messages = await messageService.getDepartmentHistory(
        departmentId,
        parseInt(limit) || 50,
        parseInt(page) || 1
    );

    sendResponse(res, 200, 'Department chat history retrieved', { 
        results: messages.length, 
        messages 
    });
});

/**
 * Get group message history
 */
exports.getGroupChat = catchAsync(async (req, res, next) => {
    const groupId = req.params.groupId;
    const { limit, page } = req.query;

    const messages = await messageService.getGroupHistory(
        groupId,
        parseInt(limit) || 50,
        parseInt(page) || 1
    );

    const Group = require('./group.model');
    const group = await Group.findOne({ customId: groupId }).populate('membersData', 'name customId profilePhoto role status');
    
    if (!group) {
        return next(new AppError('Group not found', 404));
    }

    sendResponse(res, 200, 'Group chat history retrieved', { 
        results: messages.length, 
        group,
        messages 
    });
});

/**
 * Delete a group permanently
 */
exports.deleteGroup = catchAsync(async (req, res, next) => {
    const { groupId } = req.params;
    await messageService.deleteGroup(groupId, req.user.customId);
    sendResponse(res, 200, 'Group deleted successfully', null);
});

/**
 * Remove a member from a group
 */
exports.removeGroupMember = catchAsync(async (req, res, next) => {
    const { groupId, memberId } = req.params;
    const group = await messageService.removeMemberFromGroup(groupId, memberId, req.user.customId);
    sendResponse(res, 200, 'Member removed from group successfully', { group });
});

/**
 * Add members to a group
 */
exports.addGroupMembers = catchAsync(async (req, res, next) => {
    const { groupId } = req.params;
    const { memberIds } = req.body;
    
    if (!memberIds || !Array.isArray(memberIds) || memberIds.length === 0) {
        return next(new AppError('Please provide members to add', 400));
    }

    const group = await messageService.addMembersToGroup(groupId, memberIds, req.user.customId);
    sendResponse(res, 200, 'Members added to group successfully', { group });
});

/**
 * Update group profile photo
 */
exports.updateGroupPhoto = catchAsync(async (req, res, next) => {
    const { groupId } = req.params;
    
    if (!req.file) {
        return next(new AppError('Please upload a photo', 400));
    }

    const GroupModel = require('./group.model');
    const group = await GroupModel.findOne({ customId: groupId });
    
    if (!group) {
        return next(new AppError('Group not found', 404));
    }

    // Only creator can update photo
    if (group.createdBy !== req.user.customId) {
        return next(new AppError('Only the creator can update the profile photo', 403));
    }

    const fileName = `processed_group_${groupId}_${Date.now()}.jpg`;
    const outputPath = path.join(__dirname, '../../../uploads/profiles', fileName);
    const photoUrl = `/uploads/profiles/${fileName}`;

    try {
        // 1. Process image: Resize to 500x500, compress to JPEG
        await sharp(req.file.path)
            .resize(500, 500, {
                fit: 'cover',
                position: 'center'
            })
            .jpeg({ quality: 90 })
            .toFile(outputPath);

        // 2. Remove the original uploaded file (temp)
        try {
            await fs.promises.unlink(req.file.path);
        } catch (err) {
            // Silently fail if file already gone
        }

        // 3. Delete old photo if it exists
        if (group.profilePhoto) {
            const oldPhotoPath = path.join(__dirname, '../../../', group.profilePhoto);
            try {
                if (fs.existsSync(oldPhotoPath)) {
                    await fs.promises.unlink(oldPhotoPath);
                }
            } catch (err) {
                // Silently fail if old file operation fails
            }
        }

        // 4. Update the model
        group.profilePhoto = photoUrl;
        await group.save();

        sendResponse(res, 200, 'Group profile photo updated successfully', { group });
    } catch (err) {
        logger.error(`Error processing group photo: ${err.message}`);
        return next(new AppError('Error processing image', 500));
    }
});

/**
 * Upload a file and return URL
 */
exports.uploadFile = catchAsync(async (req, res, next) => {
    logger.info('Controller: uploadFile called');
    if (!req.file) {
        logger.error('No file provided in uploadFile');
        return next(new AppError('No file provided', 400));
    }
    const fileUrl = `/uploads/messages/${req.file.filename}`;
    sendResponse(res, 200, 'File uploaded successfully', { fileUrl });
});

/**
 * Get list of groups current user belongs to
 */
exports.getGroups = catchAsync(async (req, res, next) => {
    const groups = await messageService.getGroupsForUser(req.user.customId);
    sendResponse(res, 200, 'Groups retrieved successfully', { groups });
});

/**
 * Create a new group chat
 */
exports.createGroup = catchAsync(async (req, res, next) => {
    const { name, members } = req.body;
    
    if (!name || !members || !Array.isArray(members) || members.length === 0) {
        return next(new AppError('Please provide group name and members', 400));
    }

    // Role-based member validation
    const facultyId = req.user.faculty;
    const departmentId = req.user.department;

    // Ensure all members exist and belong to the correct faculty/department
    const targetMembers = await User.find({ customId: { $in: members } });
    
    if (targetMembers.length !== members.length) {
        return next(new AppError('Some members were not found', 404));
    }

    if (req.user.role === 'dean') {
        const outsideFaculty = targetMembers.find(m => m.faculty !== facultyId);
        if (outsideFaculty) {
            return next(new AppError(`Cannot add member ${outsideFaculty.name} from outside your faculty`, 403));
        }
    } else if (req.user.role === 'coordinator') {
        const outsideDept = targetMembers.find(m => m.department !== departmentId);
        if (outsideDept) {
            return next(new AppError(`Cannot add member ${outsideDept.name} from outside your department`, 403));
        }
    } else {
        return next(new AppError('Only Deans and Coordinators can create group chats', 403));
    }

    // Add creator to members if not already there
    const finalMembers = members.includes(req.user.customId) ? members : [...members, req.user.customId];

    const group = await Group.create({
        name,
        members: finalMembers,
        createdBy: req.user.customId,
        faculty: req.user.role === 'dean' ? facultyId : null,
        department: req.user.role === 'coordinator' ? departmentId : null
    });

    sendResponse(res, 201, 'Group created successfully', { group });
});

/**
 * Mark a conversation as read
 */
exports.markAsRead = catchAsync(async (req, res, next) => {
    const senderId = req.params.userId;
    
    await messageService.markConversationAsRead(req.user.customId, senderId);
    
    // Notify the sender that their messages were read
    const socketUtil = require('../../utils/socket');
    socketUtil.emitToUser(senderId, 'messages_read', {
        readerId: req.user.customId,
        readAt: new Date()
    });

    sendResponse(res, 200, 'Conversation marked as read');
});

/**
 * Get unread message count
 */
exports.getUnreadCount = catchAsync(async (req, res, next) => {
    const count = await messageService.getUnreadCount(req.user.customId);
    sendResponse(res, 200, 'Unread count retrieved', { count });
});

/**
 * Get list of recent conversations
 */
exports.getConversations = catchAsync(async (req, res, next) => {
    const userId = req.user.customId || req.user._id;
    const conversations = await messageService.getConversations(userId);
    
    sendResponse(res, 200, 'Conversations retrieved', { conversations });
});


/**
 * Send a voice message
 */
exports.sendVoiceMessage = catchAsync(async (req, res, next) => {
    if (!req.file) {
        return next(new AppError('No voice recording provided', 400));
    }

    const payload = { ...req.body };
    if (payload.replyTo && typeof payload.replyTo === 'string') {
        try { payload.replyTo = JSON.parse(payload.replyTo); } catch (e) {}
    }

    if (!payload.type || payload.type === 'direct') {
        const User = require('../users/user.model');
        const receiverCustomId = await resolveId(payload.receiver, 'User');
        const targetUser = await User.findOne({ customId: receiverCustomId });
        if (!targetUser) throw new AppError('Receiver not found', 404);
        
        if (!isAuthorizedToMessage(req.user, targetUser)) {
            return next(new AppError('You do not have permission to message this user.', 403));
        }
    }

    const message = await messageService.saveVoiceMessage(
        payload,
        req.file,
        req.user.customId
    );

    // Emit via Socket.io for real-time delivery
    const socketUtil = require('../../utils/socket');
    const receiverId = message.receiver; // This is the customId string
    const senderId = req.user.customId;

    if (message.type === 'direct') {
        socketUtil.emitToUser(receiverId, 'new_message', message);
        await messageService.updateMessageStatus(message._id, 'delivered');
    } else {
        const io = socketUtil.getIO();
        io.to(`dept_${receiverId}`).emit('new_message', message);
    }
    // Confirm back to sender for optimistic bubble reconciliation
    socketUtil.emitToUser(senderId, 'message_sent', message);

    sendResponse(res, 201, 'Voice message sent successfully', { message });
});
/**
 * Send a file message
 */
exports.sendFileMessage = catchAsync(async (req, res, next) => {
    if (!req.file) {
        return next(new AppError('No file provided', 400));
    }

    const payload = { ...req.body };
    if (payload.replyTo && typeof payload.replyTo === 'string') {
        try { payload.replyTo = JSON.parse(payload.replyTo); } catch (e) {}
    }

    if (!payload.type || payload.type === 'direct') {
        const User = require('../users/user.model');
        const receiverCustomId = await resolveId(payload.receiver, 'User');
        const targetUser = await User.findOne({ customId: receiverCustomId });
        if (!targetUser) throw new AppError('Receiver not found', 404);
        
        if (!isAuthorizedToMessage(req.user, targetUser)) {
            return next(new AppError('You do not have permission to message this user.', 403));
        }
    }

    const message = await messageService.saveFileMessage(
        payload,
        req.file,
        req.user.customId
    );

    // Emit via Socket.io for real-time delivery
    const socketUtil = require('../../utils/socket');
    const receiverId = message.receiver; // This is the customId string
    const senderId = req.user.customId;
    
    if (message.type === 'direct') {
        socketUtil.emitToUser(receiverId, 'new_message', message);
        await messageService.updateMessageStatus(message._id, 'delivered');
    } else {
        const io = socketUtil.getIO();
        io.to(`dept_${receiverId}`).emit('new_message', message);
    }
    // Confirm back to sender so their optimistic bubble updates with server data
    socketUtil.emitToUser(senderId, 'message_sent', message);

    sendResponse(res, 201, 'File message sent successfully', { message });
});

/**
 * Edit a message content
 */
exports.editMessage = catchAsync(async (req, res, next) => {
    const { content } = req.body;
    const { messageId } = req.params;

    const message = await messageService.editMessage(messageId, content, req.user.customId);

    // Notify recipient(s) about the edit
    const socketUtil = require('../../utils/socket');
    const receiverId = message.receiver.customId || message.receiver;
    
    if (message.type === 'direct') {
        socketUtil.emitToUser(receiverId, 'message_updated', message);
    } else {
        const io = socketUtil.getIO();
        io.to(`dept_${receiverId}`).emit('message_updated', message);
    }

    sendResponse(res, 200, 'Message updated successfully', { message });
});

/**
 * Delete a message
 */
exports.deleteMessage = catchAsync(async (req, res, next) => {
    const { messageId } = req.params;
    const { forEveryone } = req.query;

    const message = await messageService.deleteMessage(
        messageId, 
        req.user.customId, 
        forEveryone === 'true'
    );

    // If deleted for everyone, notify recipient(s)
    if (message.isDeletedForEveryone) {
        const socketUtil = require('../../utils/socket');
        const receiverId = message.receiver.customId || message.receiver;
        
        if (message.type === 'direct') {
            socketUtil.emitToUser(receiverId, 'message_deleted', { messageId, deletedForEveryone: true });
        } else {
            const io = socketUtil.getIO();
            io.to(`dept_${receiverId}`).emit('message_deleted', { messageId, deletedForEveryone: true });
        }
    }

    sendResponse(res, 200, 'Message deleted successfully', { message });
});

/**
 * Forward messages
 */
exports.forwardMessages = catchAsync(async (req, res, next) => {
    const { messageIds, receiverIds } = req.body;

    const messages = await messageService.forwardMessages(
        messageIds, 
        receiverIds, 
        req.user.customId
    );

    // Notify each receiver about the new message(s)
    const socketUtil = require('../../utils/socket');
    
    for (const msg of messages) {
        const receiverId = msg.receiver.customId || msg.receiver;
        if (msg.type === 'direct') {
            socketUtil.emitToUser(receiverId, 'new_message', msg);
        } else {
            const io = socketUtil.getIO();
            io.to(`dept_${receiverId}`).emit('new_message', msg);
        }
    }

    sendResponse(res, 201, 'Messages forwarded successfully', { messages });
});
