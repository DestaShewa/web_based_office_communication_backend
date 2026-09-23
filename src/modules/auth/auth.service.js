const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const env = require('../../config/env.config');
const User = require('../users/user.model');
const AppError = require('../../utils/AppError');
const emailService = require('../../services/email.service');
const { logAction } = require('../audit/audit.service');
const { AUDIT_ACTIONS } = require('../audit/audit.model');

const { evaluatePasswordStrength } = require('../../utils/passwordStrength');

const FAILED_LOGIN_THRESHOLD = 3;
const SECURITY_ALERT_COOLDOWN_MINUTES = 30;

/**
 * Sign JWT Token
 */
const signToken = (id) => {
    return jwt.sign({ id }, env.JWT_SECRET, {
        expiresIn: env.JWT_EXPIRES_IN,
    });
};

/**
 * Create and send token in cookie
 */
const createSendToken = (user, statusCode, res, message, isPasswordWeak = false) => {
    const token = signToken(user.customId);

    // Cookie settings
    const cookieOptions = {
        expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days (simplified)
        httpOnly: true, // Prevent XSS theft
        secure: env.NODE_ENV === 'production',
        sameSite: 'lax', // Required for cross-origin but same-site cookies over HTTP
        signed: true, // Use cookie-secret
    };

    res.cookie('jwt', token, cookieOptions);

    // Remove password from output
    user.password = undefined;

    res.status(statusCode).json({
        status: 'success',
        message,
        token,
        requiresPasswordChange: user.isPasswordTemporary,
        isPasswordWeak,
        data: {
            user,
        },
    });
};


/**
 * Login user
 * Handles failed login tracking and security alert emails (Issue 6)
 */
const login = async (email, password, ipAddress) => {
    // 1. Check if email and password exist
    if (!email || !password) {
        throw new AppError('Please provide email and password!', 400);
    }

    // 2. Check if user exists & password is correct
    //    Select password, isActive, failedLoginAttempts and lastSecurityAlertSentAt
    const user = await User.findOne({ email })
        .populate('departmentData')
        .populate('facultyData')
        .populate('departmentsData')
        .select('+password +isActive +failedLoginAttempts +lastSecurityAlertSentAt +isPasswordTemporary');

    // 3. If user not found OR password wrong → log failed attempt
    if (!user || !(await user.correctPassword(password, user.password))) {
        // Only track attempts if the user account actually exists (correct email, wrong password)
        if (user) {
            user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;

            // Check if threshold exceeded and we haven't sent an alert recently
            if (user.failedLoginAttempts > FAILED_LOGIN_THRESHOLD) {
                const now = new Date();
                const cooldownMs = SECURITY_ALERT_COOLDOWN_MINUTES * 60 * 1000;
                const lastAlert = user.lastSecurityAlertSentAt;
                const cooldownExpired = !lastAlert || (now - lastAlert) > cooldownMs;

                if (cooldownExpired) {
                    user.lastSecurityAlertSentAt = now;
                    // Fire-and-forget email — do not await to keep login latency low
                    const { sendSecurityAlertEmail } = require('../../services/email.service');
                    sendSecurityAlertEmail(user).catch(() => {}); // Silent fail
                }
            }

            await user.save({ validateBeforeSave: false });
        }

        // Log the failed attempt in audit
        await logAction({
            actor: user ? user.customId : 'ANONYMOUS',
            action: AUDIT_ACTIONS.FAILED_LOGIN_ATTEMPT,
            targetType: 'Auth',
            targetId: email,
            details: {
                email,
                reason: user ? 'Incorrect password' : 'Email not found',
                attemptCount: user ? user.failedLoginAttempts : undefined,
            },
            ipAddress
        });

        throw new AppError('Incorrect email or password', 401);
    }

    // 4. Check if the account is still active
    if (!user.isActive) {
        throw new AppError(
            'Your account has been deactivated. Please contact your administrator.',
            403
        );
    }

    // 5. Check if the faculty is still active (if user belongs to one)
    if (user.facultyData && user.facultyData.isActive === false) {
        throw new AppError(
            'Access denied. Your faculty is currently deactivated by the administrator.',
            403
        );
    }

    // 6. Check if the department is still active (if user belongs to one)
    if (user.departmentData && user.departmentData.isActive === false) {
        throw new AppError(
            'Access denied. Your department is currently deactivated by the administrator.',
            403
        );
    }

    // 7. Successful login — evaluate password strength (to remind user if weak)
    const strength = evaluatePasswordStrength(password);
    user.isPasswordWeak = !strength.isStrong;

    // 8. Successful login — reset failed attempt counter and mark as logged in
    let needsSave = false;
    if (user.failedLoginAttempts > 0) {
        user.failedLoginAttempts = 0;
        user.lastSecurityAlertSentAt = undefined;
        needsSave = true;
    }
    
    if (!user.hasLoggedIn) {
        user.hasLoggedIn = true;
        needsSave = true;
    }

    if (needsSave) {
        await user.save({ validateBeforeSave: false });
    }

    return user;
};

