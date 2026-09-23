const SystemConfig = require('../modules/system_configs/system_config.model');
const AppError = require('../utils/AppError');
const jwt = require('jsonwebtoken');
const env = require('../config/env.config');
const User = require('../modules/users/user.model');
const { promisify } = require('util');

/**
 * Middleware to check if the system is in maintenance mode.
 * Allows admins to bypass.
 */
const maintenanceMode = async (req, res, next) => {
    try {
        const settings = await SystemConfig.getSettings();

        if (!settings.maintenanceMode) {
            return next();
        }

        // Allow access to login route so admins can authenticate
        if (req.originalUrl.includes('/auth/login')) {
            return next();
        }

        // Check for admin bypass
        let token;
        if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
            token = req.headers.authorization.split(' ')[1];
        } else if (req.signedCookies && req.signedCookies.jwt) {
            token = req.signedCookies.jwt;
        }

        if (token) {
            try {
                const decoded = await promisify(jwt.verify)(token, env.JWT_SECRET);
                const currentUser = await User.findOne({ customId: decoded.id });
                
                if (currentUser && currentUser.role === 'admin') {
                    req.user = currentUser; // Populate req.user for later use
                    return next();
                }
            } catch (err) {
                // Ignore token errors, we'll just block as non-admin
            }
        }

        // Otherwise, block access
        return next(
            new AppError(
                'The system is currently undergoing maintenance. Please try again later.',
                503
            )
        );
    } catch (error) {
        next(error);
    }
};

module.exports = maintenanceMode;
