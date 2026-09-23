const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const ROLES = require('../../constants/roles');

const userSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: [true, 'Please provide your name'],
            trim: true,
        },
        email: {
            type: String,
            required: [true, 'Please provide your email'],
            unique: true,
            lowercase: true,
            trim: true,
            match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email'],
        },
        password: {
            type: String,
            required: [true, 'Please provide a password'],
            minlength: 6,
            select: false, // Don't return password by default
        },
        // ── New Profile Fields ──────────────────────────────────
        profilePhoto: {
            type: String,   // URL/path to uploaded photo
            default: null,
        },
        username: {
            type: String,
            unique: true,
            sparse: true,   // Allows null but enforces uniqueness on non-null values
            trim: true,
            lowercase: true,
            minlength: [3, 'Username must be at least 3 characters'],
            maxlength: [30, 'Username cannot exceed 30 characters'],
            match: [/^[a-z0-9_]+$/, 'Username can only contain lowercase letters, numbers, and underscores'],
        },
        bio: {
            type: String,
            trim: true,
            maxlength: [150, 'Bio cannot exceed 150 characters'],
        },
        phoneNumber: {
            type: String,
            trim: true,
            match: [/^(\+251|0)9\d{8}$/, 'Phone number must be in format: +251945234161 or 0945234161'],
        },

        // ── Role (Updated Enum) ─────────────────────────────────
        role: {
            type: String,
            enum: ['admin', 'director', 'dean', 'coordinator', 'staff'],
            default: 'staff',
        },

        // ── Organization Assignment ─────────────────────────────
        faculty: {
            type: String, // Faculty customId
            default: null,
        },
        department: {
            type: String, // Department customId (primary department)
            default: null,
        },
        office: {
            type: String, // Office customId
            default: null,
        },
        departments: [{
            type: String, // Department customIds (for multi-department Staff)
        }],
        customId: {
            type: String,
            unique: true,
        },
        isActive: {
            type: Boolean,
            default: true,
            select: false,
        },
        failedLoginAttempts: {
            type: Number,
            default: 0,
            select: false,
        },
        lastSecurityAlertSentAt: {
            type: Date,
            select: false,
        },
        isPasswordTemporary: {
            type: Boolean,
            default: false,
            select: true,
        },
        resetPasswordOtp: {
            type: String,
            select: false,
        },
        resetPasswordOtpExpires: {
            type: Date,
            select: false,
        },
        status: {
            type: String,
            enum: ['Available', 'Busy', 'Do Not Disturb', 'In a Meeting'],
            default: 'Available',
        },
        hasLoggedIn: {
            type: Boolean,
            default: false,
        },
        tempEmail: {
            type: String,
            lowercase: true,
            trim: true,
            match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email'],
        },
        emailChangeOtp: {
            type: String,
            select: false,
        },
        emailChangeOtpExpires: {
            type: Date,
            select: false,
        },
    },
    {
        timestamps: true,
        toJSON: {
            virtuals: true,
            transform: (doc, ret) => {
                if (ret.departmentData) {
                    ret.department = ret.departmentData;
                    delete ret.departmentData;
                }
                if (ret.facultyData) {
                    ret.faculty = ret.facultyData;
                    delete ret.facultyData;
                }
                if (ret.officeData) {
                    ret.office = ret.officeData;
                    delete ret.officeData;
                }
                if (ret.departmentsData) {
                    ret.departments = ret.departmentsData;
                    delete ret.departmentsData;
                }
                return ret;
            }
        },
        toObject: { virtuals: true },
    }
);

// Custom validator: faculty is required for dean
userSchema.path('faculty').validate(function(value) {
    if (this.role === 'dean') {
        return value != null && value.trim() !== '';
    }
    return true; // coordinators/staff will have it auto-resolved, admins/directors don't need it
}, 'Faculty is required for Dean role');

// Custom validator: department or office required for coordinator
userSchema.path('department').validate(function(value) {
    if (this.role === 'coordinator' && !this.office) {
        return value != null && value.trim() !== '';
    }
    return true;
}, 'Department or Office is required for Coordinator role');

userSchema.path('office').validate(function(value) {
    if (this.role === 'coordinator' && !this.department) {
        return value != null && value.trim() !== '';
    }
    return true;
}, 'Department or Office is required for Coordinator role');

