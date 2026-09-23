const express = require('express');
const reportController = require('./report.controller');
const { protect, restrictTo } = require('../../middlewares/auth.middleware');
const { attachScope } = require('../../middlewares/scope.middleware');
const ROLES = require('../../constants/roles');

const router = express.Router();

// 🚨 STRICTLY PROTECTED MODULE 🚨
// Only Deans, Coordinators, Directors, and Admins can access Analytics
router.use(protect);
router.use(attachScope);
// All analytics users (including Admin for general overview)
router.get('/overview', restrictTo(ROLES.DEAN, ROLES.COORDINATOR, ROLES.DIRECTOR, ROLES.ADMIN), reportController.getOverview);

// Task-specific analytics (Exclude Admin)
router.get('/tasks', restrictTo(ROLES.DEAN, ROLES.COORDINATOR, ROLES.DIRECTOR), reportController.getTaskAnalytics);

// Specific department performance (Exclude Admin)
router.get('/departments/:deptId', restrictTo(ROLES.DEAN, ROLES.COORDINATOR, ROLES.DIRECTOR), reportController.getDepartmentPerformance);

module.exports = router;