/**
 * Change password — available to all authenticated users (Issue 4)
 */
const changePassword = async (userId, currentPassword, newPassword, ipAddress) => {
    // 1. Get user with password
    const user = await User.findById(userId).select('+password');
    if (!user) throw new AppError('User no longer exists.', 404);

    // 2. Check if current password is correct
    if (!(await user.correctPassword(currentPassword, user.password))) {
        throw new AppError('Current password is incorrect.', 401);
    }

    // 3. Update password (pre-save hook will hash it)
    user.password = newPassword;
    user.isPasswordTemporary = false; // Reset temporary flag on manual change
    await user.save();

    // 4. Audit Log
    await logAction({
        actor: user.customId,
        action: AUDIT_ACTIONS.PASSWORD_CHANGED,
        targetType: 'Auth',
        targetId: user.customId,
        ipAddress,
    });

    return user;
};

/**
 * Phase 1: Request password reset (Generates & Sends OTP)
 */
const requestPasswordReset = async (email) => {
    // 1. Find user by email
    const user = await User.findOne({ email });
    
    // Safety: If user not found, we still return success to prevent email enumeration
    if (!user) return;

    // 2. Generate a 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // 3. Hash OTP and set expiration (10 mins)
    const hashedOtp = crypto.createHash('sha256').update(otp).digest('hex');
    user.resetPasswordOtp = hashedOtp;
    user.resetPasswordOtpExpires = Date.now() + 10 * 60 * 1000;
    
    await user.save({ validateBeforeSave: false });

    // Developer convenience: Output OTP to server console in development mode
    if (env.NODE_ENV === 'development') {
        const logger = require('../../utils/logger');
        logger.info(`DEV MODE => Password Reset OTP for ${user.email}: ${otp}`);
    }

    // 4. Send the OTP via email
    await emailService.sendPasswordResetOtp(user, otp);
};

/**
 * Phase 2: Verify OTP
 * Just confirms the code is valid so frontend can proceed to password entry
 */
const verifyResetOtp = async (email, otp) => {
    const hashedOtp = crypto.createHash('sha256').update(otp).digest('hex');

    const user = await User.findOne({
        email,
        resetPasswordOtp: hashedOtp,
        resetPasswordOtpExpires: { $gt: Date.now() }
    });

    if (!user) {
        throw new AppError('Invalid or expired verification code. Please request a new one.', 400);
    }
    
    return true;
};

/**
 * Phase 3: Final Password Reset
 * Verifies OTP again (security) and sets new password
 */
const resetPassword = async (email, otp, newPassword, ipAddress) => {
    const hashedOtp = crypto.createHash('sha256').update(otp).digest('hex');

    const user = await User.findOne({
        email,
        resetPasswordOtp: hashedOtp,
        resetPasswordOtpExpires: { $gt: Date.now() }
    });

    if (!user) {
        throw new AppError('Invalid or expired verification session.', 400);
    }

    // Update password and clear OTP fields
    user.password = newPassword;
    user.isPasswordTemporary = false;
    user.resetPasswordOtp = undefined;
    user.resetPasswordOtpExpires = undefined;
    user.failedLoginAttempts = 0;
    
    await user.save();

    await logAction({
        actor: user.customId,
        action: AUDIT_ACTIONS.PASSWORD_RESET,
        targetType: 'Auth',
        targetId: user.customId,
        details: { method: 'Self-service OTP' },
        ipAddress,
    });

    return user;
};

module.exports = {
    createSendToken,
    login,
    changePassword,
    requestPasswordReset,
    verifyResetOtp,
    resetPassword,
};
