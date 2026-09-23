const userService = require('./user.service');
const sendResponse = require('../../utils/apiResponse');
const catchAsync = require('../../utils/catchAsync');
const AppError = require('../../utils/AppError');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

/**
 * @desc    Get current user profile
 * @route   GET /api/v1/users/me
 */
const getMe = async (req, res, next) => {
    try {
        const user = await userService.getUserById(req.user.id);
        sendResponse(res, 200, 'Profile fetched successfully', { user });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Update current user profile (name/email only)
 * @route   PATCH /api/v1/users/update-me
 */
const updateMe = async (req, res, next) => {
    try {
        const { user, changedFields } = await userService.updateUser(req.user.id, req.body, req.ip);
        const message = changedFields.length > 0
            ? `Profile updated successfully: ${changedFields.join(', ')}`
            : 'No changes detected — profile is already up to date.';
        sendResponse(res, 200, message, { user });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Update username
 * @route   PATCH /api/v1/users/update-username
 */
const updateUsername = async (req, res, next) => {
    try {
        const { username } = req.body;
        if (!username) return next(new AppError('Please provide a username', 400));
        
        const user = await require('./user.model').findOne({ _id: req.user.id });
        if (!user) throw new AppError('User not found', 404);
        
        user.username = username;
        await user.save();
        
        sendResponse(res, 200, 'Username updated successfully', { user });
    } catch (error) {
        if (error.code === 11000) {
            return next(new AppError('Username is already taken.', 400));
        }
        next(error);
    }
};

/**
 * @desc    Upload profile photo
 * @route   POST /api/v1/users/upload-photo
 */
const uploadProfilePhoto = async (req, res, next) => {
    try {
        if (!req.file) {
            return next(new AppError('Please upload a photo', 400));
        }
        
        const fileName = `processed_${req.file.filename.split('.')[0]}.jpg`;
        const outputPath = path.join(__dirname, '../../../uploads/profiles', fileName);
        const photoUrl = `/uploads/profiles/${fileName}`;
        
        // 1. Process image: Resize to 500x500, compress to JPEG
        await sharp(req.file.path)
            .resize(500, 500, {
                fit: 'cover',
                position: 'center'
            })
            .jpeg({ quality: 90 })
            .toFile(outputPath);
            
        // 2. Remove the original uploaded file (temp)
        try {
            await fs.promises.unlink(req.file.path);
        } catch (err) {
            // Silently fail if file already gone
        }

        const user = await require('./user.model').findOne({ _id: req.user.id });
        if (!user) throw new AppError('User not found', 404);
        
        // 3. Delete old photo if it exists
        if (user.profilePhoto) {
            const oldPhotoPath = path.join(__dirname, '../../../', user.profilePhoto);
            try {
                if (fs.existsSync(oldPhotoPath)) {
                    await fs.promises.unlink(oldPhotoPath);
                }
            } catch (err) {
                // Silently fail if old file operation fails
            }
        }
        
        user.profilePhoto = photoUrl;
        await user.save();
        
        // Broadcast profile update to all users
        const socketUtil = require('../../utils/socket');
        socketUtil.broadcast('profile_updated', {
            userId: user.customId,
            updates: { profilePhoto: photoUrl }
        });
        
        sendResponse(res, 200, 'Profile photo uploaded successfully', { user });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Update user availability status
 * @route   PATCH /api/v1/users/status
 */
const updateStatus = async (req, res, next) => {
    try {
        const { status } = req.body;
        const updatedUser = await userService.updateStatus(req.user.id, status);
        sendResponse(res, 200, `Status updated to "${status}" successfully`, { user: updatedUser });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Get all users (Directory)
 * @route   GET /api/v1/users
 */
const getAllUsers = async (req, res, next) => {
    try {
        const { limit, page, role, department, faculty, search, purpose } = req.query;
        const filters = {};
        if (role) filters.role = role;
        if (department) filters.department = department;
        if (faculty) filters.faculty = faculty;
        if (search) filters.search = search;
        if (purpose) filters.purpose = purpose;
        if (purpose === 'messaging' || purpose === 'task_assignment') {
            filters.excludeUser = req.user.id || req.user._id;
        }
        
        const result = await userService.getAllUsers(
            filters, 
            parseInt(limit) || 50, 
            parseInt(page) || 1,
            req.user
        );

        // Issue 11: descriptive empty result message
        const message = result.total === 0
            ? 'No users found matching the given criteria.'
            : `User directory fetched — ${result.total} user(s) found.`;

        sendResponse(res, 200, message, result);
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Create new user (Admin)
 * @route   POST /api/v1/users
 */
const createUser = async (req, res, next) => {
    try {
        const newUser = await userService.createUser(req.body, req.user.id, req.ip);
        sendResponse(res, 201, 'User created successfully. A temporary password has been generated and sent to the user via email.', { user: newUser });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Update user role (Admin)
 * @route   PATCH /api/v1/users/:id/role
 */
const updateUserRole = async (req, res, next) => {
    try {
        const { role } = req.body;
        const updatedUser = await userService.updateUserRole(req.params.id, role, req.user.id, req.ip);
        sendResponse(res, 200, `User role updated to "${role}" successfully`, { user: updatedUser });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Update user info (Admin)
 * @route   PATCH /api/v1/users/:id
 */
const updateUserById = async (req, res, next) => {
    try {
const { user, changedFields } = await userService.updateUserById(req.params.id, req.body, req.user.id, req.ip);

        // Issue 5: descriptive message listing what changed
        const parts = [];
        if (changedFields.length > 0) parts.push(`fields updated: ${changedFields.join(', ')}`);
        const message = parts.length > 0
            ? `User updated successfully (${parts.join('; ')})`
            : 'User updated successfully';

        sendResponse(res, 200, message, { user });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Deactivate user account (Admin) - soft delete
 * @route   DELETE /api/v1/users/:id
 */
const deactivateUser = async (req, res, next) => {
    try {
        await userService.deactivateUser(req.params.id, req.user.id, req.ip);
        sendResponse(res, 200, 'User account deactivated successfully. A notification email has been sent to the user.', null);
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Activate user account (Admin)
 * @route   PATCH /api/v1/users/:id/activate
 */
const activateUser = async (req, res, next) => {
    try {
        const user = await userService.activateUser(req.params.id, req.user.id, req.ip);
        sendResponse(res, 200, 'User account activated successfully', { user });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Search users by username or name dynamically
 * @route   GET /api/v1/users/search
 */
const searchUsers = async (req, res, next) => {
    try {
        const { q, limit } = req.query;
        const users = await userService.searchUsers(q, parseInt(limit) || 10);
        sendResponse(res, 200, 'Users fetched successfully', { users });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Permanently delete a user (Admin) - hard delete
 * @route   DELETE /api/v1/users/:id/permanent
 */
const deleteUserPermanently = async (req, res, next) => {
    try {
        const deletedInfo = await userService.deleteUserPermanently(req.params.id, req.user.id, req.ip);
        sendResponse(res, 200, `User "${deletedInfo.name}" (${deletedInfo.customId}) has been permanently deleted from the system.`, { deleted: deletedInfo });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Reset user password (Admin)
 * @route   POST /api/v1/users/:id/reset-password
 */
const resetPassword = async (req, res, next) => {
    try {
        const updatedUser = await userService.resetUserPassword(req.params.id, req.user.id, req.ip);
        sendResponse(res, 200, 'User password has been reset successfully. A new temporary password has been sent to the user via email.', { user: updatedUser });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Request email change
 * @route   POST /api/v1/users/request-email-change
 */
const requestEmailChange = async (req, res, next) => {
    try {
        const { newEmail } = req.body;
        if (!newEmail) return next(new AppError('Please provide the new email address.', 400));

        await userService.requestEmailChange(req.user.id, newEmail);

        sendResponse(res, 200, 'A 6-digit verification code has been sent to your new email address. Please enter it to confirm the change.', null);
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Verify email change OTP
 * @route   POST /api/v1/users/verify-email-change
 */
const verifyEmailChange = async (req, res, next) => {
    try {
        const { otp } = req.body;
        if (!otp) return next(new AppError('Please provide the 6-digit verification code.', 400));

        const user = await userService.verifyEmailChange(req.user.id, otp, req.ip);

        sendResponse(res, 200, 'Your email address has been successfully updated.', { user });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getMe,
    updateMe,
    updateStatus,
    getAllUsers,
    createUser,
    updateUserRole,
    updateUserById,
    deactivateUser,
    activateUser,
    deleteUserPermanently,
    updateUsername,
    uploadProfilePhoto,
    searchUsers,
    requestEmailChange,
    verifyEmailChange,
};
