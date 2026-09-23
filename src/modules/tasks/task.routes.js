const express = require('express');
const taskController = require('./task.controller');
const { protect, restrictTo } = require('../../middlewares/auth.middleware');
const { attachScope } = require('../../middlewares/scope.middleware');
const ROLES = require('../../constants/roles');

const router = express.Router();

// All task routes are protected and scoped
router.use(protect);
router.use(attachScope);

// ─── Static named routes MUST come before param routes (/:id) ──────────────

// Any authenticated user
router.get('/me', taskController.getMyTasks);

// Coordinator, Dean, Director (Assigners) — named routes before /:id
router.get('/assigned-by-me', restrictTo(ROLES.COORDINATOR, ROLES.DEAN, ROLES.DIRECTOR, ROLES.ADMIN), taskController.getAssignedByMeTasks);
router.get('/members',        restrictTo(ROLES.COORDINATOR, ROLES.DEAN, ROLES.DIRECTOR), taskController.getMembersTasks);

// Scoped listing routes
router.get('/department/:deptId', restrictTo(ROLES.COORDINATOR, ROLES.ADMIN), taskController.getDepartmentTasks);
router.get('/faculty/:facultyId', restrictTo(ROLES.DEAN, ROLES.ADMIN), taskController.getFacultyTasks);
router.get('/office/:officeId', restrictTo(ROLES.COORDINATOR, ROLES.ADMIN), taskController.getOfficeTasks);

// Director only (org-wide listing)
router.get('/', restrictTo(ROLES.DIRECTOR, ROLES.ADMIN), taskController.getAllTasks);

// Creation
router.post('/', restrictTo(ROLES.COORDINATOR, ROLES.DEAN, ROLES.DIRECTOR), taskController.createTask);

// ─── Param routes (:id) come after all named routes ────────────────────────
router.get('/:id',             taskController.getTaskById);
router.delete('/:id',          taskController.deleteTask);
router.patch('/:id/status',    taskController.updateTaskStatus);
router.patch('/:id/reassign',  restrictTo(ROLES.COORDINATOR, ROLES.DEAN, ROLES.DIRECTOR), taskController.reassignTask);
router.patch('/:id/intervention', restrictTo(ROLES.ADMIN, ROLES.DIRECTOR), taskController.updateTaskIntervention);
router.post('/:id/comments',   taskController.addComment);
router.get('/:id/comments',    taskController.getTaskComments);
router.delete('/comments/:commentId', taskController.deleteComment);

module.exports = router;
