const Task = require('./task.model');
const TaskComment = require('./taskComment.model');
const AppError = require('../../utils/AppError');
const socketUtil = require('../../utils/socket');
const ROLES = require('../../constants/roles');
const { logAction } = require('../audit/audit.service');
const { AUDIT_ACTIONS } = require('../audit/audit.model');
const { sendNotification } = require('../notifications/notification.service');
const { resolveId, getIdentifierQuery } = require('../../utils/helpers');
const emailService = require('../../services/email.service');

/**
 * Creates a new task and notifies the assignee via socket
 */
const createTask = async (taskData, assignerUser) => {
    // Resolve assignee user documents
    const User = require('../users/user.model');
    const assigneeInput = Array.isArray(taskData.assignee) ? taskData.assignee : [taskData.assignee];

    // Validating deadline date
    const now = new Date();
    now.setHours(0, 0, 0, 0); // Check against start of today
    const dueDate = new Date(taskData.dueDate);
    if (isNaN(dueDate.getTime())) {
        throw new AppError('Invalid due date provided.', 400);
    }
    if (dueDate < now) {
        throw new AppError('Deadline cannot be in the past.', 400);
    }
    
    // Admin Check
    const isAdminAssigner = assignerUser.role === ROLES.ADMIN;
    const isDirector = assignerUser.role === ROLES.DIRECTOR;
    const isDean = assignerUser.role === ROLES.DEAN;
    const isCoordinator = assignerUser.role === ROLES.COORDINATOR;

    const resolvedAssignees = await Promise.all(assigneeInput.map(async (id) => {
        const userId = await resolveId(id, 'User');
        const u = await User.findOne(getIdentifierQuery(userId));
        if (!u) throw new AppError(`Member ${id} not found`, 404);

        // Rule 1: Cannot assign to Admin
        if (u.role === ROLES.ADMIN) {
            throw new AppError('Tasks cannot be assigned to Administrators.', 400);
        }

        // Rule 2: Cannot assign to self
        const isSelf = (u.customId || u._id.toString()) === (assignerUser.customId || assignerUser._id.toString());
        if (isSelf) {
            throw new AppError('You cannot assign a task to yourself.', 400);
        }

        // Rule 3: Scope Validation
        if (isDean) {
            if (u.faculty !== assignerUser.faculty) {
                throw new AppError(`Dean can only assign tasks to their faculty (${assignerUser.faculty})`, 403);
            }
        } else if (isCoordinator) {
            const myDepts = [assignerUser.department, ...(assignerUser.departments || [])].filter(Boolean);
            const userDepts = [u.department, ...(u.departments || [])].filter(Boolean);
            const hasDeptMatch = myDepts.length > 0 && myDepts.some(d => userDepts.includes(d));
            const hasOfficeMatch = assignerUser.office && u.office && assignerUser.office === u.office;

            if (!hasDeptMatch && !hasOfficeMatch) {
                const msg = assignerUser.office 
                    ? 'Office Coordinator can only assign tasks to their office staff.'
                    : 'Coordinator can only assign tasks to their department members.';
                throw new AppError(msg, 403);
            }
        }

        return {
            user: u.customId || u._id.toString(),
            status: 'pending'
        };
    }));

    const task = await Task.create({
        title: taskData.title,
        description: taskData.description,
        assigner: assignerUser.customId || assignerUser._id.toString(),
        assignees: resolvedAssignees,
        roleType: taskData.roleType,
        faculty: taskData.faculty ? await resolveId(taskData.faculty, 'Faculty') : (isDean || isCoordinator ? assignerUser.faculty : null),
        department: taskData.department ? await resolveId(taskData.department, 'Department') : null,
        office: taskData.office || (isCoordinator && assignerUser.office ? assignerUser.office : null),
        dueDate: taskData.dueDate,
        priority: taskData.priority,
        memoId: taskData.memoId,
    });

    const populatedTask = await Task.findOne(getIdentifierQuery(task._id))
        .populate('assignerData', 'name profilePhoto role customId email')
        .populate('assigneesData', 'name profilePhoto role customId email');

    // Notify all assignees
    task.assignees.forEach(async (a) => {
        const userId = a.user.toString();
        socketUtil.emitToUser(userId, 'new_task', populatedTask);
        
        // In-app notification
        await sendNotification({
            recipient: userId,
            type: 'NEW_TASK',
            title: 'New Task Assigned',
            message: `${assignerUser.name} assigned a new task to you: ${task.title}`,
            link: `/tasks?highlight=${task.customId || task._id}`,
            sender: assignerUser.customId || assignerUser._id.toString(),
        }).catch(err => console.error('Notification error:', err));

        // Email notification
        const assignee = populatedTask.assigneesData.find(u => (u.customId || u._id.toString()) === userId);
        if (assignee && assignee.email) {
            emailService.sendTaskAssignmentEmail(assignee, populatedTask, assignerUser).catch(() => {});
        }
    });

    await logAction({
        actor: assignerUser._id,
        action: AUDIT_ACTIONS.TASK_CREATED,
        targetType: 'Task',
        targetId: task.customId,
        details: { title: task.title, assignees: task.assignees.map(a => a.user) },
    });

    // Handle Memo Linking
    if (taskData.memoId) {
        const Memo = require('../memos/memo.model');
        const memo = await Memo.findOne({ customId: taskData.memoId });
        if (memo) {
            memo.status = 'actioned';
            if (!memo.tasks.includes(task.customId)) {
                memo.tasks.push(task.customId);
            }
            await memo.save();

            // Notify memo sender that it's converted
            await sendNotification({
                recipient: memo.sender,
                type: 'MEMO_CONVERTED_TO_TASK',
                title: 'Memo Converted to Task',
                message: `${assignerUser.name} converted your memo "${memo.subject}" into a task: "${task.title}"`,
                link: `/tasks?highlight=${task.customId}`,
                sender: assignerUser.customId || assignerUser._id.toString(),
            }).catch(() => {});
        }
    }

    return populatedTask;
};

