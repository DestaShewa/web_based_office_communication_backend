const instituteService = require('./institute.service');
const sendResponse = require('../../utils/apiResponse');

/**
 * @desc    Create a new institute
 * @route   POST /api/v1/institutes
 * @access  Admin
 */
const createInstitute = async (req, res, next) => {
    try {
        const actor = { customId: req.user.customId, ipAddress: req.ip };
        const institute = await instituteService.createInstitute(req.body, actor);
        sendResponse(res, 201, 'Institute created successfully', institute);
    } catch (err) {
        next(err);
    }
};

/**
 * @desc    Get all institutes
 * @route   GET /api/v1/institutes
 * @access  Admin, Director
 */
const getAllInstitutes = async (req, res, next) => {
    try {
        const institutes = await instituteService.getAllInstitutes(req.query);
        sendResponse(res, 200, 'Institutes retrieved successfully', institutes);
    } catch (err) {
        next(err);
    }
};

/**
 * @desc    Get a single institute by customId
 * @route   GET /api/v1/institutes/:id
 * @access  Admin, Director
 */
const getInstituteById = async (req, res, next) => {
    try {
        const institute = await instituteService.getInstituteById(req.params.id);
        sendResponse(res, 200, 'Institute retrieved successfully', institute);
    } catch (err) {
        next(err);
    }
};

/**
 * @desc    Update an institute
 * @route   PATCH /api/v1/institutes/:id
 * @access  Admin
 */
const updateInstitute = async (req, res, next) => {
    try {
        const actor = { customId: req.user.customId, ipAddress: req.ip };
        const institute = await instituteService.updateInstitute(req.params.id, req.body, actor);
        sendResponse(res, 200, 'Institute updated successfully', institute);
    } catch (err) {
        next(err);
    }
};

module.exports = {
    createInstitute,
    getAllInstitutes,
    getInstituteById,
    updateInstitute
};