// Auto-populate departments array for staff and resolve faculty for all org-based roles
userSchema.pre('save', async function() {
    const Department = mongoose.model('Department');

    // 1. Staff department array sync
    if (this.role === 'staff') {
        if (!this.departments || this.departments.length === 0) {
            if (this.department) {
                this.departments = [this.department];
            }
        }
        if (this.department && !this.departments.includes(this.department)) {
            this.departments.unshift(this.department);
        }
    }

    // 2. Auto-resolve Faculty if Department is present but Faculty is not (for Coordinator/Staff)
    if (['coordinator', 'staff'].includes(this.role) && this.department && !this.faculty) {
        const dept = await Department.findOne({ customId: this.department });
        if (dept && dept.faculty) {
            this.faculty = dept.faculty;
        }
    }

    // 3. Clean up org fields for global roles
    if (this.role === 'admin' || this.role === 'director') {
        this.faculty = null;
        this.department = null;
        this.departments = [];
        this.office = null;
    }
});

// Generate Custom ID before saving
userSchema.pre('save', async function () {
    const isNew = this.isNew;
    const { generateSequentialId, ROLE_MAP } = require('../../utils/idGenerator');
    const Department = mongoose.model('Department');
    const Faculty = mongoose.model('Faculty');
    const Institute = mongoose.model('Institute');

    const generateId = async () => {
        let prefix = '';
        if (['admin', 'director'].includes(this.role)) {
            // Use institute abbreviation + role (assuming single institute setup)
            const inst = await Institute.findOne();
            prefix = inst ? `${inst.abbreviation}-${ROLE_MAP[this.role]}` : `INST-${ROLE_MAP[this.role]}`;
        } else if (this.role === 'dean') {
            const fac = await Faculty.findOne({ customId: this.faculty });
            if (!fac) throw new Error('Faculty not found for Dean');
            prefix = `${fac.abbreviation}-${ROLE_MAP[this.role]}`;
        } else if (this.office) {
            const Office = mongoose.model('Office');
            const off = await Office.findOne({ customId: this.office });
            if (!off) throw new Error('Office not found for User generation');
            prefix = `${off.abbreviation}-${ROLE_MAP[this.role] || 'EMP'}`;
        } else {
            const dept = await Department.findOne({ customId: this.department });
            if (!dept) throw new Error('Department not found for User generation');
            prefix = `${dept.abbreviation}-${ROLE_MAP[this.role] || 'EMP'}`; // EMP fallback, though replaced by STF
        }
        this.customId = await generateSequentialId(prefix, 3);
    };

    if (isNew) {
        try {
            await generateId();
        } catch (err) {
            throw err;
        }
        return;
    }

    // Existing document handling
    const oldDoc = await this.constructor.findById(this._id).select('role department faculty customId +isActive');
    if (!oldDoc) return;

    const roleChanged = this.isModified('role');
    const deptChanged = this.isModified('department');
    const facultyChanged = this.isModified('faculty');
    const officeChanged = this.isModified('office');
    const statusChanged = this.isModified('isActive');

    // 1. Detect if user is losing Coordinator/Dean status
    const wasCoordinator = oldDoc.role === 'coordinator';
    const wasDean = oldDoc.role === 'dean';
    const wasActive = oldDoc.isActive !== false;
    const isCoordinatorNow = this.role === 'coordinator';
    const isDeanNow = this.role === 'dean';
    const isActiveNow = this.isActive !== false;

    if (wasCoordinator && wasActive && (!isCoordinatorNow || !isActiveNow)) {
        this._losingCoordinatorStatus = true;
    }
    if (wasDean && wasActive && (!isDeanNow || !isActiveNow)) {
        this._losingDeanStatus = true;
    }

    // 2. Return early if no relevant fields for ID generation changed
    if (!roleChanged && !deptChanged && !facultyChanged && !statusChanged) {
        return;
    }

    // 3. Handle ID regeneration if role or org assignment changed
    if (roleChanged || deptChanged || facultyChanged || officeChanged) {
        this._oldCustomId = oldDoc.customId;

        try {
            await generateId();
        } catch (err) {
            throw err;
        }
    }
});

