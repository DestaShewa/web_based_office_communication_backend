const express = require('express');
const departmentController = require('./department.controller');
const { protect, restrictTo } = require('../../middlewares/auth.middleware');
const ROLES = require('../../constants/roles');

const router = express.Router();

// All department routes are protected
router.use(protect);

// Routes accessible by all authenticated users
router.get('/', departmentController.getAllDepartments);
router.get('/:id', departmentController.getDepartmentById);
router.get('/:id/members', departmentController.getDepartmentMembers);

// Admin only routes
router.use(restrictTo(ROLES.ADMIN));

router.post('/', departmentController.createDepartment);
router.patch('/:id', departmentController.updateDepartment);
router.patch('/:id/status', departmentController.changeDepartmentStatus);

module.exports = router;
