const ROLES = require('../constants/roles');

/**
 * Middleware to attach organizational scope based on user role
 * Attach `req.scope = { faculty, department, departments }` for use in services
 */
const attachScope = (req, res, next) => {
    if (!req.user) {
        return next();
    }

    const { role, faculty, department, departments } = req.user;
    req.scope = {};

    if (role === ROLES.DEAN) {
        req.scope.faculty = faculty;
    } else if (role === ROLES.COORDINATOR) {
        req.scope.department = department;
    } else if (role === ROLES.STAFF) {
        req.scope.department = department;
        req.scope.departments = departments || [];
    }

    next();
};

module.exports = { attachScope };