/**
 * Updates the status of a task (Assignee, Assigner, or Admin)
 */
const updateTaskStatus = async (taskId, newStatus, user) => {
    const task = await Task.findOne(getIdentifierQuery(taskId));
    if (!task) throw new AppError('No task found with that ID', 404);

    if (newStatus === 'overdue') {
        throw new AppError('The "Overdue" status is automatically managed by the system and cannot be set manually.', 400);
    }

    const userId = user.customId || user._id.toString();
    const assigneeMatch = task.assignees.find(a => a.user.toString() === userId);
    
    // Issue 8: Skip if no change for this specific user
    if (assigneeMatch && assigneeMatch.status === newStatus) {
        return task;
    }

    const isAssignee = !!assigneeMatch;
    const isAssigner = task.assigner.toString() === userId;
    const isAdmin    = user.role === ROLES.ADMIN;

    if (!isAssignee && !isAssigner && !isAdmin) {
        throw new AppError('You do not have permission to update this task status', 403);
    }

    const prevStatus = isAssignee ? assigneeMatch.status : task.status;
    
    // Block assignees from changing status of overdue tasks
    const isOverdue = task.status === 'overdue' || (task.dueDate < new Date() && task.status !== 'completed');
    if (isAssignee && isOverdue && !isAdmin) {
        throw new AppError('This task is overdue and its status can no longer be modified by the assignee.', 403);
    }
    
    if (isAssignee) {
        assigneeMatch.status = newStatus;
        if (newStatus === 'completed') assigneeMatch.completedAt = new Date();
    } else {
        task.status = newStatus; 
    }
    
    await task.save();

    // --- Memo Feedback Loop & Notifications ---
    if (task.memoId) {
        const Memo = require('../memos/memo.model');
        const memo = await Memo.findOne({ customId: task.memoId });
        
        if (memo) {
            // Notify memo sender about task progress
            await sendNotification({
                recipient: memo.sender,
                type: 'MEMO_TASK_PROGRESS',
                title: 'Memo Task Update',
                message: `The task "${task.title}" (from memo "${memo.subject}") was updated to ${newStatus.replace('_', ' ')}`,
                link: `/tasks?highlight=${task.customId || task._id}`,
                sender: user.customId || user._id.toString(),
            }).catch(() => {});

            if (newStatus === 'completed') {
                const { updateMemoStatus } = require('../memos/memo.service');
                
                // Check if all other tasks for this memo are also completed
                const pendingTasks = await Task.find({ 
                    memoId: task.memoId, 
                    _id: { $ne: task._id }, 
                    status: { $ne: 'completed' } 
                });

                if (pendingTasks.length === 0) {
                    await updateMemoStatus(task.memoId, 'resolved');
                } else {
                    await updateMemoStatus(task.memoId, 'actioned');
                }
            } else {
                const { updateMemoStatus } = require('../memos/memo.service');
                await updateMemoStatus(task.memoId, 'actioned');
            }
        }
    }

    // Notify the other party
    const notifyId = isAssignee ? task.assigner.toString() : (task.assignees[0]?.user.toString());
    socketUtil.emitToUser(notifyId, 'task_updated', { taskId: task._id, status: newStatus, userId });
    
    await sendNotification({
        recipient: notifyId,
        type: 'TASK_STATUS_UPDATE',
        title: 'Task Status Updated',
        message: `${user.name} changed the status of task "${task.title}" to ${newStatus.replace('_', ' ')}`,
        link: `/tasks?highlight=${task.customId || task._id}`,
        sender: user.customId || user._id.toString(),
    }).catch(err => console.error('Notification error:', err));

    await logAction({
        actor: user._id,
        action: AUDIT_ACTIONS.TASK_STATUS_UPDATED,
        targetType: 'Task',
        targetId: task.customId,
        details: { from: prevStatus, to: newStatus, affectedUser: isAssignee ? userId : 'all' },
    });

    return task;
};

/**
 * System-level scheduler function to check for overdue tasks
 * This is called by a background interval, not a web request
 */
