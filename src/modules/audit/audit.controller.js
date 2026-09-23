const { getAuditLogs } = require('./audit.service');
const sendResponse = require('../../utils/apiResponse');
const AppError = require('../../utils/AppError');

/**
 * @desc    Get audit logs with optional filters
 * @route   GET /api/v1/audit
 * @access  Admin only
 * @query   actor, action, targetType, from, to, search, limit, page
 */
const getAuditLogsController = async (req, res, next) => {
    try {
        const { actor, action, targetType, from, to, search, limit, page } = req.query;

        // Issue 10: Validate date format for 'from' and 'to'
        if (from && isNaN(new Date(from).getTime())) {
            return next(new AppError(`Invalid date format for 'from': "${from}". Use a valid ISO 8601 date (e.g., 2024-01-01 or 2024-01-01T00:00:00Z).`, 400));
        }
        if (to && isNaN(new Date(to).getTime())) {
            return next(new AppError(`Invalid date format for 'to': "${to}". Use a valid ISO 8601 date (e.g., 2024-12-31 or 2024-12-31T23:59:59Z).`, 400));
        }

        // Sanity check: from must be before to
        if (from && to && new Date(from) > new Date(to)) {
            return next(new AppError(`Date range error: 'from' (${from}) cannot be later than 'to' (${to}).`, 400));
        }

        const result = await getAuditLogs(
            { actor, action, targetType, from, to, search }, // Issue 9: pass 'search' param
            parseInt(limit) || 50,
            parseInt(page) || 1
        );

        // Issue 11: Descriptive message when no results found
        const message = result.total === 0
            ? 'No audit logs found matching the given criteria.'
            : `Audit logs fetched successfully — ${result.total} record(s) found.`;

        sendResponse(res, 200, message, result);
    } catch (error) {
        next(error);
    }
};

module.exports = { getAuditLogsController };
