const User = require('./user.model');
const Department = require('../departments/department.model'); // Ensure model is registered
const AppError = require('../../utils/AppError');
const bcrypt = require('bcryptjs');
const { logAction, } = require('../audit/audit.service');
const { AUDIT_ACTIONS } = require('../audit/audit.model');
const { resolveId, getIdentifierQuery } = require('../../utils/helpers');
const ROLES = require('../../constants/roles');

/**
 * Helper: detect which fields actually changed between old and new data
 * Returns an array of changed field names. Empty array = no real change.
 */
const detectChanges = (oldData, newData) => {
    return Object.keys(newData).filter(key => {
        const oldVal = String(oldData[key] ?? '');
        const newVal = String(newData[key] ?? '');
        return oldVal !== newVal;
    });
};

/**
 * Get user by ID with populated department
 */
const getUserById = async (id) => {
    const user = await User.findOne(getIdentifierQuery(id))
        .populate('departmentData')
        .populate('facultyData')
        .populate('departmentsData')
        .populate('officeData');
    if (!user) {
        throw new AppError('No user found with that ID', 404);
    }
    return user;
};

/**
 * Get all users for directory (paginated)
 */
/**
 * Get all users for directory (paginated)
 * Applies RBAC filtering if a requestingUser is provided
 */
