const Announcement = require('./announcement.model');
const AppError = require('../../utils/AppError');
const ROLES = require('../../constants/roles');
const { sendNotification } = require('../notifications/notification.service');
const User = require('../users/user.model');
const { resolveId, getIdentifierQuery } = require('../../utils/helpers');
const { logAction } = require('../audit/audit.service');
const { AUDIT_ACTIONS } = require('../audit/audit.model');

/**
 * Creates a new announcement with strict RBAC
 */
const createAnnouncement = async (data, authorUser, fileUrls) => {
    // 1. Resolve Target Logic & Enforce RBAC
    let resolvedTargetId = null;

    if (data.targetType === 'global') {
        // Global: Admins and Directors only
        if (authorUser.role !== ROLES.ADMIN && authorUser.role !== ROLES.DIRECTOR) {
            throw new AppError('Only Admins and Directors can post global announcements.', 403);
        }
        resolvedTargetId = null;
    } 
    else if (data.targetType === 'faculty') {
        // Faculty: Deans (own only) and Admins/Directors (specific faculty)
        if (authorUser.role === ROLES.DEAN) {
            resolvedTargetId = authorUser.faculty;
        } else if ([ROLES.ADMIN, ROLES.DIRECTOR].includes(authorUser.role)) {
            if (!data.targetId) throw new AppError('Must specify a faculty ID for faculty-level targeting.', 400);
            resolvedTargetId = await resolveId(data.targetId, 'Faculty');
        } else {
            throw new AppError('Only Admins, Directors, and Deans can post faculty announcements.', 403);
        }
    } 
    else if (data.targetType === 'department') {
        // Department: Coordinators (own only) and Admins/Directors/Deans (specific department within scope)
        if (authorUser.role === ROLES.COORDINATOR) {
            resolvedTargetId = authorUser.department;
        } else if ([ROLES.ADMIN, ROLES.DIRECTOR, ROLES.DEAN].includes(authorUser.role)) {
            if (!data.targetId) throw new AppError('Must specify a department ID for department-level targeting.', 400);
            resolvedTargetId = await resolveId(data.targetId, 'Department');
            
            // For Deans, ensure the department belongs to their faculty
            if (authorUser.role === ROLES.DEAN) {
                const Department = require('../departments/department.model');
                const dept = await Department.findOne({ customId: resolvedTargetId });
                if (!dept || dept.faculty !== authorUser.faculty) {
                    throw new AppError('Deans can only post to departments within their own faculty.', 403);
                }
            }
        } else {
            throw new AppError('Only Admins, Directors, Deans, and Coordinators can post department announcements.', 403);
        }
    } else if (data.targetType === 'office') {
        // Office: Coordinators (own only) and Admins/Directors (specific office)
        if (authorUser.role === ROLES.COORDINATOR && authorUser.office) {
            resolvedTargetId = authorUser.office;
        } else if ([ROLES.ADMIN, ROLES.DIRECTOR].includes(authorUser.role)) {
            if (!data.targetId) throw new AppError('Must specify an office ID for office-level targeting.', 400);
            resolvedTargetId = data.targetId;
        } else {
            throw new AppError('Only Admins, Directors, and Office Coordinators can post office announcements.', 403);
        }
    } else {
        throw new AppError('Invalid target type. Must be global, faculty, department, or office.', 400);
    }
    // 2. Create the announcement
    const announcement = await Announcement.create({
        title: data.title,
        content: data.content,
        createdBy: authorUser.customId,
        targetType: data.targetType,
        targetId: resolvedTargetId,
        poster: data.poster,
        attachments: fileUrls
    });

    // 3. Generate notifications efficiently
    let targetQuery = { isActive: true };
    if (data.targetType === 'faculty') {
        targetQuery.faculty = resolvedTargetId;
    } else if (data.targetType === 'department') {
        targetQuery.$or = [
            { department: resolvedTargetId },
            { departments: resolvedTargetId }
        ];
        
        // Deans also see all department updates in their faculty
        const Department = require('../departments/department.model');
        const dept = await Department.findOne({ customId: resolvedTargetId });
        if (dept && dept.faculty) {
            targetQuery.$or.push({ role: 'dean', faculty: dept.faculty });
        }
    } else if (data.targetType === 'office') {
        targetQuery.office = resolvedTargetId;
    }
    
    // Exclude the author
    targetQuery.customId = { $ne: authorUser.customId };

    const targetUsers = await User.find(targetQuery).select('_id customId');

    // Create notifications for the targeted audience only using the service to trigger real-time delivery
    const notificationPromises = targetUsers.map(user => 
        sendNotification({
            recipient: user.customId,
            type: 'NEW_ANNOUNCEMENT',
            title: 'New Announcement',
            message: data.title,
            link: '/announcements',
            targetId: announcement.customId,
            sender: authorUser.customId
        })
    );

    await Promise.all(notificationPromises).catch(err => 
        console.error('Some announcement notifications failed to send:', err.message)
    );

    // 4. Real-time emission
    const socketUtil = require('../../utils/socket');
    const io = socketUtil.getIO();
    
    if (data.targetType === 'global') {
        socketUtil.broadcast('new_announcement', announcement);
        socketUtil.broadcast('new_notification');
        socketUtil.broadcast('notification_count_update');
    } else {
        const roomPrefix = data.targetType === 'faculty' ? 'faculty_' : (data.targetType === 'department' ? 'dept_' : 'office_');
        const roomName = `${roomPrefix}${resolvedTargetId}`;
        
        // Targeted emission only to the relevant room
        io.to(roomName).emit('new_announcement', announcement);
        io.to(roomName).emit('new_notification');
        io.to(roomName).emit('notification_count_update');
    }

    await logAction({
        actor: authorUser.customId,
        action: AUDIT_ACTIONS.ANNOUNCEMENT_CREATED,
        targetType: 'Announcement',
        targetId: announcement.customId,
        details: { title: announcement.title, targetType: announcement.targetType, targetId: resolvedTargetId }
    });

    return announcement;
};

