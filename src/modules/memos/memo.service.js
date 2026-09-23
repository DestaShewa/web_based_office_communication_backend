const Memo = require('./memo.model');
const Task = require('../tasks/task.model');
const User = require('../users/user.model');
const AppError = require('../../utils/AppError');
const socketUtil = require('../../utils/socket');
const { sendNotification } = require('../notifications/notification.service');
const ROLES = require('../../constants/roles');

/**
 * Creates a new memo and dispatches it
 */
const createMemo = async (memoData, user) => {
    // 1. Verify role
    if (![ROLES.DIRECTOR, ROLES.DEAN, ROLES.COORDINATOR].includes(user.role)) {
        throw new AppError('Unauthorized: Only Director, Dean, or Coordinator can create memos.', 403);
    }

    // 2. Prepare memo data
    const getOfficeId = async (user) => {
        if (user.role === ROLES.DEAN) return typeof user.faculty === 'object' ? user.faculty.customId : user.faculty;
        if (user.role === ROLES.COORDINATOR) {
            if (user.office) return typeof user.office === 'object' ? user.office.customId : user.office;
            return typeof user.department === 'object' ? user.department.customId : user.department;
        }
        if (user.role === ROLES.DIRECTOR) {
            const Institute = require('../institutes/institute.model');
            const inst = await Institute.findOne();
            return inst?.customId || 'INST-01';
        }
        return null;
    };

    const senderOffice = await getOfficeId(user);
    const memo = new Memo({
        ...memoData,
        sender: user.customId,
        senderOffice,
        recipientOffice: memoData.recipientOffice,
        attachments: memoData.attachments || [],
        status: memoData.status === 'draft' ? 'draft' : 'dispatched'
    });

    await memo.save();

    // 3. Notify recipient if dispatched
    if (memo.status === 'dispatched') {
        await notifyRecipient(memo, user);
    }

    return memo;
};

/**
 * Gets memos received by the user's office
 */
const getInbox = async (user) => {
    let query = { status: { $ne: 'draft' } };

    if (user.role === ROLES.DIRECTOR) {
        const Institute = require('../institutes/institute.model');
        const inst = await Institute.findOne();
        const officeId = inst?.customId || 'INST-01';
        query.$or = [{ recipientOffice: officeId }, { ccOffices: officeId }];
    } else if (user.role === ROLES.DEAN) {
        const officeId = typeof user.faculty === 'object' ? user.faculty.customId : user.faculty;
        query.$or = [{ recipientOffice: officeId }, { ccOffices: officeId }];
    } else if (user.role === ROLES.COORDINATOR) {
        const officeId = user.office 
            ? (typeof user.office === 'object' ? user.office.customId : user.office)
            : (typeof user.department === 'object' ? user.department.customId : user.department);
        query.$or = [{ recipientOffice: officeId }, { ccOffices: officeId }];
    } else if (user.role === ROLES.STAFF) {
        const officeId = user.office 
            ? (typeof user.office === 'object' ? user.office.customId : user.office)
            : (typeof user.department === 'object' ? user.department.customId : user.department);
        query.$or = [{ recipientOffice: officeId }, { ccOffices: officeId }];
    } else {
        // Admin and Staff can't see memos by default now
        return [];
    }

    return await Memo.find(query)
        .sort({ createdAt: -1 })
        .populate('senderData', 'name role customId')
        .populate('senderOfficeData')
        .populate('recipientOfficeData');
};

/**
 * Gets memos sent by the user
 */
const getOutbox = async (user) => {
    return await Memo.find({ sender: user.customId })
        .sort({ createdAt: -1 })
        .populate('recipientOfficeData')
        .populate('senderOfficeData');
};

/**
 * Marks a memo as read
 */
const markAsRead = async (memoId, user) => {
    const memo = await Memo.findOne({ customId: memoId });
    if (!memo) throw new AppError('Memo not found', 404);

    const userId = user.customId;
    if (!memo.readBy.find(r => r.user === userId)) {
        memo.readBy.push({ user: userId });
        
        // If it was dispatched, move to 'read'
        if (memo.status === 'dispatched') {
            memo.status = 'read';
            
            // Notify the sender that it has been read
            const { sendNotification } = require('../notifications/notification.service');
            await sendNotification({
                recipient: memo.sender,
                type: 'MEMO_READ',
                title: 'Memo Read',
                message: `${user.name} has read your memo: "${memo.subject}"`,
                link: `/memos/${memo.customId}`,
                sender: user.customId
            }).catch(err => console.error('Notification error:', err));
        }
        
        await memo.save();
    }

    return memo;
};

/**
 * Updates memo status (internal use for feedback loop)
 */
const updateMemoStatus = async (memoId, status) => {
    const memo = await Memo.findOne({ customId: memoId });
    if (!memo) return;

    memo.status = status;
    await memo.save();

    // Notify the original sender
    socketUtil.emitToUser(memo.sender, 'memo_status_updated', {
        memoId: memo.customId,
        status
    });

    if (status === 'resolved' || status === 'actioned') {
        const { sendNotification } = require('../notifications/notification.service');
        await sendNotification({
            recipient: memo.sender,
            type: 'MEMO_STATUS_UPDATE',
            title: `Memo ${status === 'resolved' ? 'Resolved' : 'Actioned'}`,
            message: `Your memo "${memo.subject}" (${memo.customId}) has been ${status}.`,
            link: `/memos/${memo.customId}`,
            sender: 'SYSTEM'
        });
    }
};

