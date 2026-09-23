const express = require('express');
const authController = require('./auth.controller');

const { protect } = require('../../middlewares/auth.middleware');

const router = express.Router();

router.post('/login', authController.login);
router.post('/logout', protect, authController.logout);
router.patch('/change-password', protect, authController.changePassword);
router.post('/forgot-password', authController.forgotPassword);
router.post('/verify-reset-otp', authController.verifyResetOtp);
router.post('/reset-password', authController.resetPassword);

module.exports = router;