const checkOverdueTasks = async () => {
    const now = new Date();
    
    // Find tasks that are past due, not completed, and not yet marked overdue
    // Supporting both individual assignee status and aggregate status
    const pendingTasks = await Task.find({
        status: { $nin: ['completed', 'overdue'] },
        dueDate: { $lt: now }
    });

    for (const task of pendingTasks) {
        let changed = false;

        // Update target aggregate status
        if (task.status !== 'overdue') {
            task.status = 'overdue';
            changed = true;
        }

        // Update individual assignees who hasn't finished
        task.assignees.forEach(a => {
            if (a.status !== 'completed' && a.status !== 'overdue') {
                a.status = 'overdue';
                changed = true;
            }
        });

        if (changed) {
            await task.save();
            
            // Notify assigner that task is overdue
            const assignerId = task.assigner.toString();
            socketUtil.emitToUser(assignerId, 'task_overdue', { taskId: task._id, title: task.title });
            
            await sendNotification({
                recipient: assignerId,
                type: 'TASK_OVERDUE',
                title: 'Task Overdue',
                message: `Task "${task.title}" has reached its deadline and was marked as overdue by the system.`,
                link: `/tasks?highlight=${task.customId || task._id}`,
            }).catch(() => {});
            
            // Also notify assignees they are overdue
            task.assignees.forEach(async (a) => {
                if (a.status === 'overdue') {
                   socketUtil.emitToUser(a.user.toString(), 'task_overdue', { taskId: task._id, title: task.title });
                }
            });
        }
    }
    
    return pendingTasks.length;
};

/**
 * Reassigns a task to a new employee (Coordinator/Dean/Admin only)
 */
const reassignTask = async (taskId, newAssigneeIds, requestingUser) => {
    const isAdminUser = requestingUser.role === ROLES.ADMIN;
    const isDirector = requestingUser.role === ROLES.DIRECTOR;
    const isDean = requestingUser.role === ROLES.DEAN;
    const isCoordinator = requestingUser.role === ROLES.COORDINATOR;

    if (!isAdminUser && !isDirector && !isDean && !isCoordinator) {
        throw new AppError('Unauthorized to reassign tasks', 403);
    }

    const task = await Task.findOne(getIdentifierQuery(taskId));
    if (!task) throw new AppError('No task found with that ID', 404);

    const User = require('../users/user.model');
    const actorId = requestingUser.customId || requestingUser._id.toString();

    // Standardize input to array
    const assigneeInput = Array.isArray(newAssigneeIds) ? newAssigneeIds : [newAssigneeIds];
    
    const validatedAssignees = await Promise.all(assigneeInput.map(async (id) => {
        const resolvedIdVal = await resolveId(id, 'User');
        const u = await User.findOne(getIdentifierQuery(resolvedIdVal));
        if (!u) throw new AppError(`User ${id} not found`, 404);

        const assigneeId = u.customId || u._id.toString();

        // Rule 1: Cannot reassign to Admin
        if (u.role === ROLES.ADMIN) {
            throw new AppError('Tasks cannot be assigned to Administrators.', 400);
        }

        // Rule 2: Cannot reassign to self
        if (actorId === assigneeId) {
            throw new AppError('You cannot reassign a task to yourself.', 400);
        }

        // Rule 3: Advanced Role-Based Scope Boundaries
        // A. Coordinator Logic
        if (isCoordinator) {
            if (task.assigner !== actorId) {
                throw new AppError('Coordinators can only reassign tasks they have created.', 403);
            }
            if (!task.department) {
                 throw new AppError('Coordinators can only reassign department-level tasks.', 403);
            }
            const userDepts = [u.department, ...(u.departments || [])].filter(Boolean);
            if (!userDepts.includes(task.department)) {
                 throw new AppError('Coordinator can only reassign to members within the same department.', 403);
            }
        }

        // B. Dean Logic
        else if (isDean) {
            if (task.faculty && task.faculty !== requestingUser.faculty) {
                throw new AppError('Dean can only reassign tasks within their own faculty.', 403);
            }
            if (task.department) {
                const userDepts = [u.department, ...(u.departments || [])].filter(Boolean);
                if (!userDepts.includes(task.department)) {
                    throw new AppError('This task is scoped to a specific department. Reassignment must stay within that department.', 403);
                }
            } else {
                if (u.faculty !== requestingUser.faculty) {
                    throw new AppError('New assignee must be within your faculty for faculty-level tasks.', 403);
                }
            }
        }

        // C. Director Logic
        else if (isDirector) {
            if (task.department) {
                const userDepts = [u.department, ...(u.departments || [])].filter(Boolean);
                if (!userDepts.includes(task.department)) {
                    throw new AppError('This task is scoped to a specific department. Reassignment must stay within that department.', 403);
                }
            }
        }

        return assigneeId;
    }));

    const currentAssigneeIds = task.assignees.map(a => a.user.toString());
    const newAssigneeIdsStr = validatedAssignees.map(id => id.toString());

    // Detect changes for history
    const added = newAssigneeIdsStr.filter(id => !currentAssigneeIds.includes(id));
    const removed = currentAssigneeIds.filter(id => !newAssigneeIdsStr.includes(id));

    if (added.length === 0 && removed.length === 0) {
        return task;
    }

    // Update history for each addition (conceptually tracking transition)
    added.forEach(id => {
        task.reassignmentHistory.push({
            previousAssignee: 'multiple', // Or track more granularly if needed
            newAssignee: id,
            reassignedBy: actorId,
        });
    });
    
    // Set final assignee state
    task.assignees = newAssigneeIdsStr.map(id => ({ user: id, status: 'pending' }));
    
    await task.save();

    // Notify all new assignees
    added.forEach(async (id) => {
        socketUtil.emitToUser(id, 'task_reassigned', { taskId: task._id, message: 'A new task has been assigned to you.' });
        
        // In-app notification
        await sendNotification({
            recipient: id,
            type: 'TASK_REASSIGNED',
            title: 'Task Reassigned',
            message: `${requestingUser.name} reassigned task "${task.title}" to you.`,
            link: `/tasks?highlight=${task.customId || task._id}`,
            sender: requestingUser.customId || requestingUser._id.toString(),
        }).catch(err => console.error('Notification error:', err));

        // Email notification
        const u = await User.findOne(getIdentifierQuery(id));
        if (u && u.email) {
            emailService.sendTaskAssignmentEmail(u, task, requestingUser).catch(() => {});
        }
    });

    // Notify removed assignees
    removed.forEach(async (id) => {
        socketUtil.emitToUser(id, 'task_reassigned', { taskId: task._id, message: 'A task has been reassigned away from you.' });
        await sendNotification({
            recipient: id,
            type: 'TASK_REASSIGNED',
            title: 'Task Reassigned',
            message: `${requestingUser.name} reassigned task "${task.title}" away from you.`,
            link: `/tasks?highlight=${task.customId || task._id}`,
            sender: requestingUser.customId || requestingUser._id.toString(),
        }).catch(err => console.error('Notification error:', err));
    });

    await logAction({
        actor: actorId,
        action: AUDIT_ACTIONS.TASK_REASSIGNED,
        targetType: 'Task',
        targetId: task.customId,
        details: { added, removed, total: task.assignees.length },
    });

    return task;
};