const getAllUsers = async (filters = {}, limit = 50, page = 1, requestingUser = null) => {
    const skip = (page - 1) * limit;
    const query = {};

    if (filters.role) query.role = filters.role;
    if (filters.department) query.department = await resolveId(filters.department, 'Department');
    if (filters.faculty) query.faculty = await resolveId(filters.faculty, 'Faculty');
    if (filters.office) query.office = filters.office;
    if (filters.excludeUser) {
        const isObjectId = /^[0-9a-fA-F]{24}$/.test(filters.excludeUser);
        if (isObjectId) {
            query._id = { $ne: filters.excludeUser };
        } else {
            query.customId = { $ne: filters.excludeUser };
        }
    }
    
    // Search by name, email, or customId
    if (filters.search) {
        const isExact = filters.search.startsWith('"') && filters.search.endsWith('"');
        const searchTerm = isExact ? filters.search.slice(1, -1) : filters.search;
        const searchRegex = isExact ? new RegExp(`^${searchTerm}$`, 'i') : new RegExp(searchTerm, 'i');

        // Allow searching with '@' prefix for usernames
        const searchTermForUsername = searchTerm.startsWith('@') ? searchTerm.slice(1) : searchTerm;
        const searchRegexForUsername = isExact ? new RegExp(`^${searchTermForUsername}$`, 'i') : new RegExp(searchTermForUsername, 'i');

        query.$or = [
            { name: { $regex: searchRegex } },
            { email: { $regex: searchRegex } },
            { customId: { $regex: searchRegex } },
            { username: { $regex: searchRegexForUsername } }
        ];
    }

    // ── Unified RBAC Visibility Engine ──────────────────────────────
    let rbacCondition = null;

    // A. Task Assignment Scope (Strict Filtering)
    if (filters.purpose === 'task_assignment') {
        rbacCondition = { role: { $ne: ROLES.ADMIN } };

        if (requestingUser.role === ROLES.DEAN) {
            rbacCondition.faculty = requestingUser.faculty;
        } else if (requestingUser.role === ROLES.COORDINATOR && requestingUser.office) {
            rbacCondition.office = requestingUser.office;
        } else if (requestingUser.role === ROLES.COORDINATOR) {
            const deptIds = [requestingUser.department, ...(requestingUser.departments || [])].filter(Boolean);
            rbacCondition.$or = [
                { department: { $in: deptIds } },
                { departments: { $elemMatch: { $in: deptIds } } }
            ];
        } else if (requestingUser.role === ROLES.DIRECTOR) {
             // Director has broad scope — no extra condition beyond != ADMIN
        } else if (requestingUser.role === ROLES.STAFF) {
             const deptIds = [requestingUser.department, ...(requestingUser.departments || [])].filter(Boolean);
             rbacCondition.$or = [
                { department: { $in: deptIds } },
                { departments: { $elemMatch: { $in: deptIds } } }
             ];
        }
    }

    // B. Messaging Directory Scope (Tiered Visibility)
    else if (filters.purpose === 'messaging') {
        if (requestingUser.role === ROLES.ADMIN) {
            // Admin sees high levels
            rbacCondition = { role: { $in: [ROLES.ADMIN, ROLES.DIRECTOR, ROLES.DEAN] } };
        } else if (requestingUser.role === ROLES.DIRECTOR) {
            // Director sees everyone (Institutional Oversight)
            rbacCondition = {};
        } else if (requestingUser.role === ROLES.DEAN) {
            // Deans see top levels + their own faculty
            rbacCondition = {
                $or: [
                    { role: { $in: [ROLES.ADMIN, ROLES.DIRECTOR, ROLES.DEAN] } },
                    { faculty: requestingUser.faculty, role: { $in: [ROLES.COORDINATOR, ROLES.STAFF] } }
                ]
            };
        } else if (requestingUser.role === ROLES.COORDINATOR) {
            // Coordinators see Director + faculty heads + their own department staff
            const deptIds = [requestingUser.department, ...(requestingUser.departments || [])].filter(Boolean);
            rbacCondition = {
                $or: [
                    { role: ROLES.DIRECTOR },
                    { department: { $in: deptIds }, role: ROLES.STAFF },
                    { departments: { $elemMatch: { $in: deptIds } }, role: ROLES.STAFF },
                    { faculty: requestingUser.faculty, role: { $in: [ROLES.DEAN, ROLES.COORDINATOR] } },
                    { office: requestingUser.office, role: ROLES.STAFF }
                ]
            };
        } else if (requestingUser.role === ROLES.STAFF) {
            // Staff see Director + coordinators + faculty dean + fellow department staff
            const deptIds = [requestingUser.department, ...(requestingUser.departments || [])].filter(Boolean);
            rbacCondition = {
                $or: [
                    { role: ROLES.DIRECTOR },
                    { department: { $in: deptIds }, role: { $in: [ROLES.COORDINATOR, ROLES.STAFF] } },
                    { departments: { $elemMatch: { $in: deptIds } }, role: { $in: [ROLES.COORDINATOR, ROLES.STAFF] } },
                    { faculty: requestingUser.faculty, role: ROLES.DEAN },
                    { office: requestingUser.office, role: { $in: [ROLES.COORDINATOR, ROLES.STAFF] } }
                ]
            };
        }
    }

    // C. General Directory Request (Only if authorized)
    else {
        // Admin and Director have full view, others limited by faculty
        if (requestingUser.role !== ROLES.ADMIN && requestingUser.role !== ROLES.DIRECTOR) {
            rbacCondition = { faculty: requestingUser.faculty };
        }
    }

    // Merge RBAC into Query
    if (rbacCondition) {
        if (Object.keys(query).length > 0) {
            const existingQuery = { ...query };
            for (let key in query) delete query[key];
            query.$and = [existingQuery, rbacCondition];
        } else {
            Object.assign(query, rbacCondition);
        }
    }

    const users = await User.find(query)
        .populate('departmentData', 'name customId abbreviation')
        .select('+isActive')
        .sort('name')
        .skip(skip)
        .limit(limit);

    const total = await User.countDocuments(query);

    return {
        users,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
    };
};

/**
 * Update user profile (self — name/email only)
 */
const updateUser = async (id, updateBody, ipAddress) => {
    // Filter out restricted fields
    const filteredBody = filterObj(updateBody, 'name', 'email', 'username', 'bio', 'phoneNumber', 'status', 'profilePhoto');

    const user = await User.findOne(getIdentifierQuery(id));
    if (!user) throw new AppError('No user found with that ID', 404);

    const oldData = user.toObject();

    // Issue 8: Only update & log if something actually changed
    const changedFields = detectChanges(oldData, filteredBody);
    if (changedFields.length === 0) {
        return { user, changedFields: [] };
    }

    Object.assign(user, filteredBody);
    await user.save();

    // Broadcast profile update to all users
    const socketUtil = require('../../utils/socket');
    socketUtil.broadcast('profile_updated', {
        userId: user.customId,
        updates: filteredBody
    });

    await logAction({
        actor: user.customId,
        action: AUDIT_ACTIONS.USER_UPDATED,
        targetType: 'User',
        targetId: user.customId,
        details: { changedFields, before: oldData, after: filteredBody },
        ipAddress,
    });

    return { user, changedFields };
};

/**
 * Update user status
 */