// Cascading updates and Dept/Fac Coordinator/Dean sync after saving
userSchema.post('save', async function (doc) {
    const Department = mongoose.model('Department');
    const { notifyRole } = require('../notifications/notification.service');
    
    // 1a. If role is coordinator and active, set as coordinator of department
    if (doc.role === 'coordinator' && doc.department && doc.isActive !== false) {
        await Department.findOneAndUpdate(
            { customId: doc.department },
            { coordinator: doc.customId }
        );
    }

    // 1b. If role is dean and active, set as dean of faculty
    if (doc.role === 'dean' && doc.faculty && doc.isActive !== false) {
        const Faculty = mongoose.model('Faculty');
        await Faculty.findOneAndUpdate(
            { customId: doc.faculty },
            { dean: doc.customId }
        );
    }
    // 1c. If role is coordinator and active, set as coordinator of office (if assigned)
    if (doc.role === 'coordinator' && doc.office && doc.isActive !== false) {
        const Office = mongoose.model('Office');
        await Office.findOneAndUpdate(
            { customId: doc.office },
            { coordinator: doc.customId }
        );
    }

    // 2a. Handle Demotion or Deactivation of a Coordinator
    if (this._losingCoordinatorStatus && doc.department) {
        const dept = await Department.findOne({ customId: doc.department });

        if (dept && dept.coordinator === (this._oldCustomId || doc.customId)) {
            await Department.findOneAndUpdate(
                { customId: doc.department },
                { coordinator: null }
            );

            // Notify Admins about the vacancy
            await notifyRole('admin', {
                type: 'SYSTEM_ALERT',
                title: 'Department Coordinator Vacancy',
                message: `The department '${dept.name}' is now without a coordinator due to the demotion or deactivation of ${doc.name}.`,
                link: `/departments/${dept.customId}`
            });
        }
    }

    // 2b. Handle Demotion or Deactivation of a Dean
    if (this._losingDeanStatus && doc.faculty) {
        const Faculty = mongoose.model('Faculty');
        const fac = await Faculty.findOne({ customId: doc.faculty });

        if (fac && fac.dean === (this._oldCustomId || doc.customId)) {
            await Faculty.findOneAndUpdate(
                { customId: doc.faculty },
                { dean: null }
            );

            // Notify Admins about the vacancy
            await notifyRole('admin', {
                type: 'SYSTEM_ALERT',
                title: 'Faculty Dean Vacancy',
                message: `The faculty '${fac.name}' is now without a dean due to the demotion or deactivation of ${doc.name}.`,
                link: `/faculties/${fac.customId}`
            });
        }
    }

    // 3. If customId changed, update references across the system
    if (this._oldCustomId && this._oldCustomId !== doc.customId) {
        const oldId = this._oldCustomId;
        const newId = doc.customId;

        // Models to update: AuditLog (actor, targetId), Message (sender, receiver), 
        // Task (assignee, assigner), Announcement (author), Meeting (organizer, attendees)
        const Office = mongoose.model('Office');
        const updatePromises = [
            // Internal references in other models
            Department.updateMany({ coordinator: oldId }, { coordinator: newId }),
            Faculty.updateMany({ dean: oldId }, { dean: newId }),
            Office.updateMany({ coordinator: oldId }, { coordinator: newId }),
            mongoose.model('AuditLog').updateMany({ actor: oldId }, { actor: newId }),
            mongoose.model('AuditLog').updateMany({ targetType: 'User', targetId: oldId }, { targetId: newId }),
            mongoose.model('Message').updateMany({ sender: oldId }, { sender: newId }),
            mongoose.model('Message').updateMany({ receiver: oldId, type: 'direct' }, { receiver: newId }),
            mongoose.model('Task').updateMany({ assignee: oldId }, { assignee: newId }),
            mongoose.model('Task').updateMany({ assigner: oldId }, { assigner: newId }),
            mongoose.model('Announcement').updateMany({ author: oldId }, { author: newId }),
            mongoose.model('Meeting').updateMany({ organizer: oldId }, { organizer: newId }),
            mongoose.model('Meeting').updateMany({ attendees: oldId }, { $set: { "attendees.$": newId } }) // Update in array
        ];

        try {
            await Promise.all(updatePromises);
        } catch (err) {
            // No debug log
        }
    }

    // Clear temporary flags
    this._losingCoordinatorStatus = false;
    this._losingDeanStatus = false;
    this._oldCustomId = undefined;
});

// Encrypt password before saving
userSchema.pre('save', async function () {
    if (!this.isModified('password')) return;

    this.password = await bcrypt.hash(this.password, 12);
});

// Instance method to check if password is correct
userSchema.methods.correctPassword = async function (
    candidatePassword,
    userPassword
) {
    return await bcrypt.compare(candidatePassword, userPassword);
};

// Virtual populate for department details
userSchema.virtual('departmentData', {
    ref: 'Department',
    localField: 'department',
    foreignField: 'customId',
    justOne: true,
});

// Virtual populate for faculty details
userSchema.virtual('facultyData', {
    ref: 'Faculty',
    localField: 'faculty',
    foreignField: 'customId',
    justOne: true,
});

// Virtual populate for office details
userSchema.virtual('officeData', {
    ref: 'Office',
    localField: 'office',
    foreignField: 'customId',
    justOne: true,
});

// Virtual populate for departments list (for multi-department Staff)
userSchema.virtual('departmentsData', {
    ref: 'Department',
    localField: 'departments',
    foreignField: 'customId',
});

// Indexes for scalability
userSchema.index({ faculty: 1, role: 1 });
userSchema.index({ department: 1, role: 1 });
userSchema.index({ office: 1, role: 1 });
userSchema.index({ departments: 1 });
userSchema.index({ name: 1 });

const User = mongoose.model('User', userSchema);

module.exports = User;
