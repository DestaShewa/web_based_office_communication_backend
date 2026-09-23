const mongoose = require('mongoose');
const { resolveId } = require('../../utils/helpers');
const Task = require('../tasks/task.model');
const User = require('../users/user.model');
const Meeting = require('../meetings/meeting.model');
const Department = require('../departments/department.model');
const Faculty = require('../faculties/faculty.model');

/**
 * Get system-wide basic overview
 */
exports.getSystemOverview = async (deptId = null, facultyId = null) => {
    const matchStage = {};
    if (deptId) {
        matchStage.department = await resolveId(deptId, 'Department');
    }
    if (facultyId) {
        matchStage.faculty = await resolveId(facultyId, 'Faculty');
    }

    const userQuery = { ...matchStage, isActive: { $ne: false } };

    const [totalUsers, activeTasks, upcomingMeetings, totalDepartments, activeDepartments, activeFaculties, userRoleStats] = await Promise.all([
        User.countDocuments(userQuery),
        Task.countDocuments({ ...matchStage, status: { $ne: 'completed' } }),
        Meeting.countDocuments({ ...matchStage, status: 'scheduled', date: { $gte: new Date() } }),
        Department.countDocuments(matchStage),
        Department.countDocuments({ ...matchStage, isActive: true }),
        Faculty.countDocuments({ isActive: true }),
        User.aggregate([
            { $match: userQuery },
            { $group: { _id: '$role', count: { $sum: 1 } } }
        ])
    ]);

    const roleBreakdown = {};
    userRoleStats.forEach(stat => {
        roleBreakdown[stat._id] = stat.count;
    });

    return { totalUsers, activeTasks, upcomingMeetings, totalDepartments, activeDepartments, activeFaculties, roleBreakdown };
};


/**
 * Advanced Task Analytics
 */
exports.getTaskAnalytics = async (deptId = null, facultyId = null) => {
    const matchStage = {};
    if (deptId) {
        matchStage.department = await resolveId(deptId, 'Department');
    }
    if (facultyId) {
        matchStage.faculty = await resolveId(facultyId, 'Faculty');
    }

    const taskStats = await Task.aggregate([
        { $match: matchStage },
        {
            $group: {
                _id: '$status',
                count: { $sum: 1 }
            }
        }
    ]);

    const now = new Date();
    const overdueCount = await Task.countDocuments({
        ...matchStage,
        status: { $ne: 'completed' },
        dueDate: { $lt: now }
    });

    // Format output beautifully
    const formattedStats = {
        pending: 0,
        in_progress: 0,
        completed: 0,
        overdue: overdueCount
    };

    taskStats.forEach(stat => {
        if (formattedStats[stat._id] !== undefined) {
            formattedStats[stat._id] = stat.count;
        }
    });

    formattedStats.total = formattedStats.pending + formattedStats.in_progress + formattedStats.completed;

    const completionRate = formattedStats.total === 0 ? 0 : 
        ((formattedStats.completed / formattedStats.total) * 100).toFixed(2);

    return { ...formattedStats, completionRate: `${completionRate}%` };
};

/**
 * Get Department Performance (Task data for a specific dept)
 */
exports.getDepartmentPerformance = async (deptId) => {
    const taskData = await exports.getTaskAnalytics(deptId);

    return {
        departmentId: deptId,
        tasks: taskData
    };
};

/**
 * Get Faculty Performance (Task data for a specific faculty)
 */
exports.getFacultyPerformance = async (facultyId) => {
    const taskData = await exports.getTaskAnalytics(null, facultyId);

    return {
        facultyId: facultyId,
        tasks: taskData
    };
};
