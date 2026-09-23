const reportService = require('./report.service');
const catchAsync = require('../../utils/catchAsync');
const sendResponse = require('../../utils/apiResponse');

exports.getOverview = catchAsync(async (req, res, next) => {
    let deptId = null;
    let facultyId = null;

    if (req.user.role === 'coordinator' || req.user.role === 'staff') {
        deptId = req.user.department;
    } else if (req.user.role === 'dean') {
        facultyId = req.user.faculty;
    }

    const overview = await reportService.getSystemOverview(deptId, facultyId);
    
    sendResponse(res, 200, 'Overview data fetched', overview);
});

exports.getTaskAnalytics = catchAsync(async (req, res, next) => {
    let deptId = req.query.departmentId || null;
    let facultyId = req.query.facultyId || null;
    
    // Auto-restrict based on role
    if (req.user.role === 'coordinator' || req.user.role === 'staff') {
        deptId = req.user.department;
        facultyId = null;
    } else if (req.user.role === 'dean') {
        facultyId = req.user.faculty;
        deptId = req.query.departmentId || null; // Dean can query specific depts in their faculty
    }

    const data = await reportService.getTaskAnalytics(deptId, facultyId);
    sendResponse(res, 200, 'Task analytics retrieved', data);
});

exports.getDepartmentPerformance = catchAsync(async (req, res, next) => {
    const deptId = req.params.deptId;
    const data = await reportService.getDepartmentPerformance(deptId);
    sendResponse(res, 200, 'Department performance retrieved', data);
});
