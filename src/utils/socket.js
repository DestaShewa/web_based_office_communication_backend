const { Server } = require('socket.io');
const logger = require('./logger');

let io;
const onlineUsers = new Map(); // userId -> socketId set (to handle multiple tabs)


/**
 * Initialize Socket.io
 * @param {Object} server - HTTP Server instance
 */
const init = (server) => {
    io = new Server(server, {
        cors: {
            origin: process.env.CLIENT_URL || '*',
            credentials: true,
        },
    });

    io.on('connection', (socket) => {
        logger.info(`Socket Connected: ${socket.id}`);

        // Join personal room when user is authenticated
        if (socket.user) {
            const userCustomId = socket.user.customId;
            const userRoom = `user_${userCustomId}`;
            socket.join(userRoom);

            // Join department rooms based on role and assignments
            const joinRooms = async () => {
                const ROLES = require('../constants/roles');
                const Department = require('../modules/departments/department.model');
                
                // Keep track of rooms to join
                const roomsToJoin = new Set();
                
                if (socket.user.role === ROLES.ADMIN || socket.user.role === ROLES.DIRECTOR) {
                    const depts = await Department.find({}).select('customId');
                    depts.forEach(d => roomsToJoin.add(`dept_${d.customId}`));
                    
                    const Faculty = require('../modules/faculties/faculty.model');
                    const faculties = await Faculty.find({}).select('customId');
                    faculties.forEach(f => roomsToJoin.add(`faculty_${f.customId}`));
                } else if (socket.user.role === ROLES.DEAN && socket.user.faculty) {
                    roomsToJoin.add(`faculty_${socket.user.faculty}`);
                    const depts = await Department.find({ faculty: socket.user.faculty }).select('customId');
                    depts.forEach(d => roomsToJoin.add(`dept_${d.customId}`));
                } else {
                    if (socket.user.faculty) roomsToJoin.add(`faculty_${socket.user.faculty}`);
                    if (socket.user.department) roomsToJoin.add(`dept_${socket.user.department}`);
                    if (socket.user.departments && Array.isArray(socket.user.departments)) {
                        socket.user.departments.forEach(deptId => roomsToJoin.add(`dept_${deptId}`));
                    }
                }
                
                // Join custom groups
                const Group = require('../modules/messages/group.model');
                const userGroups = await Group.find({ members: userCustomId }).select('customId');
                userGroups.forEach(g => roomsToJoin.add(`group_${g.customId}`));
                
                roomsToJoin.forEach(room => socket.join(room));
                if (roomsToJoin.size > 0) {
                    logger.debug(`User ${socket.user.name} (${userCustomId}) joined rooms: ${Array.from(roomsToJoin).join(', ')}`);
                }
            };
            
            joinRooms().catch(err => logger.error(`Socket Room Join Error:`, err));

            logger.debug(`User ${socket.user.name} (${userCustomId}) joined rooms: ${userRoom}`);

            // Presence Tracking: Mark user as online using customId
            if (!onlineUsers.has(userCustomId)) {
                onlineUsers.set(userCustomId, new Set());
            }
            onlineUsers.get(userCustomId).add(socket.id);
            
            // Broadcast that a user came online
            io.emit('presence_update', { 
                userId: userCustomId, 
                status: 'online' 
            });
            
            // Send current list of online users to the newly connected user
            socket.emit('initial_presence', Array.from(onlineUsers.keys()));

            // Handle Activity Indicators (Typing, Recording, Uploading)
            socket.on('typing_start', (data) => {
                const targetRoom = data.type === 'direct' ? `user_${data.receiver}` : (data.type === 'group' ? `group_${data.receiver}` : `dept_${data.receiver}`);
                socket.to(targetRoom).emit('user_activity', { 
                    userId: userCustomId, 
                    type: data.type,
                    receiver: data.receiver,
                    activity: data.activity || 'typing' // default to typing
                });
            });

            socket.on('typing_stop', (data) => {
                const targetRoom = data.type === 'direct' ? `user_${data.receiver}` : (data.type === 'group' ? `group_${data.receiver}` : `dept_${data.receiver}`);
                socket.to(targetRoom).emit('user_activity_stop', { 
                    userId: userCustomId,
                    type: data.type,
                    receiver: data.receiver
                });
            });


            // Handle Real-Time Messaging with Persistence
            socket.on('send_message', async (data) => {
                try {
                    const messageService = require('../modules/messages/message.service');
                    const ROLES = require('../constants/roles');

                    // Resolve department receiver to customId (frontend may send MongoDB _id)
                    let receiverCustomId = data.receiver;
                    if (data.type === 'department') {
                        const Department = require('../modules/departments/department.model');
                        const mongoose = require('mongoose');
                        let targetDept;
                        if (mongoose.Types.ObjectId.isValid(data.receiver)) {
                            targetDept = await Department.findById(data.receiver).select('customId faculty');
                        } else {
                            targetDept = await Department.findOne({ customId: data.receiver }).select('customId faculty');
                        }
                        if (!targetDept) {
                            throw new Error('Department not found');
                        }
                        receiverCustomId = targetDept.customId;
                        // Cache targetDept for DEAN check below
                        data._resolvedDept = targetDept;
                    } else if (data.type === 'group') {
                        const Group = require('../modules/messages/group.model');
                        const targetGroup = await Group.findOne({ customId: data.receiver }).select('customId members');
                        if (!targetGroup) throw new Error('Group not found');
                        receiverCustomId = targetGroup.customId;
                        data._resolvedGroup = targetGroup;
                    }

                    logger.info(`[MSG] send_message from ${socket.user.name} (role=${socket.user.role}, dept=${socket.user.department}) → receiver=${receiverCustomId} (raw=${data.receiver}), type=${data.type}`);

                    // Security check: Access Control for Recipient
                    if (data.type === 'direct') {
                        // Use RBAC
                        const { isAuthorizedToMessage } = require('./rbac');
                        const User = require('../modules/users/user.model');
                        const targetUser = await User.findOne({ customId: receiverCustomId });
                        if (!targetUser) throw new Error('Receiver not found');

                        if (!isAuthorizedToMessage(socket.user, targetUser)) {
                            throw new Error('You do not have permission to message this user');
                        }
                    } else if (data.type === 'department') {
                        // Validate permission to broadcast to this department based on role
                        let hasPermission = false;
                        
                        if (socket.user.role === ROLES.DEAN) {
                            const targetDept = data._resolvedDept;
                            if (targetDept && targetDept.faculty === socket.user.faculty) {
                                hasPermission = true;
                            }
                        } else {
                            // coordinator / staff — compare against resolved customId
                            if (socket.user.department === receiverCustomId) hasPermission = true;
                            if (socket.user.departments && socket.user.departments.includes(receiverCustomId)) hasPermission = true;
                        }

                        logger.info(`[MSG] Permission check: hasPermission=${hasPermission}, user.department=${socket.user.department}, receiverCustomId=${receiverCustomId}`);

                        if (!hasPermission) {
                            throw new Error('You do not have permission to broadcast to this department');
                        }
                    } else if (data.type === 'group') {
                        const targetGroup = data._resolvedGroup;
                        if (!targetGroup || !targetGroup.members.includes(userCustomId)) {
                            throw new Error('You do not have permission to message this group');
                        }
                    }

                    // 1. Save to Database — always use resolved customId
                    const savedMessage = await messageService.saveMessage({
                        sender: userCustomId,
                        receiver: receiverCustomId,
                        content: data.content,
                        type: data.type || 'direct',
                        customId: data.customId,
                        replyTo: data.replyTo
                    });

                    logger.info(`[MSG] savedMessage type=${savedMessage.type}, receiver=${savedMessage.receiver}, broadcasting to dept_${receiverCustomId}`);

                    // 2. Emit to recipient
                    if (savedMessage.type === 'direct') {
                        const recipientSockets = onlineUsers.get(receiverCustomId);
                        if (recipientSockets && recipientSockets.size > 0) {
                            io.to(`user_${receiverCustomId}`).emit('new_message', savedMessage);
                            await messageService.updateMessageStatus(savedMessage._id, 'delivered');
                            savedMessage.status = 'delivered';
                        }
                    } else {
                        // Broadcast to the department or group room — all members including sender
                        const targetRoom = savedMessage.type === 'group' ? `group_${receiverCustomId}` : `dept_${receiverCustomId}`;
                        io.to(targetRoom).emit('new_message', savedMessage);
                        logger.info(`[MSG] Broadcasted to ${targetRoom}`);
                    }

                    // 3. Emit back to sender as confirmation (for optimistic update reconciliation)
                    socket.emit('message_sent', savedMessage);

                    logger.debug(`Message saved and emitted from ${socket.user.name} (${userCustomId})`);
                } catch (error) {
                    logger.error('Socket Message Error:', error.message);
                    socket.emit('error', { message: error.message || 'Failed to send message' });
                }
            });

            // Handle Real-Time Deletion Sync
            socket.on('delete_message_sync', (data) => {
                const { messageId, deletedForEveryone, receiverId, type } = data;
                
                // 1. Sync for everyone if deleted globally
                if (deletedForEveryone) {
                    const targetRoom = type === 'direct' ? `user_${receiverId}` : (type === 'group' ? `group_${receiverId}` : `dept_${receiverId}`);
                    io.to(targetRoom).emit('message_deleted', { messageId, deletedForEveryone: true });
                }
                
                // 2. Sync across all own tabs for personal delete
                socket.to(`user_${userCustomId}`).emit('message_deleted', { 
                    messageId, 
                    deletedForEveryone,
                    userId: userCustomId 
                });
            });
        }

        socket.on('disconnect', () => {
            logger.info(`Socket Disconnected: ${socket.id}`);
            
            if (socket.user) {
                const userCustomId = socket.user.customId;
                if (onlineUsers.has(userCustomId)) {
                    onlineUsers.get(userCustomId).delete(socket.id);
                    
                    // If no more active sockets for this user, they are offline
                    if (onlineUsers.get(userCustomId).size === 0) {
                        onlineUsers.delete(userCustomId);
                        io.emit('presence_update', { 
                            userId: userCustomId, 
                            status: 'offline' 
                        });
                    }
                }
            }
        });
    });

    return io;
};

