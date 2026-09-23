const express = require('express');
const configController = require('./system_config.controller');
const { protect, restrictTo } = require('../../middlewares/auth.middleware');
const ROLES = require('../../constants/roles');

const router = express.Router();

// ALL configuration routes are strictly for Admins
router.use(protect);
router.use(restrictTo(ROLES.ADMIN));

router.get('/', configController.getSettings);
router.patch('/', configController.updateSettings);

module.exports = router;