/**
 * Intervention logic to change deadlines or priorities (Director/Admin only)
 */
const updateTaskIntervention = async (taskId, { dueDate, priority }, actorUser) => {
    const task = await Task.findOne(getIdentifierQuery(taskId));
    if (!task) throw new AppError('No task found with that ID', 404);

    if (dueDate) {
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        const dDate = new Date(dueDate);
        if (isNaN(dDate.getTime())) {
            throw new AppError('Invalid due date provided.', 400);
        }
        if (dDate < now) {
            throw new AppError('New deadline cannot be in the past.', 400);
        }
        
        await logAction({
            actor: actorUser._id,
            action: AUDIT_ACTIONS.TASK_UPDATED,
            targetType: 'Task',
            targetId: task.customId,
            details: { field: 'dueDate', from: task.dueDate, to: dueDate }
        });
        task.dueDate = dueDate;
    }

    if (priority) {
        updates.priority = priority;
        await logAction({
            actor: actorUser._id,
            action: AUDIT_ACTIONS.TASK_UPDATED,
            targetType: 'Task',
            targetId: task.customId,
            details: { field: 'priority', from: task.priority, to: priority }
        });
        task.priority = priority;
    }

    await task.save();

    // Notify all assignees
    task.assignees.forEach(async (a) => {
        const userId = a.user.toString();
        socketUtil.emitToUser(userId, 'task_intervened', { 
            taskId: task._id, 
            message: `Administrator ${actorUser.name} updated your task timeline or priority.` 
        });
        
        await sendNotification({
            recipient: userId,
            type: 'TASK_INTERVENTION',
            title: 'Administrative Intervention',
            message: `Administrator ${actorUser.name} updated the timeline or priority for task "${task.title}".`,
            link: `/tasks?highlight=${task.customId || task._id}`,
        }).catch(() => {});
    });

    return task;
};

/**
 * Adds a comment to a task
 */