/**
 * Handles notifying the recipient office head
 */
const notifyRecipient = async (memo, sender) => {
    const Department = require('../departments/department.model');
    const Faculty = require('../faculties/faculty.model');
    
    let recipientHeadId = null;

    // Resolve who gets the notification for the office
    if (memo.recipientOffice.includes('FAC')) {
        const fac = await Faculty.findOne({ customId: memo.recipientOffice });
        recipientHeadId = fac?.dean;
    } else if (memo.recipientOffice === 'INST-01') {
        const inst = await require('../institutes/institute.model').findOne({ customId: 'INST-01' });
        recipientHeadId = inst?.director;
        // Fallback to searching for a user with role DIRECTOR if institute model doesn't have director field yet
        if (!recipientHeadId) {
            const director = await User.findOne({ role: ROLES.DIRECTOR });
            recipientHeadId = director?.customId;
        }
    } else if (memo.recipientOffice.startsWith('OFF-')) {
        const Office = require('../offices/office.model');
        const off = await Office.findOne({ customId: memo.recipientOffice });
        recipientHeadId = off?.coordinator;
    } else {
        const dept = await Department.findOne({ customId: memo.recipientOffice });
        recipientHeadId = dept?.coordinator;
    }

    if (recipientHeadId) {
        socketUtil.emitToUser(recipientHeadId, 'new_memo', {
            memoId: memo.customId,
            subject: memo.subject,
            sender: sender.name
        });

        await sendNotification({
            recipient: recipientHeadId,
            type: 'NEW_MEMO',
            title: 'New Official Memo',
            message: `You have received a new memo from ${sender.name} (${memo.senderOffice}): "${memo.subject}"`,
            link: `/memos/${memo.customId}`,
            sender: sender.customId
        });
    }
};

const getMemoDetails = async (memoId, user) => {
    const memo = await Memo.findOne({ customId: memoId })
        .populate('senderData', 'name role customId profilePhoto')
        .populate('senderOfficeData')
        .populate('recipientOfficeData');

    if (!memo) throw new AppError('Memo not found', 404);

    // Visibility Check
    const userId = user.customId;
    let userOffice = null;
    
    if (user.role === ROLES.DEAN) {
        userOffice = typeof user.faculty === 'object' ? user.faculty?.customId : user.faculty;
    } else if (user.role === ROLES.COORDINATOR || user.role === ROLES.STAFF) {
        userOffice = user.office 
            ? (typeof user.office === 'object' ? user.office.customId : user.office)
            : (typeof user.department === 'object' ? user.department.customId : user.department);
    } else if (user.role === ROLES.DIRECTOR) {
        const Institute = require('../institutes/institute.model');
        const inst = await Institute.findOne();
        userOffice = inst?.customId || 'INST-01';
    }

    const isSender = memo.sender === userId;
    const isRecipient = userOffice && (memo.recipientOffice === userOffice || memo.ccOffices.includes(userOffice));
    const isDirector = user.role === ROLES.DIRECTOR;

    if (!isSender && !isRecipient && !isDirector) {
        throw new AppError('You do not have permission to view this memo.', 403);
    }

    return memo;
};

/**
 * Updates an existing memo (useful for drafts)
 */
const updateMemo = async (memoId, updateData, user) => {
    const memo = await Memo.findOne({ customId: memoId });
    if (!memo) throw new AppError('Memo not found', 404);

    if (memo.sender !== user.customId) {
        throw new AppError('Only the sender can update this memo.', 403);
    }

    if (memo.status !== 'draft' && updateData.status !== 'dispatched') {
         // Optionally restrict editing once sent, but for now let's allow draft -> dispatched
    }

    // Update fields
    const allowedFields = ['subject', 'body', 'recipientOffice', 'ccOffices', 'priority', 'expectedActionDate', 'status'];
    allowedFields.forEach(field => {
        if (updateData[field] !== undefined) {
            memo[field] = updateData[field];
        }
    });

    if (updateData.attachments) {
        memo.attachments = updateData.attachments;
    }

    await memo.save();

    if (memo.status === 'dispatched' && !memo.readBy.length) {
        await notifyRecipient(memo, user);
    }

    return memo;
};

/**
 * Deletes a memo
 */
const deleteMemo = async (memoId, user) => {
    const memo = await Memo.findOne({ customId: memoId });
    if (!memo) throw new AppError('Memo not found', 404);

    if (memo.sender !== user.customId && user.role !== ROLES.DIRECTOR) {
        throw new AppError('You do not have permission to delete this memo.', 403);
    }

    await Memo.deleteOne({ customId: memoId });
    return true;
};

module.exports = {
    createMemo,
    getInbox,
    getOutbox,
    markAsRead,
    getMemoDetails,
    updateMemo,
    deleteMemo,
    updateMemoStatus
};