/**
 * Gets announcements applicable to a user based on audience targeting logic
 */
const getAnnouncementsForUser = async (user, filters = {}, limit = 20, page = 1) => {
    const skip = (page - 1) * limit;

    // Audience filtering logic: Global, User's Faculty, User's Department, or Created by User
    const orConditions = [
        { targetType: 'global' },
        { createdBy: user.customId }
    ];

    if (user.faculty) {
        orConditions.push({ 
            targetType: 'faculty', 
            targetId: user.faculty 
        });
    }

    if (user.department) {
        orConditions.push({ 
            targetType: 'department', 
            targetId: user.department 
        });
    }

    // Also check multi-department assignments for staff
    if (user.departments && user.departments.length > 0) {
        orConditions.push({
            targetType: 'department',
            targetId: { $in: user.departments }
        });
    }

    if (user.office) {
        orConditions.push({
            targetType: 'office',
            targetId: user.office
        });
    }

    // ROLE-BASED OVERFLOW VISIBILITY
    // 1. Deans should see all department-level announcements within their faculty
    if (user.role === ROLES.DEAN && user.faculty) {
        const Department = require('../departments/department.model');
        const facultyDepts = await Department.find({ faculty: user.faculty }).select('customId');
        const deptIds = facultyDepts.map(d => d.customId);
        
        if (deptIds.length > 0) {
            orConditions.push({
                targetType: 'department',
                targetId: { $in: deptIds }
            });
        }
    }

    // 2. Directors/Admins see all announcements (Global view is essentially no filter, but we add all types)
    if ([ROLES.DIRECTOR, ROLES.ADMIN].includes(user.role)) {
        orConditions.push({ targetType: 'faculty' });
        orConditions.push({ targetType: 'department' });
        orConditions.push({ targetType: 'office' });
    }

    const query = { 
        $or: orConditions,
        deletedForUsers: { $ne: user.customId } // Exclude if user has hidden it
    };

    // Advanced Filtering
    if (filters.scope) {
        query.targetType = filters.scope;
    }

    if (filters.startDate || filters.endDate) {
        query.createdAt = {};
        if (filters.startDate) query.createdAt.$gte = new Date(filters.startDate);
        if (filters.endDate) {
            const end = new Date(filters.endDate);
            end.setHours(23, 59, 59, 999);
            query.createdAt.$lte = end;
        }
    }

    // Search filter (Title, Content, or Author Name)
    if (filters.search) {
        const searchRegex = new RegExp(filters.search, 'i');
        
        // Find users matching searching name to check createdBy
        const matchedUsers = await User.find({ name: { $regex: searchRegex } }).select('customId');
        const matchedCustomIds = matchedUsers.map(u => u.customId);

        query.$and = [
            {
                $or: [
                    { title: { $regex: searchRegex } },
                    { content: { $regex: searchRegex } },
                    { createdBy: { $in: matchedCustomIds } }
                ]
            }
        ];
    }

    const announcementsRaw = await Announcement.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('createdByData', 'name profilePhoto role customId')
        .populate('targetData', 'name abbreviation customId')
        .select('+readBy'); // Select readBy to compute isRead

    const announcements = announcementsRaw.map(a => {
        const obj = a.toObject();
        obj.isRead = a.readBy.some(entry => entry.user === user.customId);
        delete obj.readBy; // Don't leak other people's read status in the general list
        return obj;
    });

    const total = await Announcement.countDocuments(query);

    return { 
        announcements, 
        total, 
        page, 
        limit, 
        totalPages: Math.ceil(total / limit) 
    };
};