const updateStatus = async (id, status) => {
    const updatedUser = await User.findOneAndUpdate(
        getIdentifierQuery(id),
        { status },
        { new: true, runValidators: true }
    );

    // Broadcast status update to all users
    const socketUtil = require('../../utils/socket');
    socketUtil.broadcast('user_mood_updated', {
        userId: updatedUser.customId,
        status: status,
    });

    return updatedUser;
};

/**
 * Helper to filter objects
 */
const filterObj = (obj, ...allowedFields) => {
    const newObj = {};
    Object.keys(obj).forEach((el) => {
        if (allowedFields.includes(el)) newObj[el] = obj[el];
    });
    return newObj;
};

const createUser = async (userData, actorId, ipAddress) => {
    // Force system-generated password (Issue: Remove manual assignment)
    const generatedPassword = Math.random().toString(36).slice(-6); // 6 characters
    userData.password = generatedPassword;
    userData.isPasswordTemporary = true;

    // Resolve department customId if provided (returns customId string)
    if (userData.department) {
        userData.department = await resolveId(userData.department, 'Department');
    }
    if (userData.faculty) {
        userData.faculty = await resolveId(userData.faculty, 'Faculty');
    }
    if (userData.departments && Array.isArray(userData.departments)) {
        userData.departments = await Promise.all(
            userData.departments.map(id => resolveId(id, 'Department'))
        );
    }

    // Validation: 1 Coordinator per Department, 1 Dean per Faculty
    if (userData.role === 'coordinator' && userData.department) {
        const existingCoord = await User.findOne({ role: 'coordinator', department: userData.department, isActive: true });
        if (existingCoord) throw new AppError('This department already has an active Coordinator.', 400);
    }
    if (userData.role === 'dean' && userData.faculty) {
        const existingDean = await User.findOne({ role: 'dean', faculty: userData.faculty, isActive: true });
        if (existingDean) throw new AppError('This faculty already has an active Dean.', 400);
    }

    const newUser = await User.create(userData);

    await logAction({
        actor: await resolveId(actorId, 'User'),
        action: AUDIT_ACTIONS.USER_CREATED,
        targetType: 'User',
        targetId: newUser.customId,
        details: { name: newUser.name, role: newUser.role, isPasswordTemporary: newUser.isPasswordTemporary },
        ipAddress,
    });

    // If password was generated, send welcome email
    if (generatedPassword) {
        const { sendWelcomeEmail } = require('../../services/email.service');
        sendWelcomeEmail(newUser, generatedPassword).catch(() => {}); // Silent fail
    }

    return newUser;
};

/**
 * Update user role (Admin only)
 */
const updateUserRole = async (id, role, actorId, ipAddress) => {
    const user = await User.findOne(getIdentifierQuery(id)).select('+isActive');
    if (!user) throw new AppError('No user found with that ID', 404);

    // Restriction: Cannot change role of a deactivated user
    if (!user.isActive) {
        throw new AppError('Cannot change the role of a deactivated user. Reactivate the account first.', 403);
    }

    // Issue 8: Skip if no actual change
    if (user.role === role) {
        throw new AppError(`User already has the role '${role}'. No change made.`, 400);
    }

    // Validation: 1 Coordinator per Department, 1 Dean per Faculty
    if (role === 'coordinator' && user.department) {
        const existingCoord = await User.findOne({ role: 'coordinator', department: user.department, isActive: true, _id: { $ne: user._id } });
        if (existingCoord) throw new AppError('This department already has an active Coordinator.', 400);
    }
    if (role === 'dean' && user.faculty) {
        const existingDean = await User.findOne({ role: 'dean', faculty: user.faculty, isActive: true, _id: { $ne: user._id } });
        if (existingDean) throw new AppError('This faculty already has an active Dean.', 400);
    }

    // Safeguard: Prevent last admin from changing their own role to something else
    if (user.role === ROLES.ADMIN && role !== ROLES.ADMIN) {
        const activeAdmins = await User.countDocuments({ role: ROLES.ADMIN, isActive: true });
        if (activeAdmins <= 1) {
            throw new AppError('Cannot change the role of the last active administrator. The system must have at least one active admin.', 403);
        }
    }

    const oldRole = user.role;
    user.role = role;
    await user.save();

    await logAction({
        actor: actorId,
        action: AUDIT_ACTIONS.USER_ROLE_UPDATED,
        targetType: 'User',
        targetId: user.customId,
        details: { from: oldRole, to: role },
        ipAddress,
    });

    return user;
};

