const Faculty = require('./faculty.model');
const Institute = require('../institutes/institute.model');
const { AuditLog, AUDIT_ACTIONS } = require('../audit/audit.model');

/**
 * Create a new faculty.
 */
const createFaculty = async (data, actor) => {
    // Verify institute exists
    const institute = await Institute.findOne({ customId: data.institute });
    if (!institute) {
        const error = new Error('Institute not found');
        error.statusCode = 404;
        throw error;
    }

    const faculty = await Faculty.create({
        name: data.name,
        abbreviation: data.abbreviation,
        description: data.description,
        institute: data.institute,
    });

    // Audit log
    await AuditLog.create({
        actor: actor.customId,
        action: AUDIT_ACTIONS.FACULTY_CREATED || 'FACULTY_CREATED',
        targetType: 'Faculty',
        targetId: faculty.customId,
        details: {
            name: faculty.name,
            abbreviation: faculty.abbreviation,
            institute: faculty.institute,
        },
        ipAddress: actor.ipAddress,
    });

    return faculty;
};

/**
 * Get all faculties, optionally filtered by institute.
 */
const getAllFaculties = async (query = {}) => {
    const filter = {};
    if (query.institute) filter.institute = query.institute;
    if (query.isActive !== undefined) filter.isActive = query.isActive;

    const faculties = await Faculty.find(filter)
        .populate({
            path: 'deanData',
            select: 'name email customId role',
        })
        .populate({
            path: 'instituteData',
            select: 'name abbreviation customId',
        })
        .sort({ createdAt: -1 });

    return faculties;
};

/**
 * Get a single faculty by customId.
 */
const getFacultyById = async (customId) => {
    const faculty = await Faculty.findOne({ customId })
        .populate({
            path: 'deanData',
            select: 'name email customId role',
        })
        .populate({
            path: 'instituteData',
            select: 'name abbreviation customId',
        })
        .populate({
            path: 'departmentsData',
            select: 'name abbreviation customId coordinator isActive',
        });

    if (!faculty) {
        const error = new Error('Faculty not found');
        error.statusCode = 404;
        throw error;
    }

    return faculty;
};

/**
 * Update a faculty by customId.
 */
const updateFaculty = async (customId, data, actor) => {
    const faculty = await Faculty.findOne({ customId });

    if (!faculty) {
        const error = new Error('Faculty not found');
        error.statusCode = 404;
        throw error;
    }

    // Track changes for audit
    const changes = {};

    if (data.name && data.name !== faculty.name) {
        changes.name = { from: faculty.name, to: data.name };
        faculty.name = data.name;
    }
    if (data.abbreviation && data.abbreviation !== faculty.abbreviation) {
        changes.abbreviation = { from: faculty.abbreviation, to: data.abbreviation };
        faculty.abbreviation = data.abbreviation;
    }
    if (data.description !== undefined) {
        faculty.description = data.description;
    }
    if (data.isActive !== undefined) {
        changes.isActive = { from: faculty.isActive, to: data.isActive };
        faculty.isActive = data.isActive;
    }

    await faculty.save();

    // Audit log
    await AuditLog.create({
        actor: actor.customId,
        action: AUDIT_ACTIONS.FACULTY_UPDATED || 'FACULTY_UPDATED',
        targetType: 'Faculty',
        targetId: faculty.customId,
        details: changes,
        ipAddress: actor.ipAddress,
    });

    return faculty;
};

/**
 * Assign a Dean to a faculty.
 */
const assignDean = async (facultyCustomId, deanCustomId, actor) => {
    const faculty = await Faculty.findOne({ customId: facultyCustomId });
    if (!faculty) {
        const error = new Error('Faculty not found');
        error.statusCode = 404;
        throw error;
    }

    const User = require('../users/user.model');
    const dean = await User.findOne({ customId: deanCustomId, role: 'dean' });
    if (!dean) {
        const error = new Error('Dean user not found or user does not have the dean role');
        error.statusCode = 404;
        throw error;
    }

    // Check if this Dean is already assigned to another faculty
    const existingFaculty = await Faculty.findOne({ dean: deanCustomId });
    if (existingFaculty && existingFaculty.customId !== facultyCustomId) {
        const error = new Error(
            `This Dean is already assigned to faculty: ${existingFaculty.name}`
        );
        error.statusCode = 400;
        throw error;
    }

    const previousDean = faculty.dean;
    faculty.dean = deanCustomId;
    await faculty.save();

    // Update the Dean's faculty reference
    dean.faculty = facultyCustomId;
    await dean.save();

    // Audit log
    await AuditLog.create({
        actor: actor.customId,
        action: AUDIT_ACTIONS.FACULTY_UPDATED || 'FACULTY_UPDATED',
        targetType: 'Faculty',
        targetId: faculty.customId,
        details: {
            action: 'DEAN_ASSIGNED',
            previousDean: previousDean || null,
            newDean: deanCustomId,
        },
        ipAddress: actor.ipAddress,
    });

    return faculty;
};

/**
 * Remove the Dean from a faculty.
 */
const removeDean = async (facultyCustomId, actor) => {
    const faculty = await Faculty.findOne({ customId: facultyCustomId });
    if (!faculty) {
        const error = new Error('Faculty not found');
        error.statusCode = 404;
        throw error;
    }

    if (!faculty.dean) {
        const error = new Error('This faculty does not have a Dean assigned');
        error.statusCode = 400;
        throw error;
    }

    const previousDean = faculty.dean;

    // Clear the Dean's faculty reference
    const User = require('../users/user.model');
    await User.updateOne(
        { customId: previousDean, role: 'dean' },
        { $set: { faculty: null } }
    );

    faculty.dean = null;
    await faculty.save();

    // Audit log
    await AuditLog.create({
        actor: actor.customId,
        action: AUDIT_ACTIONS.FACULTY_UPDATED || 'FACULTY_UPDATED',
        targetType: 'Faculty',
        targetId: faculty.customId,
        details: {
            action: 'DEAN_REMOVED',
            removedDean: previousDean,
        },
        ipAddress: actor.ipAddress,
    });

    return faculty;
};

/**
 * Toggle faculty active status (Soft Deactivate/Activate).
 */
const deleteFaculty = async (customId, actor) => {
    const faculty = await Faculty.findOne({ customId });
    if (!faculty) {
        const error = new Error('Faculty not found');
        error.statusCode = 404;
        throw error;
    }

    const newStatus = !faculty.isActive;
    faculty.isActive = newStatus;
    await faculty.save();

    // Audit log
    await AuditLog.create({
        actor: actor.customId,
        action: newStatus 
            ? (AUDIT_ACTIONS.FACULTY_ACTIVATED || 'FACULTY_ACTIVATED')
            : (AUDIT_ACTIONS.FACULTY_DEACTIVATED || 'FACULTY_DEACTIVATED'),
        targetType: 'Faculty',
        targetId: customId,
        details: { 
            name: faculty.name,
            status: newStatus ? 'Activated' : 'Deactivated'
        },
        ipAddress: actor.ipAddress,
    });

    return { 
        message: `Faculty ${newStatus ? 'activated' : 'deactivated'} successfully`,
        faculty 
    };
};

module.exports = {
    createFaculty,
    getAllFaculties,
    getFacultyById,
    updateFaculty,
    assignDean,
    removeDean,
    deleteFaculty,
};
