const mongoose = require('mongoose');

const AUDIT_ACTIONS = {
    // User events
    USER_CREATED:       'USER_CREATED',
    USER_UPDATED:       'USER_UPDATED',
    USER_ROLE_UPDATED:  'USER_ROLE_UPDATED',
    USER_DEACTIVATED:   'USER_DEACTIVATED',
    USER_ACTIVATED:     'USER_ACTIVATED',
    USER_DELETED:       'USER_DELETED',
    // Task events
    TASK_CREATED:        'TASK_CREATED',
    TASK_ASSIGNED:       'TASK_ASSIGNED',
    TASK_STATUS_UPDATED: 'TASK_STATUS_UPDATED',
    TASK_REASSIGNED:     'TASK_REASSIGNED',
    TASK_COMMENTED:      'TASK_COMMENTED',
    TASK_DELETED:        'TASK_DELETED',
    // Auth events
    USER_LOGGED_IN:  'USER_LOGGED_IN',
    USER_LOGGED_OUT: 'USER_LOGGED_OUT',
    FAILED_LOGIN_ATTEMPT: 'FAILED_LOGIN_ATTEMPT',
    PASSWORD_CHANGED: 'PASSWORD_CHANGED',
    PASSWORD_RESET: 'PASSWORD_RESET',
    PASSWORD_RESET_REQUESTED: 'PASSWORD_RESET_REQUESTED',
    PASSWORD_RESET_BY_ADMIN: 'PASSWORD_RESET_BY_ADMIN',
    UNAUTHORIZED_ACCESS_ATTEMPT: 'UNAUTHORIZED_ACCESS_ATTEMPT',
    // Department events
    DEPARTMENT_CREATED: 'DEPARTMENT_CREATED',
    DEPARTMENT_UPDATED: 'DEPARTMENT_UPDATED',
    DEPARTMENT_DELETED: 'DEPARTMENT_DELETED',
    // Faculty events
    FACULTY_CREATED: 'FACULTY_CREATED',
    FACULTY_UPDATED: 'FACULTY_UPDATED',
    FACULTY_DEACTIVATED: 'FACULTY_DEACTIVATED',
    FACULTY_ACTIVATED: 'FACULTY_ACTIVATED',
    FACULTY_DELETED: 'FACULTY_DELETED',
    // Institute events
    INSTITUTE_CREATED: 'INSTITUTE_CREATED',
    INSTITUTE_UPDATED: 'INSTITUTE_UPDATED',
    INSTITUTE_DELETED: 'INSTITUTE_DELETED',
    // Announcement events
    ANNOUNCEMENT_CREATED: 'ANNOUNCEMENT_CREATED',
    ANNOUNCEMENT_UPDATED: 'ANNOUNCEMENT_UPDATED',
    ANNOUNCEMENT_DELETED: 'ANNOUNCEMENT_DELETED',
    // Meeting events
    MEETING_SCHEDULED:      'MEETING_SCHEDULED',
    MEETING_UPDATED:        'MEETING_UPDATED',
    MEETING_CANCELLED:      'MEETING_CANCELLED',
    // System events
    SYSTEM_CONFIG_UPDATED: 'SYSTEM_CONFIG_UPDATED',
};

const auditSchema = new mongoose.Schema(
    {
        actor: {
            type: String, // User customId
            required: true,
        },
        action: {
            type: String,
            enum: Object.values(AUDIT_ACTIONS),
            required: true,
        },
        targetType: {
            type: String,
            enum: ['User', 'Task', 'Department', 'Faculty', 'Institute', 'SystemConfig', 'Auth', 'Announcement', 'Meeting'],
            required: true,
        },
        targetId: {
            type: String, // Target customId
        },
        details: {
            type: mongoose.Schema.Types.Mixed, // Stores any extra info (old/new values, etc.)
        },
        ipAddress: {
            type: String,
        },
        customId: {
            type: String,
            unique: true,
        },
    },
    {
        timestamps: true,
        toJSON: {
            virtuals: true,
            transform: (doc, ret) => {
                if (ret.actorData) { ret.actor = ret.actorData; delete ret.actorData; }
                return ret;
            }
        },
        toObject: { virtuals: true },
    }
);

// Virtual populate for actor
auditSchema.virtual('actorData', {
    ref: 'User',
    localField: 'actor',
    foreignField: 'customId',
    justOne: true
});

auditSchema.pre('save', async function () {
    if (!this.isNew || this.customId) return;

    try {
        const { generateSequentialId } = require('../../utils/idGenerator');
        const year = new Date().getFullYear();
        const prefix = `AUDIT-${year}`;
        this.customId = await generateSequentialId(prefix, 2);
    } catch (err) {
        throw err;
    }
});

// Index for fast admin queries
auditSchema.index({ actor: 1, createdAt: -1 });
auditSchema.index({ action: 1, createdAt: -1 });

const AuditLog = mongoose.model('AuditLog', auditSchema);

module.exports = { AuditLog, AUDIT_ACTIONS };