const addComment = async (taskId, user, message, parentCommentId = null) => {
    const task = await Task.findOne(getIdentifierQuery(taskId));
    if (!task) throw new AppError('No task found with that ID', 404);

    const authorId = user.customId || user._id.toString();

    // Permissions check - If they can view comments, they can add comments for these roles
    const isAdmin = user.role === ROLES.ADMIN;
    const isDirector = user.role === ROLES.DIRECTOR;
    const isDean = user.role === ROLES.DEAN;
    const isCoordinator = user.role === ROLES.COORDINATOR;
    const isAssigner = task.assigner === authorId;
    const isAssignee = task.assignees.some(a => a.user.toString() === authorId);

    // Directors and Admins can comment on anything
    // Deans and Coordinators can comment on any task they can see
    // Staff can only comment if they are assignees or the task belongs to their department
    let isAuthorized = isAdmin || isDirector || isAssigner || isAssignee;

    if (!isAuthorized) {
        if (isDean && user.faculty) {
            // Dean can comment on anything in their faculty, or any task they are viewing (security is handled by the route/visibility logic)
            // But to be precise: check if task matches faculty OR has meaningful member
            const isTaskInFaculty = task.faculty?.toString() === user.faculty.toString();
            if (isTaskInFaculty) {
                isAuthorized = true;
            } else {
                const User = require('../users/user.model');
                const members = await User.find({ faculty: user.faculty }).select('customId _id').lean();
                const memberIds = members.map(m => m.customId || m._id.toString());
                isAuthorized = task.assignees.some(a => memberIds.includes(a.user.toString()));
            }
        } else if (isCoordinator) {
            const deptIds = [user.department, ...(user.departments || [])].filter(Boolean);
            const hasDeptMatch = task.department && deptIds.includes(task.department.toString());
            const hasOfficeMatch = user.office && task.office && user.office.toString() === task.office.toString();

            if (hasDeptMatch || hasOfficeMatch) {
                isAuthorized = true;
            } else {
                const User = require('../users/user.model');
                const memberQuery = { $or: [] };
                if (deptIds.length) {
                    memberQuery.$or.push({ department: { $in: deptIds } }, { departments: { $elemMatch: { $in: deptIds } } });
                }
                if (user.office) {
                    memberQuery.$or.push({ office: user.office });
                }
                
                if (memberQuery.$or.length === 0) isAuthorized = false;
                else {
                    const members = await User.find(memberQuery).select('customId _id').lean();
                    const memberIds = members.map(m => m.customId || m._id.toString());
                    isAuthorized = task.assignees.some(a => memberIds.includes(a.user.toString()));
                }
            }
        }
    }

    if (!isAuthorized) {
        throw new AppError('You do not have permission to comment on this task.', 403);
    }

    const comment = await TaskComment.create({
        taskId: task._id,
        taskCustomId: task.customId,
        userId: authorId,
        comment: message,
        parentCommentId: parentCommentId,
    });

    await logAction({
        actor: authorId,
        action: AUDIT_ACTIONS.TASK_COMMENTED,
        targetType: 'Task',
        targetId: task.customId,
        details: { commentId: comment.customId, parentCommentId },
    });

    return comment.populate('authorData', 'name role profilePhoto');
};

/**
 * Gets all comments on a task
 */
const getTaskComments = async (taskId, user) => {
    const task = await Task.findOne(getIdentifierQuery(taskId));
    if (!task) throw new AppError('No task found with that ID', 404);

    // Visibility Check
    const userId = user.customId || user._id.toString();
    const isAdmin = user.role === ROLES.ADMIN;
    const isDirector = user.role === ROLES.DIRECTOR;
    const isAssigner = task.assigner === userId;
    const isAssignee = task.assignees.some(a => a.user.toString() === userId);

    let isAuthorized = isAdmin || isDirector || isAssigner || isAssignee;

    if (!isAuthorized) {
        if (user.role === ROLES.DEAN && user.faculty) {
            const User = require('../users/user.model');
            const facultyMembers = await User.find({ faculty: user.faculty }).select('customId _id').lean();
            const memberIds = facultyMembers.map(m => m.customId || m._id.toString());
            isAuthorized = task.assignees.some(a => memberIds.includes(a.user.toString()));
        } else if (user.role === ROLES.COORDINATOR) {
            const User = require('../users/user.model');
            const deptIds = [user.department, ...(user.departments || [])].filter(Boolean);
            
            const memberQuery = { $or: [] };
            if (deptIds.length) {
                memberQuery.$or.push({ department: { $in: deptIds } }, { departments: { $elemMatch: { $in: deptIds } } });
            }
            if (user.office) {
                memberQuery.$or.push({ office: user.office });
            }

            if (memberQuery.$or.length > 0) {
                const members = await User.find(memberQuery).select('customId _id').lean();
                const memberIds = members.map(m => m.customId || m._id.toString());
                isAuthorized = task.assignees.some(a => memberIds.includes(a.user.toString()));
            }
        } else if (user.role === ROLES.STAFF && (user.department || user.departments?.length)) {
             // Staff can see if they share any department with the task's stamped department (legacy)
             const deptIds = [user.department, ...(user.departments || [])].filter(Boolean);
             isAuthorized = task.department && deptIds.includes(task.department.toString());
        } else if (user.role === ROLES.STAFF && user.office) {
             isAuthorized = task.office && task.office.toString() === user.office.toString();
        }
    }

    if (!isAuthorized) {
        throw new AppError('Unauthorised to view comments for this task', 403);
    }

    const comments = await TaskComment.find({ taskId: task._id, isDeleted: { $ne: true } })
        .sort({ createdAt: 1 })
        .populate('authorData', 'name role profilePhoto')
        .populate({
            path: 'parentData',
            populate: { path: 'authorData', select: 'name role profilePhoto' }
        });

    return { task, comments };
};