/**
 * Update user info (Admin only)
 * Handles password hashing separately to trigger the pre-save bcrypt hook.
 */
const updateUserById = async (id, updateData, actorId, ipAddress) => {
    const { ...otherFields } = updateData;

    // Strip direct customId modification attempts (security guard — Issue 2 principle)
    delete otherFields.customId;

    // Resolve department customId if provided
    if (otherFields.department) {
        otherFields.department = await resolveId(otherFields.department, 'Department');
    }
    if (otherFields.faculty) {
        otherFields.faculty = await resolveId(otherFields.faculty, 'Faculty');
    }
    if (otherFields.departments && Array.isArray(otherFields.departments)) {
        otherFields.departments = await Promise.all(
            otherFields.departments.map(id => resolveId(id, 'Department'))
        );
    }

    const user = await User.findOne(getIdentifierQuery(id)).select('+isActive');
    if (!user) throw new AppError('No user found with that ID', 404);

    const oldData = user.toObject();

    // Safeguard: Prevent last active administrator from being deactivated or losing admin role
    const newRole = otherFields.role || user.role;
    const newIsActive = otherFields.isActive !== undefined ? otherFields.isActive : user.isActive;

    if (user.role === ROLES.ADMIN && (newRole !== ROLES.ADMIN || newIsActive === false)) {
        const activeAdmins = await User.countDocuments({ role: ROLES.ADMIN, isActive: true });
        if (activeAdmins <= 1) {
            throw new AppError('Cannot deactivate or change the role of the last active administrator. The system must have at least one active admin.', 403);
        }
    }

    // Restriction: Cannot change role of a deactivated user
    if (otherFields.role && !user.isActive) {
        throw new AppError('Cannot change the role of a deactivated user. Reactivate the account first.', 403);
    }

    // Security Restriction: Admins can only edit email until the user logs in for the first time
    if (otherFields.email && otherFields.email !== user.email && user.hasLoggedIn) {
        throw new AppError('The user has already activated their account. For security reasons, their email address can no longer be modified by administrators.', 403);
    }

    // Validation: 1 Coordinator per Department, 1 Dean per Faculty
    if (newIsActive) {
        const targetDept = otherFields.department !== undefined ? otherFields.department : user.department;
        const targetFaculty = otherFields.faculty !== undefined ? otherFields.faculty : user.faculty;

        if (newRole === 'coordinator' && targetDept) {
            const existingCoord = await User.findOne({ role: 'coordinator', department: targetDept, isActive: true, _id: { $ne: user._id } });
            if (existingCoord) throw new AppError('This department already has an active Coordinator.', 400);
        }
        if (newRole === 'dean' && targetFaculty) {
            const existingDean = await User.findOne({ role: 'dean', faculty: targetFaculty, isActive: true, _id: { $ne: user._id } });
            if (existingDean) throw new AppError('This faculty already has an active Dean.', 400);
        }
    }

    // Issue 8: Detect what actually changed before applying
    const changedFields = detectChanges(oldData, otherFields);

    if (changedFields.length === 0) {
        throw new AppError('No changes detected. The provided values are identical to the current data.', 400);
    }

    // Apply updates
    Object.assign(user, otherFields);

    // Manual password assignment removed for security (Issue: Admin Backend Review)

    await user.save();

    // Broadcast profile update to all users
    const socketUtil = require('../../utils/socket');
    socketUtil.broadcast('profile_updated', {
        userId: user.customId,
        updates: otherFields
    });

    const action = AUDIT_ACTIONS.USER_UPDATED;

    await logAction({
        actor: actorId,
        action: action,
        targetType: 'User',
        targetId: user.customId,
        details: { changedFields, before: oldData, after: otherFields },
        ipAddress,
    });

    user.password = undefined; // strip from response

    return { user, changedFields, passwordChanged: false };
};

/**
 * Reset user password (Admin only) - Issue: Secure Password Management
 * Generates a temporary password and sends it via email.
 */
