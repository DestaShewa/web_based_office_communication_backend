const express = require('express');
const facultyController = require('./faculty.controller');
const { protect, restrictTo } = require('../../middlewares/auth.middleware');
const ROLES = require('../../constants/roles');

const router = express.Router();

// All faculty routes are protected
router.use(protect);

// Routes accessible by all authenticated users
router.get('/', facultyController.getAllFaculties);
router.get(
    '/:id',
    restrictTo(ROLES.ADMIN, ROLES.DIRECTOR, ROLES.DEAN),
    facultyController.getFacultyById
);

// Admin-only routes (write)
router.post('/', restrictTo(ROLES.ADMIN), facultyController.createFaculty);
router.patch('/:id', restrictTo(ROLES.ADMIN), facultyController.updateFaculty);
router.patch('/:id/assign-dean', restrictTo(ROLES.ADMIN), facultyController.assignDean);
router.patch('/:id/remove-dean', restrictTo(ROLES.ADMIN), facultyController.removeDean);
router.delete('/:id', restrictTo(ROLES.ADMIN), facultyController.deleteFaculty);

module.exports = router;
