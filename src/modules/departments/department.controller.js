const departmentService = require('./department.service');
const sendResponse = require('../../utils/apiResponse');

/**
 * @desc    Create new department (Admin)
 * @route   POST /api/v1/departments
 */
const createDepartment = async (req, res, next) => {
    try {
        const department = await departmentService.createDepartment(req.body, req.user?.customId);
        sendResponse(res, 201, 'Department created successfully', { department });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Get all departments (All authenticated users)
 * @route   GET /api/v1/departments
 */
const getAllDepartments = async (req, res, next) => {
    try {
        const { limit, page, search, faculty } = req.query;
        const result = await departmentService.getAllDepartments(
            search,
            parseInt(limit) || 100,
            parseInt(page) || 1,
            faculty
        );
        // Issue 11: descriptive message for empty results
        const message = result.total === 0
            ? 'No departments found matching the given criteria.'
            : `Departments fetched successfully — ${result.total} found.`;
        sendResponse(res, 200, message, result);
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Get department by ID
 * @route   GET /api/v1/departments/:id
 */
const getDepartmentById = async (req, res, next) => {
    try {
        const department = await departmentService.getDepartmentById(req.params.id);
        sendResponse(res, 200, 'Department fetched successfully', { department });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Update department (Admin)
 * @route   PATCH /api/v1/departments/:id
 */
const updateDepartment = async (req, res, next) => {
    try {
        const department = await departmentService.updateDepartment(req.params.id, req.body, req.user?.customId);
        sendResponse(res, 200, 'Department updated successfully', { department });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Activate/Deactivate department (Admin)
 * @route   PATCH /api/v1/departments/:id/status
 */
const changeDepartmentStatus = async (req, res, next) => {
    try {
        const { isActive } = req.body;
        if (typeof isActive !== 'boolean') {
            return next(new AppError('Please provide a valid boolean isActive status.', 400));
        }

        const department = await departmentService.changeDepartmentStatus(req.params.id, isActive, req.user?.customId);
        sendResponse(res, 200, `Department ${isActive ? 'activated' : 'deactivated'} successfully`, { department });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Get all members of a department
 * @route   GET /api/v1/departments/:id/members
 */
const getDepartmentMembers = async (req, res, next) => {
    try {
        const result = await departmentService.getDepartmentMembers(req.params.id);
        sendResponse(res, 200, 'Department members fetched successfully', result);
    } catch (error) {
        next(error);
    }
};

module.exports = {
    createDepartment,
    getAllDepartments,
    getDepartmentById,
    getDepartmentMembers,
    updateDepartment,
    changeDepartmentStatus,
};
