const Meeting = require('./meeting.model');
const AppError = require('../../utils/AppError');
const User = require('../users/user.model');
const { sendNotification } = require('../notifications/notification.service');
const { resolveId, getIdentifierQuery } = require('../../utils/helpers');
const emailService = require('../../services/email.service');
const { logAction } = require('../audit/audit.service');
const { AUDIT_ACTIONS } = require('../audit/audit.model');
const ROLES = require('../../constants/roles');
require('../offices/office.model'); // Ensure model is registered for populate/resolveId

/**
 * Helper: build search query for meetings (Issue 9)
 */
const buildMeetingQuery = (baseQuery, search) => {
    // Hide Completed/Canceled by default (Soft removal)
    const query = { status: 'scheduled', ...baseQuery };
    
    if (search) {
        const isExact = search.startsWith('"') && search.endsWith('"');
        const searchTerm = isExact ? search.slice(1, -1) : search;
        const searchRegex = isExact ? new RegExp(`^${searchTerm}$`, 'i') : new RegExp(searchTerm, 'i');

        const searchFilter = {
            $or: [
                { title: { $regex: searchRegex } },
                { description: { $regex: searchRegex } },
                { location: { $regex: searchRegex } }
            ]
        };

        // Use $and to combine with existing query (including our status filter)
        return { $and: [query, searchFilter] };
    }
    
    return query;
};

/**
 * Schedule a new meeting
 */
