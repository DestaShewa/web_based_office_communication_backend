const Message = require('./message.model');
const Group = require('./group.model');
const AppError = require('../../utils/AppError');
const logger = require('../../utils/logger');
const { resolveId } = require('../../utils/helpers');

/**
 * Save a new message to the database
 */
const saveMessage = async (data) => {
    const receiverType = data.type === 'department' ? 'Department' : (data.type === 'group' ? 'Group' : 'User');
    const resolvedReceiver = await resolveId(data.receiver, receiverType);

    const message = await Message.create({
        sender: data.sender,
        receiver: resolvedReceiver,
        content: data.content,
        type: data.type || 'direct',
        customId: data.customId,
        replyTo: data.replyTo
    });

    // Populate sender with customId for frontend identification
    await message.populate('senderData', 'name username profilePhoto customId role');

    return message;
};

/**
 * Save a new voice message
 */
const saveVoiceMessage = async (data, file, senderId) => {
    const receiverType = data.type === 'department' ? 'Department' : 'User';
    const resolvedReceiver = await resolveId(data.receiver, receiverType);

    const message = await Message.create({
        sender: senderId,
        receiver: resolvedReceiver,
        messageType: 'audio',
        type: data.type || 'direct',
        fileUrl: file.path.replace(/\\/g, '/'), // Ensure web-friendly slash
        duration: data.duration || 0,
        status: 'sent',
        customId: data.customId,
        replyTo: data.replyTo
    });

    await message.populate('senderData', 'name profilePhoto customId');
    return message;
};

/**
 * Save a new file message
 */
const saveFileMessage = async (data, file, senderId) => {
    const receiverType = data.type === 'department' ? 'Department' : (data.type === 'group' ? 'Group' : 'User');
    const resolvedReceiver = await resolveId(data.receiver, receiverType);

    const message = await Message.create({
        sender: senderId,
        receiver: resolvedReceiver,
        messageType: file.mimetype.startsWith('image/') ? 'image' : 'file',
        type: data.type || 'direct',
        fileUrl: file.path.replace(/\\/g, '/'),
        fileInfo: {
            name: file.originalname,
            size: file.size,
            mimeType: file.mimetype
        },
        status: 'sent',
        customId: data.customId,
        replyTo: data.replyTo
    });

    await message.populate('senderData', 'name profilePhoto customId');
    return message;
};

/**
 * Get conversation history between two users
 */
const getConversation = async (user1CustomId, user2CustomId, limit = 50, page = 1) => {
    const skip = (page - 1) * limit;

    const messages = await Message.find({
        $or: [
            { sender: user1CustomId, receiver: user2CustomId },
            { sender: user2CustomId, receiver: user1CustomId },
        ],
    })
        .sort({ createdAt: -1 }) // Get newest first
        .skip(skip)
        .limit(limit)
        .populate('senderData', 'name username profilePhoto customId role email bio phoneNumber status')
        .populate('receiverUserData', 'name username profilePhoto customId role email bio phoneNumber status');

    return messages.reverse(); // Reverse so it's chronological for the UI
};

/**
 * Get department message history
 */
const getDepartmentHistory = async (departmentId, limit = 50, page = 1) => {
    const resolvedDeptId = await resolveId(departmentId, 'Department');
    const skip = (page - 1) * limit;

    const messages = await Message.find({
        receiver: resolvedDeptId,
        type: 'department',
    })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('senderData', 'name username profilePhoto customId role email bio phoneNumber status');

    return messages.reverse();
};

/**
 * Get group message history
 */
const getGroupHistory = async (groupId, limit = 50, page = 1) => {
    const resolvedGroupId = await resolveId(groupId, 'Group');
    const skip = (page - 1) * limit;

    const messages = await Message.find({
        receiver: resolvedGroupId,
        type: 'group',
    })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('senderData', 'name username profilePhoto customId role email bio phoneNumber status');

    return messages.reverse();
};

/**
 * Get list of groups a user belongs to
 */
const getGroupsForUser = async (userId) => {
    return await Group.find({ 
        members: userId,
        isActive: true 
    }).sort({ updatedAt: -1 });
};

/**
 * Delete a group permanently
 */
const deleteGroup = async (groupId, userId) => {
    const group = await Group.findOne({ customId: groupId });
    if (!group) throw new Error('Group not found');
    if (group.createdBy !== userId) throw new Error('Only the creator can delete the group');

    await Group.deleteOne({ customId: groupId });
    
    // Also delete all messages associated with this group
    const Message = require('./message.model');
    await Message.deleteMany({ receiver: groupId, type: 'group' });

    return true;
};

/**
 * Remove a member from a group
 */
const removeMemberFromGroup = async (groupId, memberId, requesterId) => {
    const group = await Group.findOne({ customId: groupId });
    if (!group) throw new Error('Group not found');
    
    // Only creator can remove members
    if (group.createdBy !== requesterId) throw new Error('Only the creator can remove members');
    
    // Creator cannot be removed (unless group is deleted)
    if (memberId === group.createdBy) throw new Error('The creator cannot be removed from the group');

    group.members = group.members.filter(m => m !== memberId);
    await group.save();

    return group;
};

/**
 * Add members to a group
 */
const addMembersToGroup = async (groupId, memberIds, requesterId) => {
    const group = await Group.findOne({ customId: groupId });
    if (!group) throw new Error('Group not found');
    
    // Only creator can add members
    if (group.createdBy !== requesterId) throw new Error('Only the creator can add members');

    // Filter out members already in the group
    const newMembers = memberIds.filter(id => !group.members.includes(id));
    
    if (newMembers.length > 0) {
        group.members = [...group.members, ...newMembers];
        await group.save();
    }

    return group;
};