const buildTaskQuery = (baseQuery, filters) => {
    const query = { ...baseQuery };
    
    // Rule: Automatically remove COMPLETED or STALE PENDING tasks from table one day after the due date
    // IN_PROGRESS tasks should remain visible until completed.
    const now = new Date();
    const expirationThreshold = new Date(now);
    expirationThreshold.setDate(expirationThreshold.getDate() - 1);
    
    const visibilityCondition = {
        $or: [
            { status: 'in_progress' },
            { 'assignees.status': 'in_progress' },
            { dueDate: { $gt: expirationThreshold } }
        ]
    };

    if (query.$and) {
        query.$and.push(visibilityCondition);
    } else {
        query.$and = [visibilityCondition];
    }

    if (filters.status) {
        if (filters.status === 'overdue') {
            const overdueCondition = {
                $and: [
                    { status: { $ne: 'completed' } },
                    { dueDate: { $lt: now } }
                ]
            };
            if (query.$and) {
                query.$and.push(overdueCondition);
            } else {
                query.$and = [overdueCondition];
            }
        } else {
            query.status = filters.status;
        }
    }
    if (filters.priority) query.priority = filters.priority;
    if (filters.roleType) query.roleType = filters.roleType;
    if (filters.faculty) query.faculty = filters.faculty;
    if (filters.department) query.department = filters.department;
    if (filters.office) query.office = filters.office;
    if (filters.search) {
        const isExact = filters.search.startsWith('"') && filters.search.endsWith('"');
        const searchTerm = isExact ? filters.search.slice(1, -1) : filters.search;
        const searchRegex = isExact ? new RegExp(`^${searchTerm}$`, 'i') : new RegExp(searchTerm, 'i');
        
        const searchCondition = {
            $or: [
                { title: { $regex: searchRegex } },
                { description: { $regex: searchRegex } }
            ]
        };

        if (query.$and) {
            query.$and.push(searchCondition);
        } else if (query.$or) {
             // If query already has an $or, we must use $and to combine them
             const existingOr = query.$or;
             delete query.$or;
             query.$and = [{ $or: existingOr }, searchCondition];
        } else {
            query.$or = searchCondition.$or;
        }
    }
    return query;
};

/**
 * Gets tasks assigned BY a specific user (assigner role table)
 * Matches against both customId and _id string forms stored in task.assigner
 */
const getTasksAssignedBy = async (assignerUser, filters = {}, limit = 50, page = 1) => {
    const skip = (page - 1) * limit;

    // task.assigner stores customId || _id.toString() — match both
    const assignerIds = [];
    if (assignerUser.customId) assignerIds.push(assignerUser.customId);
    if (assignerUser._id) assignerIds.push(assignerUser._id.toString());

    const query = buildTaskQuery({ assigner: { $in: assignerIds } }, filters);

    const tasks = await Task.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('assigneesData', 'name customId role profilePhoto')
        .populate('assignerData', 'name customId role profilePhoto')
        .populate('departmentData', 'name customId')
        .populate('facultyData', 'name customId');

    const total = await Task.countDocuments(query);
    return { tasks, total, page, limit, totalPages: Math.ceil(total / limit) };
};

/**
 * Gets tasks assigned to members of the requesting user's hierarchy
 * but NOT assigned by the requesting user (oversight table).
 *
 * Strategy: two-step query
 *   1. Resolve all member customIds in the scope (faculty / department / all)
 *   2. Find tasks where assignees.user ∈ memberIds
 *
 * This correctly handles tasks assigned by Directors or other leaders
 * regardless of what faculty/department was stamped on the task itself.
 */
const getTasksForMembers = async (scopeUser, filters = {}, limit = 50, page = 1) => {
    const User = require('../users/user.model');
    const skip = (page - 1) * limit;

    // Build the user-scope query to find relevant members
    let memberUserQuery = {};

    if (scopeUser.role === ROLES.DIRECTOR) {
        // Director sees all users' tasks
        memberUserQuery = {};
    } else if (scopeUser.role === ROLES.DEAN) {
        const facultyId = scopeUser.faculty;
        if (!facultyId) return { tasks: [], total: 0, page, limit, totalPages: 0 };
        // All users in the dean's faculty (coordinators, staff, etc.)
        memberUserQuery = { faculty: facultyId };
    } else if (scopeUser.role === ROLES.COORDINATOR) {
        const deptIds = [scopeUser.department, ...(scopeUser.departments || [])].filter(Boolean);
        
        const conditions = [];
        if (deptIds.length) {
            conditions.push({ department: { $in: deptIds } }, { departments: { $elemMatch: { $in: deptIds } } });
        }
        if (scopeUser.office) {
            conditions.push({ office: scopeUser.office });
        }

        if (!conditions.length) return { tasks: [], total: 0, page, limit, totalPages: 0 };
        memberUserQuery = { $or: conditions };
    } else {
        return { tasks: [], total: 0, page, limit, totalPages: 0 };
    }

    // Step 1: Get all member customIds (tasks store customId || _id string)
    const members = await User.find(memberUserQuery).select('customId _id').lean();
    if (!members.length && scopeUser.role !== ROLES.DIRECTOR) {
        return { tasks: [], total: 0, page, limit, totalPages: 0 };
    }

    // Build the set of valid assignee identifiers (both customId and _id string)
    let assigneeIds;
    if (scopeUser.role === ROLES.DIRECTOR) {
        // No assignee restriction for Director — see all tasks
        assigneeIds = null;
    } else {
        assigneeIds = [];
        members.forEach(m => {
            if (m.customId) assigneeIds.push(m.customId);
            assigneeIds.push(m._id.toString());
        });
    }

    // Build the assigner exclusion identifiers (exclude tasks assigned BY self)
    const selfIds = [];
    if (scopeUser.customId) selfIds.push(scopeUser.customId);
    if (scopeUser._id) selfIds.push(scopeUser._id.toString());

    // Step 2: Find tasks where at least one assignee is in scope
    let scopeQuery = {};
    if (assigneeIds !== null) {
        scopeQuery['assignees.user'] = { $in: assigneeIds };
    }
    // Exclude tasks the current user assigned themselves
    scopeQuery.assigner = { $nin: selfIds };

    const query = buildTaskQuery(scopeQuery, filters);
    
    // No extra status handling needed here as buildTaskQuery handles it strictly on the aggregate status field.

    const tasks = await Task.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('assigneesData', 'name customId role profilePhoto')
        .populate('assignerData', 'name customId role profilePhoto')
        .populate('departmentData', 'name customId')
        .populate('facultyData', 'name customId');

    const total = await Task.countDocuments(query);
    return { tasks, total, page, limit, totalPages: Math.ceil(total / limit) };
};



