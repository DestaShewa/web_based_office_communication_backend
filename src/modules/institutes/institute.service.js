const Institute = require('./institute.model');
const { AuditLog, AUDIT_ACTIONS } = require('../audit/audit.model');

/**
 * Create a new institute.
 */
const createInstitute = async (data, actor) => {
    const institute = await Institute.create({
        name: data.name,
        abbreviation: data.abbreviation,
        description: data.description,
    });

    // Audit log
    await AuditLog.create({
        actor: actor.customId,
        action: AUDIT_ACTIONS.INSTITUTE_CREATED || 'INSTITUTE_CREATED',
        targetType: 'Institute',
        targetId: institute.customId,
        details: { name: institute.name, abbreviation: institute.abbreviation },
        ipAddress: actor.ipAddress,
    });

    return institute;
};

/**
 * Get all institutes.
 */
const getAllInstitutes = async (query = {}) => {
    const filter = {};

    const institutes = await Institute.find(filter)
        .populate('facultiesData')
        .sort({ createdAt: -1 });

    return institutes;
};

/**
 * Get a single institute by customId.
 */
const getInstituteById = async (customId) => {
    const institute = await Institute.findOne({ customId })
        .populate('facultiesData');

    if (!institute) {
        const error = new Error('Institute not found');
        error.statusCode = 404;
        throw error;
    }

    return institute;
};

/**
 * Update an institute by customId.
 */
const updateInstitute = async (customId, data, actor) => {
    const institute = await Institute.findOne({ customId });

    if (!institute) {
        const error = new Error('Institute not found');
        error.statusCode = 404;
        throw error;
    }

    // Track changes for audit
    const changes = {};
    if (data.name && data.name !== institute.name) {
        changes.name = { from: institute.name, to: data.name };
        institute.name = data.name;
    }
    if (data.abbreviation && data.abbreviation !== institute.abbreviation) {
        changes.abbreviation = { from: institute.abbreviation, to: data.abbreviation };
        institute.abbreviation = data.abbreviation;
    }
    if (data.description !== undefined) {
        institute.description = data.description;
    }

    await institute.save();

    // Audit log
    await AuditLog.create({
        actor: actor.customId,
        action: AUDIT_ACTIONS.INSTITUTE_UPDATED || 'INSTITUTE_UPDATED',
        targetType: 'Institute',
        targetId: institute.customId,
        details: changes,
        ipAddress: actor.ipAddress,
    });

    return institute;
};

module.exports = {
    createInstitute,
    getAllInstitutes,
    getInstituteById,
    updateInstitute
};
