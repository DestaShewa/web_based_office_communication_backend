const Department = require('./department.model');
const AppError = require('../../utils/AppError');
const { resolveId, getIdentifierQuery } = require('../../utils/helpers');

const { AuditLog, AUDIT_ACTIONS } = require('../audit/audit.model');

/**
 * Helper: detect which fields actually changed between old and new data
 */
const detectChanges = (oldData, newData) => {
    return Object.keys(newData).filter(key => {
        const oldVal = String(oldData[key] ?? '');
        const newVal = String(newData[key] ?? '');
        return oldVal !== newVal;
    });
};

/**
 * Create a new department
 */
const createDepartment = async (departmentData, actorId) => {
    // Validate that the faculty exists before creating department
    const Faculty = require('../faculties/faculty.model');
    const facultyExists = await Faculty.findOne({ customId: departmentData.faculty });
    if (!facultyExists) {
        throw new AppError(`Cannot create department: no faculty found with customId "${departmentData.faculty}".`, 404);
    }

    const department = await Department.create(departmentData);

    // Audit Logging
    if (actorId) {
        await AuditLog.create({
            actor: actorId,
            action: AUDIT_ACTIONS.DEPARTMENT_CREATED,
            targetType: 'Department',
            targetId: department.customId,
            details: { name: department.name }
        });
    }

    return department;
};

/**
 * Get all departments
 */
const getAllDepartments = async (search, limit = 100, page = 1, faculty = null) => {
    const skip = (page - 1) * limit;
    const query = {};

    if (faculty) {
        query.faculty = faculty;
    }

    if (search) {
        const isExact = search.startsWith('"') && search.endsWith('"');
        const searchTerm = isExact ? search.slice(1, -1) : search;
        const searchRegex = isExact ? new RegExp(`^${searchTerm}$`, 'i') : new RegExp(searchTerm, 'i');

        query.$or = [
            { name: { $regex: searchRegex } },
            { abbreviation: { $regex: searchRegex } },
            { customId: { $regex: searchRegex } }
        ];
    }

    const departments = await Department.find(query)
        .populate('coordinatorData', 'name email role customId')
        .populate('facultyData', 'name abbreviation customId')
        .sort('name')
        .skip(skip)
        .limit(limit);

    const total = await Department.countDocuments(query);

    return {
        departments,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
    };
};

/**
 * Get department by ID
 */
const getDepartmentById = async (id) => {
    const department = await Department.findOne(getIdentifierQuery(id))
        .populate('coordinatorData', 'name email role customId')
        .populate('facultyData', 'name abbreviation customId');
    if (!department) {
        throw new AppError('No department found with that ID', 404);
    }
    return department;
};

/**
 * Update department — Issue 1: Validate head assignment, Issue 2: strip customId, Issue 8: no-change guard
 */
const updateDepartment = async (id, updateData, actorId) => {
    const query = getIdentifierQuery(id);
    
    // Issue 2: Prevent direct overwrite of auto-generated customId
    delete updateData.customId;

    // Get doc for updates and hooks
    const department = await Department.findOne(query);
    if (!department) {
        throw new AppError('No department found with that ID', 404);
    }

    // Issue 1: If 'coordinator' is being set, validate the user exists and is a coordinator in this department
    if (updateData.coordinator !== undefined && updateData.coordinator !== null && updateData.coordinator !== '') {
        const User = require('../users/user.model');
        const coordinatorUser = await User.findOne({ customId: updateData.coordinator });

        if (!coordinatorUser) {
            throw new AppError(
                `Cannot assign coordinator: no user found with customId "${updateData.coordinator}". The user must exist before being assigned.`,
                400
            );
        }

        if (coordinatorUser.role !== 'coordinator') {
            throw new AppError(
                `Cannot assign coordinator: user "${coordinatorUser.name}" has role "${coordinatorUser.role}". Only users with the role "coordinator" can be assigned as department coordinator.`,
                400
            );
        }

        if (coordinatorUser.department !== department.customId) {
            throw new AppError(
                `Cannot assign coordinator: user "${coordinatorUser.name}" belongs to department "${coordinatorUser.department}", not "${department.customId}". A department coordinator must be a member of that department.`,
                400
            );
        }
    }

    // Capture old state for audit
    const oldDepartmentData = department.toObject();

    // Issue 8: Only update & log if something actually changed
    const changedFields = detectChanges(oldDepartmentData, updateData);
    if (changedFields.length === 0) {
        throw new AppError('No changes detected. The provided values are identical to the current data.', 400);
    }

    // Apply updates
    Object.assign(department, updateData);
    await department.save();

    // Audit Logging — only if there are real changes
    if (actorId) {
        await AuditLog.create({
            actor: actorId,
            action: AUDIT_ACTIONS.DEPARTMENT_UPDATED,
            targetType: 'Department',
            targetId: department.customId,
            details: {
                changedFields,
                before: oldDepartmentData,
                after: updateData
            }
        });
    }

    return department;
};

/**
 * Change department status (Activate/Deactivate)
 */
const changeDepartmentStatus = async (id, isActive, actorId) => {
    const query = getIdentifierQuery(id);
    const department = await Department.findOne(query);

    if (!department) throw new AppError('No department found with that ID', 404);

    const oldState = department.isActive;
    if (oldState === isActive) {
        throw new AppError(`Department is already ${isActive ? 'active' : 'inactive'}`, 400);
    }

    department.isActive = isActive;
    await department.save();

    // Audit Logging
    if (actorId) {
        await AuditLog.create({
            actor: actorId,
            action: AUDIT_ACTIONS.DEPARTMENT_UPDATED,
            targetType: 'Department',
            targetId: department.customId,
            details: { name: department.name, previousState: oldState, newState: isActive }
        });
    }

    return department;
};

/**
 * Get all members of a department
 * Includes:
 *   1. All users directly assigned to this department (staff + coordinator)
 *   2. The Faculty Dean — resolved from Faculty.dean field (most authoritative source)
 */
const getDepartmentMembers = async (id) => {
    const dept = await Department.findOne(getIdentifierQuery(id)).select('customId name faculty');
    if (!dept) throw new AppError('No department found with that ID', 404);

    const User = require('../users/user.model');
    const Faculty = require('../faculties/faculty.model');

    // Step 1: Get all direct department members (staff + coordinator)
    // Check both primary 'department' field and 'departments' array
    const directMembers = await User.find({ 
        $and: [
            { role: { $nin: ['admin', 'director'] } },
            {
                $or: [
                    { department: dept.customId },
                    { departments: dept.customId }
                ]
            }
        ]
    })
        .select('name username profilePhoto customId role department departments faculty status')
        .sort('role name');

    // Step 2: Resolve faculty dean via Faculty.dean field (most authoritative)
    let deanMember = null;
    if (dept.faculty) {
        const faculty = await Faculty.findOne({ customId: dept.faculty }).select('dean');
        if (faculty?.dean) {
            // Check if dean is already in directMembers (edge case: dean also in dept)
            const alreadyIncluded = directMembers.some(m => m.customId === faculty.dean);
            if (!alreadyIncluded) {
                deanMember = await User.findOne({ customId: faculty.dean })
                    .select('name username profilePhoto customId role department faculty status');
            }
        }
    }

    const members = deanMember ? [...directMembers, deanMember] : directMembers;

    return { department: dept, members, total: members.length };
};

module.exports = {
    createDepartment,
    getAllDepartments,
    getDepartmentById,
    getDepartmentMembers,
    updateDepartment,
    changeDepartmentStatus,
};