const scheduleMeeting = async (meetingData, organizer) => {
    if (organizer.role === ROLES.ADMIN) {
        throw new AppError('Administrators are not permitted to schedule operational sessions', 403);
    }
    let attendeeIds = meetingData.attendees || [];

    // Scope enforcement and automatic target selection
    if (!meetingData.scope) {
        if (organizer.role === ROLES.DIRECTOR) {
            meetingData.scope = 'university';
        } else if (organizer.role === ROLES.DEAN) {
            meetingData.scope = 'faculty';
            meetingData.faculty = organizer.faculty;
        } else if (organizer.role === ROLES.COORDINATOR && organizer.office) {
            meetingData.scope = 'office';
            meetingData.office = organizer.office;
        } else {
            meetingData.scope = 'department';
            meetingData.department = organizer.department;
        }
    }

    if (meetingData.scope === 'university' && organizer.role !== ROLES.DIRECTOR) {
        throw new AppError('Only Directors can schedule university-level meetings', 403);
    }
    
    if (meetingData.scope === 'faculty') {
        const isAuthorized = [ROLES.DIRECTOR, ROLES.DEAN].includes(organizer.role);
        if (!isAuthorized) {
            throw new AppError('Only Directors and Deans can schedule faculty-wide meetings', 403);
        }
        // Dean must schedule for their own faculty
        if (organizer.role === ROLES.DEAN && meetingData.faculty && meetingData.faculty !== organizer.faculty) {
            throw new AppError('Deans can only schedule meetings for their assigned faculty', 403);
        }
    }

    if (meetingData.scope === 'department') {
        const isAuthorized = [ROLES.DIRECTOR, ROLES.DEAN, ROLES.COORDINATOR].includes(organizer.role);
        if (!isAuthorized) {
            throw new AppError('Only Directors, Deans, and Coordinators can schedule department-wide meetings', 403);
        }
        // Dean must schedule for a department within their faculty (handled by find department check later or here)
        // Coordinator must schedule for their own department
        if (organizer.role === ROLES.COORDINATOR && meetingData.department && meetingData.department !== organizer.department) {
            throw new AppError('Coordinators can only schedule meetings for their assigned department', 403);
        }
    }

    if (meetingData.scope === 'office') {
        const isAuthorized = [ROLES.DIRECTOR, ROLES.COORDINATOR].includes(organizer.role);
        if (!isAuthorized) {
            throw new AppError('Only Directors and Office Coordinators can schedule office-level meetings', 403);
        }
        if (organizer.role === ROLES.COORDINATOR && meetingData.office && meetingData.office !== organizer.office) {
            throw new AppError('Office Coordinators can only schedule meetings for their assigned office', 403);
        }
    }

    // Resolve structural IDs if string
    const resolvedDeptId = meetingData.department ? await resolveId(meetingData.department, 'Department') : undefined;
    const resolvedFacultyId = meetingData.faculty ? await resolveId(meetingData.faculty, 'Faculty') : undefined;
    const resolvedOfficeId = meetingData.office ? await resolveId(meetingData.office, 'Office') : undefined;

    // Explicit Invitation Enforcement: Reject if no attendees provided
    if (attendeeIds.length === 0) {
        throw new AppError('Strategic sessions require at least one explicitly selected stakeholder.', 400);
    }

    // FINAL SAFETY: Fetch attendee roles and exclude any accidental Admins
    const validParticipants = await User.find({
        customId: { $in: attendeeIds },
        role: { $ne: ROLES.ADMIN }
    }).select('customId');
    attendeeIds = validParticipants.map(u => u.customId);

    // Re-verify after Admin filtering
    if (attendeeIds.length === 0) {
        throw new AppError('Operational Fault: No valid stakeholders selected (Admins cannot be invited).', 400);
    }

    // Ensure strictly unique attendees, excluding organizer who already "owns" it implicitly
    attendeeIds = [...new Set(attendeeIds)].filter(
        id => id !== organizer.customId
    );

    // Fetch attendees' faculty and department data for oversight and record tracking
    const attendeesData = await User.find({
        customId: { $in: attendeeIds }
    }).select('faculty department departments office');

    const involvedFaculties = [...new Set(attendeesData.map(u => u.faculty).filter(Boolean))];
    const involvedDepartments = [...new Set([
        ...attendeesData.map(u => u.department),
        ...attendeesData.flatMap(u => u.departments || [])
    ].filter(Boolean))];

    const involvedOffices = [...new Set(attendeesData.map(u => {
        const off = u.office;
        if (!off) return null;
        return (typeof off === 'object') ? (off.customId || off._id?.toString()) : off.toString();
    }).filter(Boolean))];

    const meeting = await Meeting.create({
        title: meetingData.title,
        description: meetingData.description,
        agenda: meetingData.agenda,
        date: meetingData.date,
        time: meetingData.time,
        duration: meetingData.duration,
        location: meetingData.location,
        scope: meetingData.scope,
        faculty: resolvedFacultyId,
        department: resolvedDeptId,
        office: resolvedOfficeId,
        organizer: organizer.customId,
        attendees: attendeeIds,
        involvedFaculties,
        involvedDepartments,
        involvedOffices
    });

    // Notify all attendees (In-app and Email) - Background processing to avoid blocking the scheduler
    Promise.all(attendeeIds.map(async (attendeeId) => {
        // In-app Notification
        await sendNotification({
            recipient: attendeeId,
            type: 'MEETING_INVITE',
            title: 'New Meeting Invitation',
            message: `You have been invited to a meeting: "${meeting.title}" on ${new Date(meeting.date).toLocaleDateString()}`,
            link: `/meetings/${meeting._id}`,
        }).catch(() => {});

        // Email Notification
        try {
            const attendee = await User.findOne(getIdentifierQuery(attendeeId));
            if (attendee && attendee.email) {
                await emailService.sendMeetingInviteEmail(attendee, meeting, organizer);
            }
        } catch (err) {
            console.error('Email invitation error:', err);
        }
    })).catch(err => console.error('Meeting notification error:', err));

    // Admin Oversight Notifications (Director, Deans, Coordinators)
    const notifyAdmins = async () => {
        try {
            const adminQuery = {
                role: { $in: [ROLES.DIRECTOR, ROLES.DEAN, ROLES.COORDINATOR] },
                customId: { $ne: organizer.customId } // Don't notify organizer again
            };

            const admins = await User.find(adminQuery);
            
            for (const admin of admins) {
                let shouldNotify = false;
                let oversightContext = '';

                if (admin.role === ROLES.DIRECTOR) {
                    shouldNotify = true;
                    oversightContext = 'Institutional Oversight';
                } else if (admin.role === ROLES.DEAN && involvedFaculties.includes(admin.faculty)) {
                    shouldNotify = true;
                    oversightContext = 'Faculty Oversight';
                } else if (admin.role === ROLES.COORDINATOR && (involvedDepartments.includes(admin.department) || admin.departments?.some(d => involvedDepartments.includes(d)))) {
                    shouldNotify = true;
                    oversightContext = 'Department Oversight';
                } else if (admin.role === ROLES.COORDINATOR && admin.office && involvedOffices.includes(admin.office)) {
                    shouldNotify = true;
                    oversightContext = 'Office Oversight';
                }

                if (shouldNotify) {
                    await sendNotification({
                        recipient: admin.customId,
                        type: 'MEETING_INVITE', // Or a new type like 'MEETING_OVERSIGHT_ALERT'
                        title: `Meeting Oversight Alert: ${oversightContext}`,
                        message: `A meeting involving your staff has been scheduled: "${meeting.title}" on ${new Date(meeting.date).toLocaleDateString()}`,
                        link: `/meetings/${meeting._id}`,
                    }).catch(() => {});
                }
            }
        } catch (err) {
            console.error('Oversight notification fault:', err);
        }
    };
    notifyAdmins();

    await logAction({
        actor: organizer.customId,
        action: AUDIT_ACTIONS.MEETING_SCHEDULED,
        targetType: 'Meeting', 
        targetId: meeting.customId,
        details: { title: meeting.title, date: meeting.date }
    });

    return meeting;
};