/**
 * Hides an announcement for a specific user (soft delete from personal view)
 */
const hideAnnouncementForUser = async (announcementId, userCustomId) => {
    const announcement = await Announcement.findOne(getIdentifierQuery(announcementId)).select('+deletedForUsers');
    if (!announcement) throw new AppError('Announcement not found', 404);

    if (!announcement.deletedForUsers.includes(userCustomId)) {
        announcement.deletedForUsers.push(userCustomId);
        await announcement.save();
    }

    return true;
};

/**
 * Get all announcements (Admin/Director only — no audience filtering)
 */
const getAllAnnouncementsAdmin = async (filters = {}, limit = 50, page = 1) => {
    const skip = (page - 1) * limit;
    const query = {};

    if (filters.targetType) query.targetType = filters.targetType;
    if (filters.targetId) query.targetId = filters.targetId;
    if (filters.scope) query.targetType = filters.scope;

    if (filters.startDate || filters.endDate) {
        query.createdAt = {};
        if (filters.startDate) query.createdAt.$gte = new Date(filters.startDate);
        if (filters.endDate) {
            const end = new Date(filters.endDate);
            end.setHours(23, 59, 59, 999);
            query.createdAt.$lte = end;
        }
    }

    if (filters.search) {
        const searchRegex = new RegExp(filters.search, 'i');
        const matchedUsers = await User.find({ name: { $regex: searchRegex } }).select('customId');
        const matchedCustomIds = matchedUsers.map(u => u.customId);

        query.$or = [
            { title: { $regex: searchRegex } },
            { content: { $regex: searchRegex } },
            { createdBy: { $in: matchedCustomIds } }
        ];
    }

    const announcements = await Announcement.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('createdByData', 'name role customId')
        .populate('targetData', 'name abbreviation customId');

    const total = await Announcement.countDocuments(query);
    return { announcements, total, page, limit, totalPages: Math.ceil(total / limit) };
};

/**
 * Mark announcement as read/acknowledged
 */
const acknowledgeAnnouncement = async (announcementId, userCustomId) => {
    const announcement = await Announcement.findOne(getIdentifierQuery(announcementId)).select('+readBy');
    
    if (!announcement) throw new AppError('Announcement not found', 404);

    const alreadyRead = announcement.readBy.some(entry => entry.user === userCustomId);

    if (!alreadyRead) {
        announcement.readBy.push({ user: userCustomId });
        await announcement.save();
        
        // CRITICAL: Also mark the related notification as read to sync the badge count
        const Notification = require('../notifications/notification.model');
        const notification = await Notification.findOneAndUpdate(
            { 
                recipient: userCustomId, 
                targetId: announcement.customId,
                isRead: false 
            },
            { isRead: true }
        );

        if (notification) {
            const socketUtil = require('../../utils/socket');
            socketUtil.emitToUser(userCustomId, 'notification_count_update');
        }
    }

    return announcement;
};

/**
 * Get read status summary
 */
const getAnnouncementReadStatus = async (announcementId, requestingUser) => {
    const announcement = await Announcement.findOne(getIdentifierQuery(announcementId))
        .populate('readBy.userData', 'name email role department customId profilePhoto')
        .select('+readBy');

    if (!announcement) throw new AppError('Announcement not found', 404);

    // Only Admin or Creator
    if (requestingUser.role !== ROLES.ADMIN && requestingUser.customId !== announcement.createdBy) {
        throw new AppError('Access denied.', 403);
    }

    return announcement;
};

/**
 * Update an announcement
 */
