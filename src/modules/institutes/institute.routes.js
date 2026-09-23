const express = require('express');
const instituteController = require('./institute.controller');
const { protect, restrictTo } = require('../../middlewares/auth.middleware');
const ROLES = require('../../constants/roles');

const router = express.Router();

// All institute routes are protected
router.use(protect);

// Routes accessible by all authenticated users (read)
router.get('/', instituteController.getAllInstitutes);
router.get('/:id', instituteController.getInstituteById);

// Admin-only routes (write)
router.post('/', restrictTo(ROLES.ADMIN), instituteController.createInstitute);
router.patch('/:id', restrictTo(ROLES.ADMIN), instituteController.updateInstitute);

module.exports = router;
