const taskService = require('./task.service');
const catchAsync = require('../../utils/catchAsync');
const sendResponse = require('../../utils/apiResponse');

/**
 * @desc    Create new task
 * @route   POST /api/v1/tasks
 * @access  Coordinator, Dean, Director, Admin
 */
exports.createTask = catchAsync(async (req, res, next) => {
    const task = await taskService.createTask(req.body, req.user);
    sendResponse(res, 201, 'Task created successfully', { task });
});

/**
 * @desc    Get all tasks (org overview)
 * @route   GET /api/v1/tasks
 * @access  Admin, Director
 */
exports.getAllTasks = catchAsync(async (req, res, next) => {
    const { limit, page, status, priority, search, roleType, faculty, department } = req.query;
    const result = await taskService.getAllTasks(
        { status, priority, search, roleType, faculty, department }, 
        parseInt(limit) || 100, 
        parseInt(page) || 1
    );

    const message = result.total === 0
        ? 'No tasks found matching the given criteria.'
        : `All tasks fetched — ${result.total} found.`;

    sendResponse(res, 200, message, result);
});

/**
 * @desc    Get tasks assigned BY the current user
 * @route   GET /api/v1/tasks/assigned-by-me
 * @access  Coordinator, Dean, Director, Admin
 */
exports.getAssignedByMeTasks = catchAsync(async (req, res, next) => {
    const { limit, page, status, priority, search, roleType, faculty, department } = req.query;
    const result = await taskService.getTasksAssignedBy(
        req.user,
        { status, priority, search, roleType, faculty, department },
        parseInt(limit) || 50,
        parseInt(page) || 1
    );
    const message = result.total === 0
        ? 'You have not assigned any tasks yet.'
        : `Tasks assigned by you — ${result.total} found.`;
    sendResponse(res, 200, message, result);
});

/**
 * @desc    Get tasks assigned to members in current user's hierarchy (by others)
 * @route   GET /api/v1/tasks/members
 * @access  Coordinator, Dean, Director
 */
exports.getMembersTasks = catchAsync(async (req, res, next) => {
    const { limit, page, status, priority, search, roleType, faculty, department } = req.query;
    const result = await taskService.getTasksForMembers(
        req.user,
        { status, priority, search, roleType, faculty, department },
        parseInt(limit) || 50,
        parseInt(page) || 1
    );
    const message = result.total === 0
        ? 'No member tasks found.'
        : `Member tasks fetched — ${result.total} found.`;
    sendResponse(res, 200, message, result);
});



/**
 * @desc    Get a single task by ID
 * @route   GET /api/v1/tasks/:id
 * @access  Private
 */
exports.getTaskById = catchAsync(async (req, res, next) => {
    const task = await taskService.getTaskById(req.params.id, req.user);
    sendResponse(res, 200, 'Task fetched successfully', { task });
});

/**
 * @desc    Get logged-in user's assigned tasks
 * @route   GET /api/v1/tasks/me
 * @access  Private
 */
exports.getMyTasks = catchAsync(async (req, res, next) => {
    const { limit, page, status, priority, search, roleType, faculty, department } = req.query;
    const result = await taskService.getTasksForUser(
        req.user._id,
        { status, priority, search, roleType, faculty, department },
        parseInt(limit) || 50,
        parseInt(page) || 1
    );

    const message = result.total === 0
        ? 'You have no assigned tasks matching these criteria.'
        : `Your tasks fetched — ${result.total} found.`;

    sendResponse(res, 200, message, result);
});

/**
 * @desc    Get tasks for a specific department
 * @route   GET /api/v1/tasks/department/:deptId
 * @access  Coordinator, Admin
 */
exports.getDepartmentTasks = catchAsync(async (req, res, next) => {
    const { limit, page, status, priority, search, roleType, faculty, department: deptFilter } = req.query;
    const deptId = req.params.deptId === 'me' 
        ? (req.user.departments && req.user.departments.length > 0 ? req.user.departments : req.user.department)
        : req.params.deptId;

    const result = await taskService.getTasksByDepartment(
        deptId,
        { status, priority, search, roleType, faculty, department: deptFilter },
        parseInt(limit) || 50,
        parseInt(page) || 1
    );

    const message = result.total === 0
        ? 'No department tasks found matching these criteria.'
        : `Department tasks fetched — ${result.total} found.`;

    sendResponse(res, 200, message, result);
});

