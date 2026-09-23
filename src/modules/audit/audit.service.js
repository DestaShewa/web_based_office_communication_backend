const { AuditLog } = require('./audit.model');
const { resolveId } = require('../../utils/helpers');

/**
 * Log a system action.
 * Called from other services (user, task) after key operations.
 * Uses a try/catch so that an audit failure never breaks the main operation.
 */
const logAction = async ({ actor, action, targetType, targetId, details, ipAddress }) => {
    try {
        const resolvedActor = await resolveId(actor, 'User');
        await AuditLog.create({ actor: resolvedActor, action, targetType, targetId, details, ipAddress });
    } catch (err) {
        // Log silently — audit errors must never disrupt the user-facing flow
        const logger = require('../../utils/logger');
        logger.error(`Audit log failed: ${err.message}`);
    }
};

/**
 * Fetch audit logs with optional filters (for Admin monitoring).
 * Supports: actor, action, targetType, from/to date range, and search.
 */
const getAuditLogs = async (filters = {}, limit = 50, page = 1) => {
    const skip = (page - 1) * limit;
    const query = {};

    if (filters.actor)      query.actor      = await resolveId(filters.actor, 'User');
    if (filters.action)     query.action     = filters.action;
    if (filters.targetType) query.targetType = filters.targetType;

    // Smart Search: Partial or Exact-match
    if (filters.search) {
        const isExact = filters.search.startsWith('"') && filters.search.endsWith('"');
        const searchTerm = isExact ? filters.search.slice(1, -1) : filters.search;
        
        // Use regex for partial, or exact string for "quoted" terms
        const searchRegex = isExact ? new RegExp(`^${searchTerm}$`, 'i') : new RegExp(searchTerm, 'i');

        query.$or = [
            { targetId: { $regex: searchRegex } },
            { ipAddress: { $regex: searchRegex } },
            { action: { $regex: searchRegex } }
        ];
    }

    // Date range filter
    if (filters.from || filters.to) {
        query.createdAt = {};
        if (filters.from) query.createdAt.$gte = new Date(filters.from);
        if (filters.to)   query.createdAt.$lte = new Date(filters.to);
    }

    const logs = await AuditLog.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('actorData', 'name email role customId');

    const total = await AuditLog.countDocuments(query);

    return { logs, total, page, limit };
};

module.exports = { logAction, getAuditLogs };