/**
 * Update group profile photo
 */
const updateGroupProfilePhoto = async (groupId, photoUrl, requesterId) => {
    logger.info(`Updating group photo: groupId=${groupId}, requesterId=${requesterId}`);
    const group = await Group.findOne({ customId: groupId });
    if (!group) {
        logger.error(`Group not found: ${groupId}`);
        throw new Error('Group not found');
    }
    
    // Only creator can update photo
    if (group.createdBy !== requesterId) {
        logger.error(`Unauthorized photo update attempt: groupCreator=${group.createdBy}, requester=${requesterId}`);
        throw new Error('Only the creator can update the profile photo');
    }

    group.profilePhoto = photoUrl;
    await group.save();

    return group;
};

/**
 * Mark all unread messages from a specific sender to the current user as read
 */
const markConversationAsRead = async (userId, senderId) => {
    await Message.updateMany(
        { receiver: userId, sender: senderId, isRead: false },
        { isRead: true, readAt: Date.now() }
    );
    return true;
};

/**
 * Get total unread direct messages count for a user
 */
const getUnreadCount = async (userId) => {
    const count = await Message.countDocuments({ receiver: userId, isRead: false, type: 'direct' });
    return count;
};

/**
 * Get the list of unique users the current user has exchanged messages with
 */
const getConversations = async (userId) => {
    // Aggregation to find recent conversation partners
    const conversations = await Message.aggregate([
        {
            $match: {
                $or: [
                    { sender: userId.toString() },
                    { receiver: userId.toString() }
                ],
                type: 'direct'
            }
        },
        {
            $sort: { createdAt: -1 }
        },
        {
            $group: {
                _id: {
                    $cond: [
                        { $eq: ['$sender', userId.toString()] },
                        '$receiver',
                        '$sender'
                    ]
                },
                lastMessage: { $first: '$$ROOT' },
                unreadCount: {
                    $sum: {
                        $cond: [
                            { 
                                $and: [
                                    { $eq: ['$receiver', userId.toString()] },
                                    { $eq: ['$isRead', false] }
                                ]
                            },
                            1,
                            0
                        ]
                    }
                }
            }
        },
        {
            $sort: { 'lastMessage.createdAt': -1 }
        }
    ]);

    // Populate user data for the conversation partners
    const User = require('../users/user.model');
    const populatedConversations = await Promise.all(conversations.map(async (conv) => {
        const partner = await User.findOne({ customId: conv._id }).select('name username profilePhoto customId role email bio phoneNumber status');
        if (!partner) return null;
        return {
            ...conv,
            partner
        };
    }));

    return populatedConversations.filter(conv => conv !== null);
};

/**
 * Update message status
 */
const updateMessageStatus = async (messageId, status) => {
    return await Message.findByIdAndUpdate(messageId, { status }, { new: true });
};

/**
 * Edit a text message
 */
const editMessage = async (messageId, newContent, userId) => {
    const message = await Message.findOne({ customId: messageId });
    if (!message) throw new AppError('Message not found', 404);
    if (message.sender !== userId) throw new AppError('Not authorized to edit this message', 403);
    if (message.messageType !== 'text') throw new AppError('Only text messages can be edited', 400);

    message.content = newContent;
    message.isEdited = true;
    await message.save();

    await message.populate('senderData', 'name username profilePhoto customId role email bio phoneNumber status');
    return message;
};

/**
 * Delete a message
 */
const deleteMessage = async (messageId, userId, forEveryone = false) => {
    const message = await Message.findOne({ customId: messageId });
    if (!message) throw new AppError('Message not found', 404);

    if (forEveryone) {
        if (message.sender !== userId) throw new AppError('Only original sender can delete for everyone', 403);
        message.isDeletedForEveryone = true;
    } else {
        if (!message.deletedBy.includes(userId)) {
            message.deletedBy.push(userId);
        }
    }

    await message.save();
    return message;
};

/**
 * Forward messages to recipients
 */
const forwardMessages = async (messageIds, receiverIds, senderId) => {
    const originalMessages = await Message.find({ customId: { $in: messageIds } });
    const results = [];

    for (const receiverCustomId of receiverIds) {
        let receiverType = 'User';
        if (receiverCustomId.startsWith('DEPT-')) receiverType = 'Department';
        if (receiverCustomId.startsWith('GRP-')) receiverType = 'Group';
        
        const resolvedReceiver = await resolveId(receiverCustomId, receiverType);

        for (const msg of originalMessages) {
            const forwardedMsg = await Message.create({
                sender: senderId,
                receiver: resolvedReceiver,
                messageType: msg.messageType,
                type: receiverType === 'Department' ? 'department' : (receiverType === 'Group' ? 'group' : 'direct'),
                content: msg.content,
                fileUrl: msg.fileUrl,
                fileInfo: msg.fileInfo,
                duration: msg.duration,
                forwardedFrom: msg.sender,
                status: 'sent'
            });
            await forwardedMsg.populate('senderData', 'name profileImage customId');
            results.push(forwardedMsg);
        }
    }

    return results;
};

module.exports = {
    saveMessage,
    saveVoiceMessage,
    saveFileMessage,
    getConversation,
    getGroupsForUser,
    getGroupHistory,
    deleteGroup,
    removeMemberFromGroup,
    addMembersToGroup,
    updateGroupProfilePhoto,
    markConversationAsRead,
    getUnreadCount,
    getConversations,
    updateMessageStatus,
    editMessage,
    deleteMessage,
    forwardMessages,
    getDepartmentHistory,
};
