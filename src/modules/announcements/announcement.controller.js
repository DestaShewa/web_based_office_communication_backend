const announcementService = require('./announcement.service');
const catchAsync = require('../../utils/catchAsync');
const sendResponse = require('../../utils/apiResponse');

/**
 * @desc    Create new announcement
 * @route   POST /api/v1/announcements
 * @access  Private
 */
exports.createAnnouncement = catchAsync(async (req, res, next) => {
    let posterUrl = null;
    const fileUrls = [];

    if (req.files) {
        if (req.files.poster && req.files.poster[0]) {
            posterUrl = `${req.protocol}://${req.get('host')}/uploads/${req.files.poster[0].filename}`;
        }
        
        if (req.files.attachments) {
            req.files.attachments.forEach(file => {
                const fileUrl = `${req.protocol}://${req.get('host')}/uploads/${file.filename}`;
                fileUrls.push(fileUrl);
            });
        }
    }

    const announcementData = { ...req.body, poster: posterUrl };
    const announcement = await announcementService.createAnnouncement(announcementData, req.user, fileUrls);
    sendResponse(res, 201, 'Announcement created successfully', { announcement });
});

/**
 * @desc    Get all relevant announcements for the logged-in user
 * @route   GET /api/v1/announcements
 * @access  Private
 */
exports.getMyAnnouncements = catchAsync(async (req, res, next) => {
    const { limit, page, search, scope, startDate, endDate } = req.query;

    const result = await announcementService.getAnnouncementsForUser(
        req.user,
        { search, scope, startDate, endDate },
        parseInt(limit) || 20,
        parseInt(page) || 1
    );

    const message = result.total === 0
        ? 'No announcements found matching the given criteria.'
        : `Announcements fetched — ${result.total} found.`;

    sendResponse(res, 200, message, result);
});

/**
 * @desc    Get ALL announcements (Admin view, with search support)
 * @route   GET /api/v1/announcements/admin/all
 * @access  Private/Admin, Director
 */
exports.getAllAnnouncementsAdmin = catchAsync(async (req, res, next) => {
    const { limit, page, search, targetType, targetId, scope, startDate, endDate } = req.query;

    const result = await announcementService.getAllAnnouncementsAdmin(
        { search, targetType, targetId, scope, startDate, endDate },
        parseInt(limit) || 50,
        parseInt(page) || 1
    );

    const message = result.total === 0
        ? 'No announcements found matching the given criteria.'
        : `All announcements fetched — ${result.total} found.`;

    sendResponse(res, 200, message, result);
});

/**
 * @desc    Acknowledge/read an announcement
 * @route   PATCH /api/v1/announcements/:id/acknowledge
 * @access  Private
 */
exports.acknowledgeAnnouncement = catchAsync(async (req, res, next) => {
    const announcement = await announcementService.acknowledgeAnnouncement(req.params.id, req.user.customId);
    sendResponse(res, 200, 'Announcement acknowledged successfully', { announcement });
});

/**
 * @desc    Get read status/acknowledgments for an announcement
 * @route   GET /api/v1/announcements/:id/read-status
 * @access  Private/Admin, Creator
 */
exports.getReadStatus = catchAsync(async (req, res, next) => {
    const statusInfo = await announcementService.getAnnouncementReadStatus(req.params.id, req.user);
    sendResponse(res, 200, 'Announcement read status fetched', { statusInfo });
});

/**
 * @desc    Update an announcement
 * @route   PATCH /api/v1/announcements/:id
 * @access  Private/Admin, Creator
 */
exports.updateAnnouncement = catchAsync(async (req, res, next) => {
    let posterUrl = undefined; // use undefined so it doesn't overwrite if not provided
    const fileUrls = [];

    if (req.files) {
        if (req.files.poster && req.files.poster[0]) {
            posterUrl = `${req.protocol}://${req.get('host')}/uploads/${req.files.poster[0].filename}`;
        }
        
        if (req.files.attachments) {
            req.files.attachments.forEach(file => {
                const fileUrl = `${req.protocol}://${req.get('host')}/uploads/${file.filename}`;
                fileUrls.push(fileUrl);
            });
        }
    }

    const updateData = Object.entries(req.body).reduce((acc, [key, value]) => {
        if (value !== '' && value !== null && value !== undefined) {
            acc[key] = value;
        }
        return acc;
    }, {});

    if (posterUrl !== undefined) updateData.poster = posterUrl;
    
    const announcement = await announcementService.updateAnnouncement(req.params.id, updateData, req.user, fileUrls.length > 0 ? fileUrls : undefined);
    sendResponse(res, 200, 'Announcement updated successfully', { announcement });
});

/**
 * @desc    Delete an announcement (Permanent for creator/admin)
 * @route   DELETE /api/v1/announcements/:id
 * @access  Private/Admin, Creator
 */
exports.deleteAnnouncement = catchAsync(async (req, res, next) => {
    await announcementService.deleteAnnouncement(req.params.id, req.user);
    sendResponse(res, 204, 'Announcement deleted permanently', null);
});

/**
 * @desc    Hide an announcement for own view (Personal removal)
 * @route   DELETE /api/v1/announcements/:id/hide
 * @access  Private
 */
exports.hideAnnouncement = catchAsync(async (req, res, next) => {
    await announcementService.hideAnnouncementForUser(req.params.id, req.user.customId);
    sendResponse(res, 200, 'Announcement removed from your view', null);
});