/**
 * Gets all tasks assigned to a specific user (with pagination)
 */
const getTasksForUser = async (userId, filters = {}, limit = 50, page = 1) => {
    const resolvedUserId = await resolveId(userId, 'User');
    const skip = (page - 1) * limit;

    let baseQuery = { 'assignees.user': resolvedUserId };
    
    // If filtering by status in "My Tasks", we want to filter by the user's specific status
    // while still applying general task filters (priority, search, etc.)
    const statusFilter = filters.status;
    const { status, ...otherFilters } = filters;

    if (statusFilter) {
        if (statusFilter === 'overdue') {
            baseQuery = {
                $and: [
                    { 'assignees.user': resolvedUserId },
                    { 'assignees.status': { $ne: 'completed' } },
                    { dueDate: { $lt: new Date() } }
                ]
            };
        } else {
            baseQuery = {
                assignees: {
                    $elemMatch: {
                        user: resolvedUserId,
                        status: statusFilter
                    }
                }
            };
        }
    }

    const query = buildTaskQuery(baseQuery, otherFilters);
    
    const tasks = await Task.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('assigneesData', 'name customId role profilePhoto')
        .populate('assignerData', 'name customId role profilePhoto')
        .populate('departmentData', 'name customId');

    const total = await Task.countDocuments(query);
    return { tasks, total, page, limit, totalPages: Math.ceil(total / limit) };
}

/**
 * Gets all tasks assigned to users within a department (Coordinator view).
 * Uses a two-step query: resolve department members → find their tasks.
 */
const getTasksByDepartment = async (deptId, filters = {}, limit = 50, page = 1) => {
    const User = require('../users/user.model');
    const skip = (page - 1) * limit;

    const deptIds = Array.isArray(deptId) ? deptId : [deptId];

    // Step 1: Resolve all users in the department
    const members = await User.find({
        $or: [
            { department: { $in: deptIds } },
            { departments: { $elemMatch: { $in: deptIds } } }
        ]
    }).select('customId _id').lean();

    if (!members.length) {
        return { tasks: [], total: 0, page, limit, totalPages: 0 };
    }

    const memberIds = [];
    members.forEach(m => {
        if (m.customId) memberIds.push(m.customId);
        memberIds.push(m._id.toString());
    });

    // Step 2: Find tasks assigned to any of those users
    let baseQuery = {
        'assignees.user': { $in: memberIds }
    };

    const query = buildTaskQuery(baseQuery, filters);
    // Handled by buildTaskQuery strictly now.

    const tasks = await Task.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('assigneesData', 'name customId role profilePhoto')
        .populate('assignerData', 'name customId role profilePhoto')
        .populate('departmentData', 'name customId');

    const total = await Task.countDocuments(query);
    return { tasks, total, page, limit, totalPages: Math.ceil(total / limit) };
};

/**
 * Gets all tasks assigned to users within a faculty (Dean view).
 * Uses a two-step query: resolve faculty members → find their tasks.
 */
const getTasksByFaculty = async (facultyId, filters = {}, limit = 50, page = 1) => {
    const User = require('../users/user.model');
    const skip = (page - 1) * limit;

    // Step 1: Resolve all users in the faculty
    const members = await User.find({ faculty: facultyId }).select('customId _id').lean();

    if (!members.length) {
        return { tasks: [], total: 0, page, limit, totalPages: 0 };
    }

    const memberIds = [];
    members.forEach(m => {
        if (m.customId) memberIds.push(m.customId);
        memberIds.push(m._id.toString());
    });

    // Step 2: Find tasks assigned to any of those users
    let baseQuery = {
        'assignees.user': { $in: memberIds }
    };

    const query = buildTaskQuery(baseQuery, filters);
    // Handled by buildTaskQuery strictly now.

    const tasks = await Task.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('assigneesData', 'name customId role profilePhoto')
        .populate('assignerData', 'name customId role profilePhoto')
        .populate('departmentData', 'name customId')
        .populate('facultyData', 'name customId');

    const total = await Task.countDocuments(query);
    return { tasks, total, page, limit, totalPages: Math.ceil(total / limit) };
};

