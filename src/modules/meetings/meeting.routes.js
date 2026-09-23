const express = require('express');
const meetingController = require('./meeting.controller');
const { protect, restrictTo } = require('../../middlewares/auth.middleware');
const { attachScope } = require('../../middlewares/scope.middleware');
const ROLES = require('../../constants/roles');

const router = express.Router();

// Protect all meeting routes
router.use(protect);
router.use(attachScope);

// My personal meetings
router.get('/me', meetingController.getMyMeetings);

// Department-level meetings (Coordinators, Deans, Directors)
router.get('/department/:deptId', restrictTo(ROLES.COORDINATOR, ROLES.DEAN, ROLES.DIRECTOR), meetingController.getDepartmentMeetings);

// Faculty-level meetings (Deans, Directors)
router.get('/faculty/:facultyId', restrictTo(ROLES.DEAN, ROLES.DIRECTOR), meetingController.getFacultyMeetings);

// Office-level meetings (Coordinators, Directors)
router.get('/office/:officeId', restrictTo(ROLES.COORDINATOR, ROLES.DIRECTOR), meetingController.getOfficeMeetings);

// Global overview (Institutional visibility for Directors/Admins)
router.get('/', restrictTo(ROLES.DIRECTOR, ROLES.ADMIN), meetingController.getAllMeetings);

// Core CRUD (Exclude Admin)
router.post('/', restrictTo(ROLES.COORDINATOR, ROLES.DEAN, ROLES.DIRECTOR, ROLES.STAFF), meetingController.scheduleMeeting);

// Updating Status (Exclude Admin)
router.patch('/:id/status', restrictTo(ROLES.COORDINATOR, ROLES.DEAN, ROLES.DIRECTOR, ROLES.STAFF), meetingController.updateMeetingStatus);

module.exports = router;
