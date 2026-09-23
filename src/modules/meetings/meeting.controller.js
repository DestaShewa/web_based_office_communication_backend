const meetingService = require('./meeting.service');
const catchAsync = require('../../utils/catchAsync');
const sendResponse = require('../../utils/apiResponse');

/**
 * Schedule a new meeting
 */
exports.scheduleMeeting = catchAsync(async (req, res, next) => {
    const meeting = await meetingService.scheduleMeeting(req.body, req.user);
    sendResponse(res, 201, 'Meeting scheduled successfully', { meeting });
});


/**
 * Get all meetings for logged-in user
 */
exports.getMyMeetings = catchAsync(async (req, res, next) => {
    const { limit, page, search } = req.query;
    const result = await meetingService.getMyMeetings(
        req.user,
        { search },
        parseInt(limit) || 50,
        parseInt(page) || 1
    );

    // Issue 11: descriptive message for empty results
    const message = result.total === 0
        ? 'No meetings found matching the given criteria.'
        : `Your meetings retrieved successfully — ${result.total} found.`;

    sendResponse(res, 200, message, result);
});

/**
 * Get department meetings
 */
exports.getDepartmentMeetings = catchAsync(async (req, res, next) => {
    const { limit, page, search } = req.query;
    const result = await meetingService.getDepartmentMeetings(
        req.params.deptId,
        req.user,
        { search },
        parseInt(limit) || 50,
        parseInt(page) || 1
    );

    // Issue 11: descriptive message for empty results
    const message = result.total === 0
        ? 'No department meetings found matching the given criteria.'
        : `Department meetings retrieved successfully — ${result.total} found.`;

    sendResponse(res, 200, message, result);
});

/**
 * Get faculty meetings
 */
exports.getFacultyMeetings = catchAsync(async (req, res, next) => {
    const { limit, page, search } = req.query;
    const result = await meetingService.getFacultyMeetings(
        req.params.facultyId,
        req.user,
        { search },
        parseInt(limit) || 50,
        parseInt(page) || 1
    );

    const message = result.total === 0
        ? 'No faculty meetings found matching the given criteria.'
        : `Faculty meetings retrieved successfully — ${result.total} found.`;

    sendResponse(res, 200, message, result);
});

/**
 * Get office meetings
 */
exports.getOfficeMeetings = catchAsync(async (req, res, next) => {
    const { limit, page, search } = req.query;
    const result = await meetingService.getOfficeMeetings(
        req.params.officeId,
        req.user,
        { search },
        parseInt(limit) || 50,
        parseInt(page) || 1
    );

    const message = result.total === 0
        ? 'No office meetings found matching the given criteria.'
        : `Office meetings retrieved successfully — ${result.total} found.`;

    sendResponse(res, 200, message, result);
});

/**
 * Update meeting status
 */
exports.updateMeetingStatus = catchAsync(async (req, res, next) => {
    const meeting = await meetingService.updateMeetingStatus(
        req.params.id, 
        req.body.status, 
        req.user
    );
    sendResponse(res, 200, 'Meeting status updated successfully', { meeting });
});


/**
 * Get all meetings (Global oversight)
 */
exports.getAllMeetings = catchAsync(async (req, res, next) => {
    const { limit, page, search } = req.query;
    const result = await meetingService.getAllMeetings(
        req.user,
        { search },
        parseInt(limit) || 50,
        parseInt(page) || 1
    );

    const message = result.total === 0
        ? 'No meetings found across the institution.'
        : `All institutional meetings retrieved — ${result.total} found.`;

    sendResponse(res, 200, message, result);
});

/**
 * Get university meetings
 */
exports.getUniversityMeetings = catchAsync(async (req, res, next) => {
    const { limit, page, search } = req.query;
    const result = await meetingService.getUniversityMeetings(
        req.user,
        { search },
        parseInt(limit) || 50,
        parseInt(page) || 1
    );

    const message = result.total === 0
        ? 'No university meetings found matching the given criteria.'
        : `University meetings retrieved successfully — ${result.total} found.`;

    sendResponse(res, 200, message, result);
});