const getAllTasks = async (filters = {}, limit = 100, page = 1) => {
    const skip = (page - 1) * limit;
    const query = buildTaskQuery({}, filters);
    
    const tasks = await Task.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('assigneesData', 'name customId role profilePhoto')
        .populate('assignerData', 'name customId role profilePhoto')
        .populate('departmentData', 'name')
        .populate('facultyData', 'name');

    const total = await Task.countDocuments(query);
    return { tasks, total, page, limit, totalPages: Math.ceil(total / limit) };
};

/**
 * Gets a single task by ID
 */
const getTaskById = async (taskId, user) => {
    const task = await Task.findOne(getIdentifierQuery(taskId))
        .populate('assigneesData', 'name email status role profilePhoto customId')
        .populate('assignerData', 'name email role profilePhoto customId')
        .populate('facultyData', 'name')
        .populate('departmentData', 'name');

    if (!task) throw new AppError('No task found with that ID', 404);

    // Visibility Check
    const userId = user.customId || user._id.toString();
    const isAdmin = user.role === ROLES.ADMIN;
    const isDirector = user.role === ROLES.DIRECTOR;
    const isAssignee = task.assignees.some(a => a.user.toString() === userId);
    const isAssigner = task.assigner.toString() === userId;
    const isCoordinator = user.role === ROLES.COORDINATOR && (user.department?.toString() === task.department?.toString() || user.office?.toString() === task.office?.toString());
    const isDean = user.role === ROLES.DEAN && (user.faculty?.toString() === task.faculty?.toString());
    const isStaffInDept = user.role === ROLES.STAFF && (user.departments?.includes(task.department?.toString()) || user.department?.toString() === task.department?.toString() || user.office?.toString() === task.office?.toString());

    if (!isAdmin && !isDirector && !isAssignee && !isAssigner && !isCoordinator && !isDean && !isStaffInDept) {
        throw new AppError('You do not have permission to view this task', 403);
    }

    return task;
};

/**
 * Deletes a task
 */
const deleteTask = async (taskId, actorUser) => {
    const task = await Task.findOne(getIdentifierQuery(taskId));
    if (!task) throw new AppError('No task found with that ID', 404);

    // Build both ID forms used when storing task.assigner
    const actorIds = [];
    if (actorUser.customId) actorIds.push(actorUser.customId);
    if (actorUser._id) actorIds.push(actorUser._id.toString());

    const isAssigner  = actorIds.includes(task.assigner?.toString());
    const isAdmin     = actorUser.role === ROLES.ADMIN;
    const isDirector  = actorUser.role === ROLES.DIRECTOR;

    // Director and Admin can delete any task
    // Dean / Coordinator can only delete tasks THEY assigned
    if (!isAdmin && !isDirector && !isAssigner) {
        throw new AppError('You can only delete tasks that you personally assigned.', 403);
    }

    await Task.deleteOne({ _id: task._id });

    await logAction({
        actor: actorUser.customId || actorUser._id,
        action: AUDIT_ACTIONS.TASK_DELETED,
        targetType: 'Task',
        targetId: task.customId,
        details: { title: task.title },
    });

    return true;
};

const deleteTaskComment = async (commentId, actorUser) => {
    const comment = await TaskComment.findById(commentId);
    if (!comment) throw new AppError('Comment not found', 404);

    const actorId = actorUser.customId || actorUser._id.toString();

    // Only the author can delete their comment
    if (comment.userId !== actorId && actorUser.role !== ROLES.ADMIN) {
        throw new AppError('You can only delete your own comments.', 403);
    }

    comment.isDeleted = true;
    await comment.save();

    await logAction({
        actor: actorId,
        action: AUDIT_ACTIONS.TASK_COMMENT_DELETED,
        targetType: 'TaskComment',
        targetId: comment.customId || comment._id,
        details: { taskId: comment.taskCustomId },
    });

    return true;
};

module.exports = {
    createTask,
    updateTaskStatus,
    reassignTask,
    addComment,
    deleteTaskComment,
    getTaskComments,
    getTasksForUser,
    getTasksAssignedBy,
    getTasksForMembers,
    getTasksByDepartment,
    getTasksByFaculty,
    getAllTasks,
    getTaskById,
    deleteTask,
    checkOverdueTasks,
    updateTaskIntervention,
    getTasksByOffice: async (officeId, filters = {}, limit = 50, page = 1) => {
        const User = require('../users/user.model');
        const skip = (page - 1) * limit;

        const members = await User.find({ office: officeId }).select('customId _id').lean();
        if (!members.length) return { tasks: [], total: 0, page, limit, totalPages: 0 };

        const memberIds = [];
        members.forEach(m => {
            if (m.customId) memberIds.push(m.customId);
            memberIds.push(m._id.toString());
        });

        const query = buildTaskQuery({ 'assignees.user': { $in: memberIds } }, filters);
        const tasks = await Task.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit)
            .populate('assigneesData', 'name customId role profilePhoto')
            .populate('assignerData', 'name customId role profilePhoto')
            .populate('departmentData', 'name customId');

        const total = await Task.countDocuments(query);
        return { tasks, total, page, limit, totalPages: Math.ceil(total / limit) };
    }
};
