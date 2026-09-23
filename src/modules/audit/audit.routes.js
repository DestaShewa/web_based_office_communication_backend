const express = require('express');
const { getAuditLogsController } = require('./audit.controller');
const { protect, restrictTo } = require('../../middlewares/auth.middleware');
const ROLES = require('../../constants/roles');

const router = express.Router();

// Audit logs are strictly Admin-only
router.use(protect);
router.use(restrictTo(ROLES.ADMIN));

router.get('/', getAuditLogsController);

module.exports = router;
