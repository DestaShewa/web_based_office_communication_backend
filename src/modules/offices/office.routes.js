const express = require('express');
const officeController = require('./office.controller');
const { protect, restrictTo } = require('../../middlewares/auth.middleware');

const router = express.Router();

// Publicly readable for authenticated users (needed for memo dropdowns etc)
router.use(protect);

router.get('/', officeController.getAllOffices);
router.get('/:id', officeController.getOffice);
router.get('/:id/members', officeController.getOfficeMembers);

// Admin-only management routes
router.use(restrictTo('admin'));

router.post('/', officeController.createOffice);
router.patch('/:id', officeController.updateOffice);
router.delete('/:id', officeController.deleteOffice);

module.exports = router;
