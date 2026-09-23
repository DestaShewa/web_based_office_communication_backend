const express = require('express');
const announcementController = require('./announcement.controller');
const { protect, restrictTo } = require('../../middlewares/auth.middleware');
const { attachScope } = require('../../middlewares/scope.middleware');
const upload = require('../../utils/fileUpload');
const ROLES = require('../../constants/roles');

const router = express.Router();

// All routes are protected and scoped
router.use(protect);
router.use(attachScope);

// Everyone can view their relevant announcements, acknowledge them, or hide them from their view
router.get('/', announcementController.getMyAnnouncements);
router.patch('/:id/acknowledge', announcementController.acknowledgeAnnouncement);
router.delete('/:id/hide', announcementController.hideAnnouncement);

// Admins and Creators can view read status (handled in service)
router.get('/:id/read-status', announcementController.getReadStatus);

// Admin-only system-wide announcement search
router.get('/admin/all', restrictTo(ROLES.ADMIN), announcementController.getAllAnnouncementsAdmin);

// Only Admin, Director, Dean and Coordinator can post
router.use(restrictTo(ROLES.ADMIN, ROLES.DIRECTOR, ROLES.DEAN, ROLES.COORDINATOR));

// 'attachments' and 'poster' must match the form-data field names sent from the frontend
router.post(
    '/', 
    upload.fields([
        { name: 'poster', maxCount: 1 },
        { name: 'attachments', maxCount: 5 }
    ]), 
    announcementController.createAnnouncement
);

router.patch(
    '/:id', 
    upload.fields([
        { name: 'poster', maxCount: 1 },
        { name: 'attachments', maxCount: 5 }
    ]),
    announcementController.updateAnnouncement
);
router.delete('/:id', announcementController.deleteAnnouncement);

module.exports = router;
