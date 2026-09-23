const facultyService = require('./faculty.service');
const sendResponse = require('../../utils/apiResponse');

/**
 * @desc    Create a new faculty
 * @route   POST /api/v1/faculties
 * @access  Admin
 */
const createFaculty = async (req, res, next) => {
    try {
        const actor = { customId: req.user.customId, ipAddress: req.ip };
        const faculty = await facultyService.createFaculty(req.body, actor);
        sendResponse(res, 201, 'Faculty created successfully', faculty);
    } catch (err) {
        next(err);
    }
};

/**
 * @desc    Get all faculties
 * @route   GET /api/v1/faculties
 * @access  Admin, Director, Dean
 */
const getAllFaculties = async (req, res, next) => {
    try {
        const faculties = await facultyService.getAllFaculties(req.query);
        sendResponse(res, 200, 'Faculties retrieved successfully', faculties);
    } catch (err) {
        next(err);
    }
};

/**
 * @desc    Get a single faculty by customId
 * @route   GET /api/v1/faculties/:id
 * @access  Admin, Director, Dean
 */
const getFacultyById = async (req, res, next) => {
    try {
        const faculty = await facultyService.getFacultyById(req.params.id);
        sendResponse(res, 200, 'Faculty retrieved successfully', faculty);
    } catch (err) {
        next(err);
    }
};

/**
 * @desc    Update a faculty
 * @route   PATCH /api/v1/faculties/:id
 * @access  Admin
 */
const updateFaculty = async (req, res, next) => {
    try {
        const actor = { customId: req.user.customId, ipAddress: req.ip };
        const faculty = await facultyService.updateFaculty(req.params.id, req.body, actor);
        sendResponse(res, 200, 'Faculty updated successfully', faculty);
    } catch (err) {
        next(err);
    }
};

/**
 * @desc    Assign a Dean to a faculty
 * @route   PATCH /api/v1/faculties/:id/assign-dean
 * @access  Admin
 */
const assignDean = async (req, res, next) => {
    try {
        const actor = { customId: req.user.customId, ipAddress: req.ip };
        const { deanCustomId } = req.body;

        if (!deanCustomId) {
            return sendResponse(res, 400, 'deanCustomId is required');
        }

        const faculty = await facultyService.assignDean(req.params.id, deanCustomId, actor);
        sendResponse(res, 200, 'Dean assigned to faculty successfully', faculty);
    } catch (err) {
        next(err);
    }
};

/**
 * @desc    Remove the Dean from a faculty
 * @route   PATCH /api/v1/faculties/:id/remove-dean
 * @access  Admin
 */
const removeDean = async (req, res, next) => {
    try {
        const actor = { customId: req.user.customId, ipAddress: req.ip };
        const faculty = await facultyService.removeDean(req.params.id, actor);
        sendResponse(res, 200, 'Dean removed from faculty successfully', faculty);
    } catch (err) {
        next(err);
    }
};

/**
 * @desc    Delete a faculty
 * @route   DELETE /api/v1/faculties/:id
 * @access  Admin
 */
const deleteFaculty = async (req, res, next) => {
    try {
        const actor = { customId: req.user.customId, ipAddress: req.ip };
        const result = await facultyService.deleteFaculty(req.params.id, actor);
        sendResponse(res, 200, result.message);
    } catch (err) {
        next(err);
    }
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
