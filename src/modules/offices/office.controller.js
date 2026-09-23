const officeService = require('./office.service');
const catchAsync = require('../../utils/catchAsync');
const sendResponse = require('../../utils/apiResponse');

exports.createOffice = catchAsync(async (req, res) => {
    const office = await officeService.createOffice(req.body);
    sendResponse(res, 201, 'Office created successfully', office);
});

exports.getAllOffices = catchAsync(async (req, res) => {
    const offices = await officeService.getAllOffices(req.query);
    sendResponse(res, 200, 'Offices retrieved successfully', offices);
});

exports.getOffice = catchAsync(async (req, res) => {
    const office = await officeService.getOfficeById(req.params.id);
    sendResponse(res, 200, 'Office retrieved successfully', office);
});

exports.updateOffice = catchAsync(async (req, res) => {
    const office = await officeService.updateOffice(req.params.id, req.body);
    sendResponse(res, 200, 'Office updated successfully', office);
});

exports.deleteOffice = catchAsync(async (req, res) => {
    await officeService.deleteOffice(req.params.id);
    sendResponse(res, 200, 'Office deleted successfully');
});

exports.getOfficeMembers = catchAsync(async (req, res) => {
    const members = await officeService.getOfficeMembers(req.params.id);
    sendResponse(res, 200, 'Office members retrieved successfully', members);
});