/**
 * Get all meetings involving the user (as organizer or attendee)
 */
/**
 * Helper: apply participation filter for non-oversight roles
 */
const applyAccessFilter = (baseQuery, requestingUser) => {
    // 1. Directors have institutional oversight
    if (requestingUser.role === ROLES.DIRECTOR) return baseQuery;

    // Helper to get string ID from potential object/string
    const idToStr = (id) => {
        if (!id) return null;
        if (typeof id === 'object') return (id.customId || id._id?.toString() || null);
        return id.toString();
    };

    const userCustomId = idToStr(requestingUser.customId);
    const userFaculty = idToStr(requestingUser.faculty);
    const userDept = idToStr(requestingUser.department);
    const userOffice = idToStr(requestingUser.office);
    const userDepts = (requestingUser.departments || []).map(idToStr).filter(Boolean);

    // 2. Personal Involvement (Organizer or Attendee)
    const accessConditions = [
        { organizer: userCustomId },
        { attendees: userCustomId }
    ];

    // 3. Oversight Scopes
    // Dean oversight for their faculty
    if (requestingUser.role === ROLES.DEAN && userFaculty) {
        accessConditions.push({ faculty: userFaculty });
        accessConditions.push({ involvedFaculties: userFaculty });
    }

    // Coordinator oversight for their department(s)
    if (requestingUser.role === ROLES.COORDINATOR) {
        const deptIds = [userDept, ...userDepts].filter(Boolean);
        if (deptIds.length > 0) {
            accessConditions.push({ department: { $in: deptIds } });
            accessConditions.push({ involvedDepartments: { $in: deptIds } });
        }
        // Office Coordinator oversight for their office
        if (userOffice) {
            accessConditions.push({ office: userOffice });
            accessConditions.push({ involvedOffices: userOffice });
        }
    }

    return {
        ...baseQuery,
        $or: accessConditions
    };
};

/**
 * Get all meetings involving the user (as organizer or attendee)
 */
const getMyMeetings = async (requestingUser, filters = {}, limit = 50, page = 1) => {
    const skip = (page - 1) * limit;

    const baseQuery = {};
    const query = buildMeetingQuery(applyAccessFilter(baseQuery, requestingUser), filters.search);

    const meetings = await Meeting.find(query)
    .sort({ date: 1, time: 1 })
    .skip(skip)
    .limit(limit)
    .populate('organizerData', 'name customId profilePhoto role')
    .populate('attendeesData', 'name customId profilePhoto role')
    .populate('departmentData', 'name customId')
    .populate('facultyData', 'name customId')
    .populate('officeData', 'name customId');

    const total = await Meeting.countDocuments(query);

    return { meetings, total, page, limit, totalPages: Math.ceil(total / limit) };
};

/**
 * Get meetings for a specific department
 */
const getDepartmentMeetings = async (deptId, requestingUser, filters = {}, limit = 50, page = 1) => {
    const resolvedDeptId = await resolveId(deptId, 'Department');
    const skip = (page - 1) * limit;

    // Issue 9: add search support
    const baseQuery = { department: resolvedDeptId };
    const query = buildMeetingQuery(applyAccessFilter(baseQuery, requestingUser), filters.search);

    const meetings = await Meeting.find(query)
    .sort({ date: 1, time: 1 })
    .skip(skip)
    .limit(limit)
    .populate('organizerData', 'name customId profilePhoto role')
    .populate('attendeesData', 'name customId profilePhoto role')
    .populate('departmentData', 'name customId')
    .populate('facultyData', 'name customId')
    .populate('officeData', 'name customId');

    const total = await Meeting.countDocuments(query);

    return { meetings, total, page, limit, totalPages: Math.ceil(total / limit) };
};

/**
 * Get meetings for a specific faculty
 */
const getFacultyMeetings = async (facultyId, requestingUser, filters = {}, limit = 50, page = 1) => {
    const resolvedFacultyId = await resolveId(facultyId, 'Faculty');
    const skip = (page - 1) * limit;

    // Issue 9: add search support
    const baseQuery = { faculty: resolvedFacultyId };
    const query = buildMeetingQuery(applyAccessFilter(baseQuery, requestingUser), filters.search);

    const meetings = await Meeting.find(query)
    .sort({ date: 1, time: 1 })
    .skip(skip)
    .limit(limit)
    .populate('organizerData', 'name customId profilePhoto role')
    .populate('attendeesData', 'name customId profilePhoto role')
    .populate('departmentData', 'name customId')
    .populate('facultyData', 'name customId')
    .populate('officeData', 'name customId');

    const total = await Meeting.countDocuments(query);

    return { meetings, total, page, limit, totalPages: Math.ceil(total / limit) };
};

