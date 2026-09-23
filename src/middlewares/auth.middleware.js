const { promisify } = require('util');
const jwt = require('jsonwebtoken');
const env = require('../config/env.config');
const User = require('../modules/users/user.model');
const AppError = require('../utils/AppError');

/**
 * Protect middleware - Verify user is logged in
 */
const protect = async (req, res, next) => {
    try {
        let token;

        // 1. Get token from Header or Cookie
        if (
            req.headers.authorization &&
            req.headers.authorization.startsWith('Bearer')
        ) {
            token = req.headers.authorization.split(' ')[1];
        } else if (req.signedCookies.jwt) {
            token = req.signedCookies.jwt;
        } else if (req.query.token) {
            token = req.query.token;
        }

        if (!token) {
            return next(
                new AppError('You are not logged in! Please log in to get access.', 401)
            );
        }

        // 2. Verify token
        const decoded = await promisify(jwt.verify)(token, env.JWT_SECRET);

        // 3. Check if user still exists and their account is active
        const currentUser = await User.findOne({ customId: decoded.id }).select('+isActive');
        if (!currentUser || !currentUser.isActive) {
            return next(
                new AppError(
                    'The user belonging to this token no longer exists or has been deactivated.',
                    401
                )
            );
        }

        // 4. Grant access to protected route
        req.user = currentUser;
        next();
    } catch (error) {
        next(new AppError('Invalid token. Please log in again!', 401));
    }
};

/**
 * RestrictTo middleware - RBAC
 */
const restrictTo = (...roles) => {
    return (req, res, next) => {
        // roles is an array ['admin', 'director', 'dean', 'coordinator', 'staff']
        if (!roles.includes(req.user.role)) {
            const { logAction } = require('../modules/audit/audit.service');
            const { AUDIT_ACTIONS } = require('../modules/audit/audit.model');
            
            logAction({
                actor: req.user.customId,
                action: AUDIT_ACTIONS.UNAUTHORIZED_ACCESS_ATTEMPT,
                targetType: 'Auth',
                targetId: req.originalUrl,
                details: { role: req.user.role, requiredRoles: roles },
                ipAddress: req.ip
            });

            return next(
                new AppError('You do not have permission to perform this action', 403)
            );
        }
        next();
    };
};

/**
 * Middleware for Socket.io authentication
 */
const verifySocketToken = async (socket, next) => {
    try {
        let token;

        // 1. Get token from Handshake (query, auth header, or cookies)
        if (socket.handshake.auth && socket.handshake.auth.token) {
            token = socket.handshake.auth.token;
        } else if (socket.handshake.query && socket.handshake.query.token) {
            token = socket.handshake.query.token;
        } else if (socket.handshake.headers.cookie) {
            const cookie = require('cookie');
            const cookies = cookie.parse(socket.handshake.headers.cookie);
            if (cookies.jwt) token = cookies.jwt;
        }

        if (!token) {
            const logger = require('../utils/logger');
            logger.debug('Socket Auth Error: No token found in handshake');
            return next(new AppError('Unauthorized - No token provided', 401));
        }

        // 2. Unsign token if it's a signed cookie (starts with s:)
        if (token.startsWith('s:')) {
            const signature = require('cookie-signature');
            const unsignedToken = signature.unsign(token.slice(2), env.COOKIE_SECRET);
            if (!unsignedToken) {
                return next(new AppError('Unauthorized - Invalid cookie signature', 401));
            }
            token = unsignedToken;
        }

        // 3. Verify token
        const decoded = await promisify(jwt.verify)(token, env.JWT_SECRET);
        // 4. Verify user exists and is active
        const currentUser = await User.findOne({ customId: decoded.id }).select('+isActive');
        if (!currentUser || !currentUser.isActive) {
            return next(new AppError('User no longer exists or has been deactivated', 401));
        }

        socket.user = currentUser;
        next();
    } catch (error) {
        return next(new AppError('Unauthorized - Invalid token', 401));
    }
};

module.exports = {
    protect,
    restrictTo,
    verifySocketToken,
};