/**
 * @desc    Get tasks for a specific faculty
 * @route   GET /api/v1/tasks/faculty/:facultyId
 * @access  Dean, Admin
 */
exports.getFacultyTasks = catchAsync(async (req, res, next) => {
    const { limit, page, status, priority, search, roleType, faculty: facultyFilter, department } = req.query;
    const result = await taskService.getTasksByFaculty(
        req.params.facultyId,
        { status, priority, search, roleType, faculty: facultyFilter, department },
        parseInt(limit) || 50,
        parseInt(page) || 1
    );

    sendResponse(res, 200, message, result);
});

/**
 * @desc    Get tasks for a specific office
 * @route   GET /api/v1/tasks/office/:officeId
 * @access  Coordinator, Admin
 */
exports.getOfficeTasks = catchAsync(async (req, res, next) => {
    const { limit, page, status, priority, search, roleType, faculty, department, office: officeFilter } = req.query;
    const officeId = req.params.officeId === 'me' ? req.user.office : req.params.officeId;

    const result = await taskService.getTasksByOffice(
        officeId,
        { status, priority, search, roleType, faculty, department, office: officeFilter },
        parseInt(limit) || 50,
        parseInt(page) || 1
    );

    const message = result.total === 0
        ? 'No office tasks found matching these criteria.'
        : `Office tasks fetched — ${result.total} found.`;

    sendResponse(res, 200, message, result);
});

/**
 * @desc    Update task status
 * @route   PATCH /api/v1/tasks/:id/status
 * @access  Assignee, Assigner, Admin
 */
exports.updateTaskStatus = catchAsync(async (req, res, next) => {
    const task = await taskService.updateTaskStatus(req.params.id, req.body.status, req.user);
    sendResponse(res, 200, 'Task status updated', { task });
});

/**
 * @desc    Reassign a task to a different employee
 * @route   PATCH /api/v1/tasks/:id/reassign
 * @access  Coordinator, Dean, Admin
 */
exports.reassignTask = catchAsync(async (req, res, next) => {
    const task = await taskService.reassignTask(req.params.id, req.body.newAssigneeId, req.user);
    sendResponse(res, 200, 'Task reassigned successfully', { task });
});

/**
 * @desc    Add a comment to a task
 * @route   POST /api/v1/tasks/:id/comments
 * @access  Private (any authenticated user)
 */
exports.addComment = catchAsync(async (req, res, next) => {
    const { message, parentCommentId } = req.body;
    const task = await taskService.addComment(req.params.id, req.user, message, parentCommentId);
    sendResponse(res, 201, 'Comment added successfully', { task });
});

/**
 * @desc    Delete a task comment
 * @route   DELETE /api/v1/tasks/comments/:commentId
 * @access  Private (author only)
 */
exports.deleteComment = catchAsync(async (req, res, next) => {
    await taskService.deleteTaskComment(req.params.commentId, req.user);
    sendResponse(res, 204, 'Comment deleted successfully', null);
});

/**
 * @desc    Get comments on a task
 * @route   GET /api/v1/tasks/:id/comments
 * @access  Private (any authenticated user)
 */
exports.getTaskComments = catchAsync(async (req, res, next) => {
    const task = await taskService.getTaskComments(req.params.id, req.user);
    sendResponse(res, 200, 'Comments fetched', { task });
});

/**
 * @desc    Update task deadline or priority (Administrative Intervention)
 * @route   PATCH /api/v1/tasks/:id/intervention
 * @access  Admin, Director
 */
exports.updateTaskIntervention = catchAsync(async (req, res, next) => {
    const { dueDate, priority } = req.body;
    const task = await taskService.updateTaskIntervention(req.params.id, { dueDate, priority }, req.user);
    sendResponse(res, 200, 'Task successfully updated via administrative intervention.', { task });
});

/**
 * @desc    Delete a task
 * @route   DELETE /api/v1/tasks/:id
 * @access  Assigner, Admin, Director
 */
exports.deleteTask = catchAsync(async (req, res, next) => {
    await taskService.deleteTask(req.params.id, req.user);
    sendResponse(res, 204, 'Task deleted successfully', null);
});
