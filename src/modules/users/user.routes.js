const express = require('express');
const userController = require('./user.controller');
const { protect, restrictTo } = require('../../middlewares/auth.middleware');
const ROLES = require('../../constants/roles');

const { uploadProfilePhoto } = require('../../config/multer.config');

const router = express.Router();

// All user routes are protected
router.use(protect);

router.get('/me', userController.getMe);
router.patch('/update-me', userController.updateMe);
router.patch('/update-username', userController.updateUsername);
router.post('/upload-photo', uploadProfilePhoto, userController.uploadProfilePhoto);
router.patch('/status', userController.updateStatus);
router.get('/search', userController.searchUsers);
router.post('/request-email-change', userController.requestEmailChange);
router.post('/verify-email-change', userController.verifyEmailChange);
router.get('/', userController.getAllUsers);

// --- Admin Only Routes ---
router.use(restrictTo(ROLES.ADMIN));

router.post('/', userController.createUser);
router.patch('/:id/role', userController.updateUserRole);
router.patch('/:id/activate', userController.activateUser);
router.patch('/:id', userController.updateUserById);
router.delete('/:id/permanent', userController.deleteUserPermanently); // Hard delete
router.delete('/:id', userController.deactivateUser);                  // Soft deactivate

module.exports = router;
