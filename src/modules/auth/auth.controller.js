const authService = require('./auth.service');
const sendResponse = require('../../utils/apiResponse');
const { logAction } = require('../audit/audit.service');
const { AUDIT_ACTIONS } = require('../audit/audit.model');
const catchAsync = require('../../utils/catchAsync');
const AppError = require('../../utils/AppError');

const SystemConfig = require('../system_configs/system_config.model');

/**
 * @desc    Login user
 * @route   POST /api/v1/auth/login
 */
exports.login = catchAsync(async (req, res, next) => {
    const { email, password } = req.body;
    const user = await authService.login(email, password, req.ip);
    
    // Check maintenance mode
    const settings = await SystemConfig.getSettings();
    if (settings && settings.maintenanceMode && user.role !== 'admin') {
        return next(
            new AppError(
                'The system is currently undergoing maintenance. Only administrators can log in at this time.',
                503
            )
        );
    }

    await logAction({
        actor: user.customId,
        action: AUDIT_ACTIONS.USER_LOGGED_IN,
        targetType: 'Auth',
        targetId: user.customId,
        ipAddress: req.ip
    });

    authService.createSendToken(user, 200, res, 'Logged in successfully!', user.isPasswordWeak);
});

/**
 * @desc    Logout user
 * @route   POST /api/v1/auth/logout
 */
exports.logout = catchAsync(async (req, res, next) => {
    if (req.user) {
        await logAction({
            actor: req.user.customId,
            action: AUDIT_ACTIONS.USER_LOGGED_OUT,
            targetType: 'Auth',
            targetId: req.user.customId,
            ipAddress: req.ip
        });
    }

    res.cookie('jwt', 'loggedout', {
        expires: new Date(Date.now() + 10 * 1000),
        httpOnly: true,
    });
    sendResponse(res, 200, 'Logged out successfully!');
});

/**
 * @desc    Change password
 * @route   PATCH /api/v1/auth/change-password
 */
exports.changePassword = catchAsync(async (req, res, next) => {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
        return next(new AppError('Please provide current and new password.', 400));
    }

    await authService.changePassword(req.user.id, currentPassword, newPassword, req.ip);

    sendResponse(res, 200, 'Password changed successfully.', null);
});

/**
 * @desc    Request password reset (Public)
 * @route   POST /api/v1/auth/forgot-password
 */
exports.forgotPassword = catchAsync(async (req, res, next) => {
    const { email } = req.body;

    if (!email) {
        return next(new AppError('Please provide your email address.', 400));
    }

    await authService.requestPasswordReset(email);

    sendResponse(res, 200, 'If an account with that email exists, a 6-digit verification code has been sent. Please check your inbox.', null);
});

/**
 * @desc    Verify OTP for password reset (Public)
 * @route   POST /api/v1/auth/verify-reset-otp
 */
exports.verifyResetOtp = catchAsync(async (req, res, next) => {
    const { email, otp } = req.body;

    if (!email || !otp) {
        return next(new AppError('Please provide both your email and the 6-digit verification code.', 400));
    }

    await authService.verifyResetOtp(email, otp);

    sendResponse(res, 200, 'Verification successful. You can now set your new password.', null);
});

/**
 * @desc    Finalize password reset (Public)
 * @route   POST /api/v1/auth/reset-password
 */
exports.resetPassword = catchAsync(async (req, res, next) => {
    const { email, otp, password } = req.body;

    if (!email || !otp || !password) {
        return next(new AppError('Please provide all required fields (email, otp, and new password).', 400));
    }

    await authService.resetPassword(email, otp, password, req.ip);

    sendResponse(res, 200, 'Password has been reset successfully. You can now log in with your new credentials.', null);
});