const updateAnnouncement = async (id, updateBody, actorUser, fileUrls) => {
    const announcement = await Announcement.findOne(getIdentifierQuery(id));
    if (!announcement) throw new AppError('Announcement not found', 404);

    // Only creator or admin
    if (announcement.createdBy !== actorUser.customId && actorUser.role !== ROLES.ADMIN) {
        throw new AppError('Access denied.', 403);
    }

    // Identify what was updated for the notification message
    const updatedFields = [];
    if (updateBody.title && updateBody.title !== announcement.title) updatedFields.push('Title');
    if (updateBody.content && updateBody.content !== announcement.content) updatedFields.push('Description');
    if (updateBody.poster !== undefined && updateBody.poster !== announcement.poster) updatedFields.push('Poster');
    if (fileUrls && fileUrls.length > 0) updatedFields.push('Attachments');

    Object.assign(announcement, updateBody);
    if (fileUrls && fileUrls.length > 0) {
        announcement.attachments = fileUrls;
    }
    
    await announcement.save();

    // Notify audience about the update
    let targetQuery = { isActive: true };
    if (announcement.targetType === 'faculty') {
        targetQuery.faculty = announcement.targetId;
    } else if (announcement.targetType === 'department') {
        targetQuery.$or = [
            { department: announcement.targetId },
            { departments: announcement.targetId }
        ];
        const Department = require('../departments/department.model');
        const dept = await Department.findOne({ customId: announcement.targetId });
        if (dept && dept.faculty) {
            targetQuery.$or.push({ role: 'dean', faculty: dept.faculty });
        }
    } else if (announcement.targetType === 'office') {
        targetQuery.office = announcement.targetId;
    }
    targetQuery.customId = { $ne: actorUser.customId };

    const targetUsers = await User.find(targetQuery).select('_id customId');
    
    const fieldsText = updatedFields.length > 0 ? ` (${updatedFields.join(', ')})` : '';
    
    const notificationPromises = targetUsers.map(user => 
        sendNotification({
            recipient: user.customId,
            type: 'ANNOUNCEMENT_UPDATED',
            title: 'Announcement Updated',
            message: `Updated${fieldsText}: ${announcement.title}`,
            link: `/announcements?highlight=${announcement.customId || announcement._id}`,
            targetId: announcement.customId,
            sender: actorUser.customId
        })
    );
    await Promise.all(notificationPromises).catch(err => 
        console.error('Some announcement update notifications failed to send:', err.message)
    );

    const socketUtil = require('../../utils/socket');
    const io = socketUtil.getIO();
    if (announcement.targetType === 'global') {
        socketUtil.broadcast('announcement_updated', { 
            announcement, 
            updatedFields,
            highlightId: announcement.customId || announcement._id 
        });
        socketUtil.broadcast('new_notification');
        socketUtil.broadcast('notification_count_update');
    } else {
        const roomPrefix = announcement.targetType === 'faculty' ? 'faculty_' : (announcement.targetType === 'department' ? 'dept_' : 'office_');
        const roomName = `${roomPrefix}${announcement.targetId}`;
        io.to(roomName).emit('announcement_updated', { 
            announcement, 
            updatedFields,
            highlightId: announcement.customId || announcement._id 
        });
        io.to(roomName).emit('new_notification');
        io.to(roomName).emit('notification_count_update');
    }

    await logAction({
        actor: actorUser.customId,
        action: AUDIT_ACTIONS.ANNOUNCEMENT_UPDATED,
        targetType: 'Announcement',
        targetId: announcement.customId,
        details: { title: announcement.title }
    });

    return announcement;
};

/**
 * Delete an announcement
 */
const deleteAnnouncement = async (id, actorUser) => {
    const announcement = await Announcement.findOne(getIdentifierQuery(id));
    if (!announcement) throw new AppError('Announcement not found', 404);

    if (announcement.createdBy !== actorUser.customId && actorUser.role !== ROLES.ADMIN) {
        throw new AppError('Access denied.', 403);
    }

    await Announcement.deleteOne({ _id: announcement._id });

    await logAction({
        actor: actorUser.customId,
        action: AUDIT_ACTIONS.ANNOUNCEMENT_DELETED,
        targetType: 'Announcement',
        targetId: announcement.customId,
        details: { title: announcement.title }
    });

    return true;
};

module.exports = {
    createAnnouncement,
    getAnnouncementsForUser,
    getAllAnnouncementsAdmin,
    acknowledgeAnnouncement,
    getAnnouncementReadStatus,
    updateAnnouncement,
    deleteAnnouncement,
    hideAnnouncementForUser,
};