/**
 * Update meeting status (Cancel or Complete)
 */
const updateMeetingStatus = async (meetingId, newStatus, requestingUser) => {
    const meeting = await Meeting.findOne(getIdentifierQuery(meetingId));
    if (!meeting) throw new AppError('No meeting found with that ID', 404);

    // Issue 8: Skip if no change
    if (meeting.status === newStatus) {
        return meeting;
    }

    // Only organizer or Director can update status (Admins removed)
    if (meeting.organizer !== requestingUser.customId && requestingUser.role !== ROLES.DIRECTOR) {
        throw new AppError('You do not have permission to update this meeting status', 403);
    }

    if (!['scheduled', 'completed', 'cancelled'].includes(newStatus)) {
        throw new AppError('Invalid meeting status', 400);
    }

    const prevStatus = meeting.status;
    meeting.status = newStatus;
    await meeting.save();

    await logAction({
        actor: requestingUser.customId,
        action: newStatus === 'cancelled' ? AUDIT_ACTIONS.MEETING_CANCELLED : AUDIT_ACTIONS.MEETING_UPDATED,
        targetType: 'Meeting',
        targetId: meeting.customId,
        details: { from: prevStatus, to: newStatus }
    });

    if (newStatus === 'cancelled') {
        const title = meeting.title;
        // Background processing for notifications
        Promise.all(meeting.attendees.map(attendeeId => 
            sendNotification({
                recipient: attendeeId,
                type: 'MEETING_CANCELLED',
                title: 'Meeting Cancelled',
                message: `The meeting "${title}" has been cancelled.`,
                link: `/meetings/${meeting._id}`,
            })
        )).catch(err => console.error('Meeting cancellation notification error:', err));
    }

    return meeting;
};


/**
 * Get all meetings (Global oversight for Director/Admin)
 */
const getAllMeetings = async (requestingUser, filters = {}, limit = 50, page = 1) => {
    const skip = (page - 1) * limit;
    const baseQuery = {};
    const query = buildMeetingQuery(applyAccessFilter(baseQuery, requestingUser), filters.search);

    const meetings = await Meeting.find(query)
        .sort({ date: 1, time: 1 })
        .skip(skip)
        .limit(limit)
        .populate('organizerData', 'name customId profilePhoto role')
        .populate('attendeesData', 'name customId profilePhoto role')
        .populate('departmentData', 'name customId')
        .populate('facultyData', 'name customId')
        .populate('officeData', 'name customId');

    const total = await Meeting.countDocuments(query);
    return { meetings, total, page, limit, totalPages: Math.ceil(total / limit) };
};

/**
 * Get university-level meetings
 */
const getUniversityMeetings = async (requestingUser, filters = {}, limit = 50, page = 1) => {
    const skip = (page - 1) * limit;
    const baseQuery = { scope: 'university' };
    const query = buildMeetingQuery(applyAccessFilter(baseQuery, requestingUser), filters.search);

    const meetings = await Meeting.find(query)
        .sort({ date: 1, time: 1 })
        .skip(skip)
        .limit(limit)
        .populate('organizerData', 'name customId profilePhoto role')
        .populate('attendeesData', 'name customId profilePhoto role')
        .populate('departmentData', 'name customId')
        .populate('facultyData', 'name customId')
        .populate('officeData', 'name customId');

    const total = await Meeting.countDocuments(query);
    return { meetings, total, page, limit, totalPages: Math.ceil(total / limit) };
};

module.exports = {
    scheduleMeeting,
    getMyMeetings,
    getDepartmentMeetings,
    getFacultyMeetings,
    getOfficeMeetings: async (officeId, requestingUser, filters = {}, limit = 50, page = 1) => {
        const resolvedOfficeId = await resolveId(officeId, 'Office');
        const skip = (page - 1) * limit;

        const baseQuery = { office: resolvedOfficeId };
        const query = buildMeetingQuery(applyAccessFilter(baseQuery, requestingUser), filters.search);

        const meetings = await Meeting.find(query)
            .sort({ date: 1, time: 1 })
            .skip(skip)
            .limit(limit)
            .populate('organizerData', 'name customId profilePhoto role')
            .populate('attendeesData', 'name customId profilePhoto role')
            .populate('departmentData', 'name customId')
            .populate('facultyData', 'name customId')
            .populate('officeData', 'name customId');

        const total = await Meeting.countDocuments(query);
        return { meetings, total, page, limit, totalPages: Math.ceil(total / limit) };
    },
    getUniversityMeetings,
    getAllMeetings,
    updateMeetingStatus
};