const resetUserPassword = async (id, actorId, ipAddress) => {
    const user = await User.findOne(getIdentifierQuery(id));
    if (!user) throw new AppError('No user found with that ID', 404);

    const generatedPassword = Math.random().toString(36).slice(-6);
    user.password = generatedPassword;
    user.isPasswordTemporary = true;
    user.failedLoginAttempts = 0; // Also reset failed attempts
    await user.save();

    // Send email
    const { sendWelcomeEmail } = require('../../services/email.service');
    sendWelcomeEmail(user, generatedPassword).catch(() => {});

    await logAction({
        actor: actorId,
        action: AUDIT_ACTIONS.PASSWORD_RESET_BY_ADMIN,
        targetType: 'User',
        targetId: user.customId,
        details: { method: 'System Generated' },
        ipAddress,
    });

    return user;
};

/**
 * Deactivate user account (Admin only) — Issue 7: sends email notification
 */
const deactivateUser = async (id, actorId, ipAddress) => {
    const user = await User.findOne(getIdentifierQuery(id)).select('+isActive');
    if (!user) throw new AppError('No user found with that ID', 404);

    // Issue 8: Skip if already inactive
    if (user.isActive === false) {
        throw new AppError('User account is already deactivated.', 400);
    }

    // Safeguard 1: Prevent self-deactivation
    const actor = await User.findOne(getIdentifierQuery(actorId));
    if (user._id.toString() === actor._id.toString()) {
        throw new AppError('You cannot deactivate your own account. Please contact another administrator.', 403);
    }

    // Safeguard 2: Prevent deactivating the last administrator
    if (user.role === ROLES.ADMIN) {
        const activeAdmins = await User.countDocuments({ role: ROLES.ADMIN, isActive: true });
        if (activeAdmins <= 1) {
            throw new AppError('Cannot deactivate the last active administrator. The system must have at least one active admin.', 403);
        }
    }

    user.isActive = false;
    await user.save();

    // Issue 7: Send deactivation email (fire-and-forget, must not block response)
    const { sendDeactivationEmail } = require('../../services/email.service');
    sendDeactivationEmail(user).catch(() => {}); // Silent fail

    await logAction({
        actor: actorId,
        action: AUDIT_ACTIONS.USER_DEACTIVATED,
        targetType: 'User',
        targetId: user.customId,
        ipAddress,
    });

    return user;
};

/**
 * Activate user account (Admin only)
 */
const activateUser = async (id, actorId, ipAddress) => {
    const user = await User.findOne(getIdentifierQuery(id)).select('+isActive');
    if (!user) throw new AppError('No user found with that ID', 404);

    // Issue 8: Skip if already active
    if (user.isActive === true) {
        throw new AppError('User account is already active.', 400);
    }

    user.isActive = true;
    await user.save();

    await logAction({
        actor: actorId,
        action: AUDIT_ACTIONS.USER_ACTIVATED,
        targetType: 'User',
        targetId: user.customId,
        ipAddress,
    });

    return user;
};

/**
 * Permanently delete a user from the system (Admin only) — Issue 3
 * This is a hard delete — use with extreme caution.
 */
const deleteUserPermanently = async (id, actorId, ipAddress) => {
    const user = await User.findOne(getIdentifierQuery(id)).select('+isActive');
    if (!user) throw new AppError('No user found with that ID', 404);

    // Prevent deleting the last active admin
    if (user.role === ROLES.ADMIN) {
        const activeAdmins = await User.countDocuments({ role: ROLES.ADMIN, isActive: true });
        if (activeAdmins <= 1) {
            throw new AppError('Cannot permanently delete the last active administrator.', 403);
        }
    }

    // Prevent self-deletion
    const actor = await User.findOne(getIdentifierQuery(actorId));
    if (user._id.toString() === actor._id.toString()) {
        throw new AppError('You cannot permanently delete your own account.', 403);
    }

    const deletedInfo = { customId: user.customId, name: user.name, email: user.email, role: user.role };
    await User.findOneAndDelete(getIdentifierQuery(id));

    await logAction({
        actor: actorId,
        action: AUDIT_ACTIONS.USER_DELETED,
        targetType: 'User',
        targetId: deletedInfo.customId,
        details: deletedInfo,
        ipAddress,
    });

    return deletedInfo;
};

/**
 * Search users by username (or name) dynamically for mentions
 */