/**
 * Get the IO instance
 */
const getIO = () => {
    if (!io) {
        throw new Error('Socket.io not initialized!');
    }
    return io;
};

/**
 * Emit event to a specific user
 */
const emitToUser = (userId, event, data) => {
    if (io) {
        io.to(`user_${userId}`).emit(event, data);
    }
};

/**
 * Broadcast event to all users with specific roles
 */
const broadcastToRole = async (targetRoles, event, data) => {
    if (!io) return;
    
    // Convert single role to array
    const roles = Array.isArray(targetRoles) ? targetRoles : [targetRoles];
    
    // Find online users with those roles
    const User = require('../modules/users/user.model');
    const onlineUserIds = Array.from(onlineUsers.keys());
    
    if (onlineUserIds.length === 0) return;

    // Only query online users
    const users = await User.find({
        customId: { $in: onlineUserIds },
        role: { $in: roles }
    }).select('customId');

    users.forEach(user => {
        io.to(`user_${user.customId}`).emit(event, data);
    });
};

/**
 * Broadcast event to all connected users
 */
const broadcast = (event, data) => {
    logger.debug(`Socket utility broadcasting event: ${event}`);
    if (io) {
        io.emit(event, data);
        logger.debug('Broadcast emitted successfully');
    } else {
        logger.warn('Broadcast failed - Socket.io not initialized');
    }
};

/**
 * Check if a user is online
 */
const isUserOnline = (userId) => {
    return onlineUsers.has(userId.toString());
};

/**
 * Get list of all online users
 */
const getOnlineUsers = () => {
    return Array.from(onlineUsers.keys());
};

module.exports = {
    init,
    getIO,
    emitToUser,
    broadcast,
    broadcastToRole,
    isUserOnline,
    getOnlineUsers,
};