const searchUsers = async (searchQuery = '', limit = 10) => {
    if (!searchQuery || searchQuery.length < 1) {
        return [];
    }

    // Match starting from beginning for fast index lookup
    const searchRegex = new RegExp(`^${searchQuery}`, 'i');
    
    const users = await User.find({
        $or: [
            { username: { $regex: searchRegex } },
            { name: { $regex: searchRegex } }
        ],
        isActive: true
    })
    .select('name username profilePhoto customId role email bio phoneNumber status')
    .sort('username')
    .limit(limit);

    return users;
};

/**
 * Request email change (User only)
 * Generates OTP and sends to NEW email
 */
const requestEmailChange = async (userId, newEmail) => {
    const user = await User.findOne(getIdentifierQuery(userId));
    if (!user) throw new AppError('User not found', 404);

    // 1. Validate new email is not already taken
    const existingUser = await User.findOne({ email: newEmail });
    if (existingUser) throw new AppError('This email is already registered to another account.', 400);

    // 3. Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const crypto = require('crypto');
    const hashedOtp = crypto.createHash('sha256').update(otp).digest('hex');

    // 4. Store in temp fields using findOneAndUpdate to bypass save hooks
    await User.findOneAndUpdate(getIdentifierQuery(userId), {
        tempEmail: newEmail,
        emailChangeOtp: hashedOtp,
        emailChangeOtpExpires: Date.now() + 10 * 60 * 1000 // 10 mins
    });

    // 5. Send OTP to NEW email
    const { sendEmailChangeOtp } = require('../../services/email.service');
    await sendEmailChangeOtp(user, otp, newEmail);

    return true;
};

/**
 * Verify email change (User only)
 */
const verifyEmailChange = async (userId, otp, ipAddress) => {
    const crypto = require('crypto');
    const hashedOtp = crypto.createHash('sha256').update(String(otp)).digest('hex');

    // Fetch user with security fields
    const user = await User.findOne(getIdentifierQuery(userId)).select('+emailChangeOtp +emailChangeOtpExpires');

    if (!user) {
        throw new AppError('User not found. Please log in again.', 404);
    }

    // 1. Check if OTP exists and is not expired
    if (!user.emailChangeOtp || !user.emailChangeOtpExpires || user.emailChangeOtpExpires < Date.now()) {
        throw new AppError('Verification code has expired. Please request a new one.', 400);
    }

    // 2. Check if OTP matches (before atomic update)
    if (user.emailChangeOtp !== hashedOtp) {
        // Fallback: If OTP doesn't match but the email IS already the tempEmail, it likely succeeded in a concurrent request
        if (user.tempEmail && user.email === user.tempEmail) {
            return user;
        }
        throw new AppError('Invalid verification code.', 400);
    }

    if (!user.tempEmail) {
        throw new AppError('No pending email change request found. Please try again.', 400);
    }

    const oldEmail = user.email;
    const newEmail = user.tempEmail;

    // 3. Atomic update to finalize email change
    const updatedUser = await User.findOneAndUpdate(
        {
            ...getIdentifierQuery(userId),
            emailChangeOtp: hashedOtp // Extra safety: ensure OTP hasn't changed
        },
        {
            $set: {
                email: newEmail,
                tempEmail: undefined,
                emailChangeOtp: undefined,
                emailChangeOtpExpires: undefined
            }
        },
        { new: true }
    );

    if (!updatedUser) {
        // If update failed (possibly already updated), check if it's already successful
        const finalizedUser = await User.findOne(getIdentifierQuery(userId));
        if (finalizedUser && finalizedUser.email === newEmail) {
            return finalizedUser;
        }
        throw new AppError('Could not finalize email change. The request may have expired.', 400);
    }

    // 4. Audit Log
    await logAction({
        actor: updatedUser.customId,
        action: AUDIT_ACTIONS.USER_UPDATED,
        targetType: 'User',
        targetId: updatedUser.customId,
        details: { field: 'email', from: oldEmail, to: newEmail, method: 'Self-service OTP' },
        ipAddress,
    });

    // 5. Notify user of successful change
    const { sendEmailChangeNotification } = require('../../services/email.service');
    sendEmailChangeNotification(updatedUser, oldEmail).catch(() => {});

    return updatedUser;
};

module.exports = {
    getUserById,
    getAllUsers,
    updateUser: updateUserById, 
    updateStatus,
    createUser,
    updateUserRole,
    updateUserById,
    deactivateUser,
    activateUser,
    deleteUserPermanently,
    resetUserPassword,
    searchUsers,
    requestEmailChange,
    verifyEmailChange,
};
