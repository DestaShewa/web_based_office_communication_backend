const mongoose = require('mongoose');

const departmentSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: [true, 'Please provide a department name'],
            unique: true,
            trim: true,
        },
        abbreviation: {
            type: String,
            required: [true, 'Please provide a department abbreviation'],
            unique: true,
            uppercase: true,
            trim: true,
        },
        customId: {
            type: String,
            unique: true,
        },
        description: {
            type: String,
            trim: true,
        },
        coordinator: {
            type: String, // Stores User customId
            default: null,
        },
        faculty: {
            type: String, // Stores Faculty customId
            required: [true, 'Department must belong to a faculty'],
        },
        isActive: {
            type: Boolean,
            default: true,
        },
    },
    {
        timestamps: true,
        toJSON: {
            virtuals: true,
            transform: (doc, ret) => {
                if (ret.coordinatorData) {
                    ret.coordinator = ret.coordinatorData;
                    delete ret.coordinatorData;
                }
                if (ret.facultyData) {
                    ret.faculty = ret.facultyData;
                    delete ret.facultyData;
                }
                return ret;
            }
        },
        toObject: { virtuals: true },
    }
);

// Virtual populate for coordinator details
departmentSchema.virtual('coordinatorData', {
    ref: 'User',
    localField: 'coordinator',
    foreignField: 'customId',
    justOne: true,
});

// Virtual populate for faculty details
departmentSchema.virtual('facultyData', {
    ref: 'Faculty',
    localField: 'faculty',
    foreignField: 'customId',
    justOne: true,
});

departmentSchema.pre('save', async function () {
    const isNew = this.isNew;
    const abbrChanged = this.isModified('abbreviation');
    const facultyChanged = this.isModified('faculty');

    if (!isNew && !abbrChanged && !facultyChanged) return;

    // Capture old ID for cascading updates if it's an existing document
    if (!isNew && (abbrChanged || facultyChanged)) {
        this._oldCustomId = this.customId;
    }

    try {
        const { generateSequentialId } = require('../../utils/idGenerator');
        const Faculty = mongoose.model('Faculty');
        
        // Look up the faculty to get its abbreviation
        const fac = await Faculty.findOne({ customId: this.faculty });
        if (!fac) throw new Error('Faculty not found');
        
        // Use faculty abbreviation as the counter key
        const seqId = await generateSequentialId(fac.abbreviation, 2);
        
        // Format: {DepartmentAbbr}-{FacultyAbbr}-{Seq} 
        // e.g., CS-CSE-01
        this.customId = `${this.abbreviation}-${seqId}`;
    } catch (err) {
        throw err;
    }
});

// Cascading updates for related models after Department ID/Abbreviation changes
departmentSchema.post('save', async function (doc) {
    if (this._oldCustomId && this._oldCustomId !== doc.customId) {
        const User = mongoose.model('User');
        const Task = mongoose.model('Task');
        const { AuditLog } = require('./../audit/audit.model');
        const oldDeptId = this._oldCustomId;
        const newDeptId = doc.customId;

        try {
            // Find all users in this department
            const users = await User.find({ department: oldDeptId });
            
            // Update each user. Using .save() is necessary to trigger the User pre-save hook 
            // which regenerates the User customId based on the new Department abbreviation.
            for (const user of users) {
                user.department = newDeptId;
                await user.save();
            }

            // Bulk update other models using the department customId
            await Promise.all([
                Task.updateMany({ department: oldDeptId }, { department: newDeptId }),
                AuditLog.updateMany({ targetType: 'Department', targetId: oldDeptId }, { targetId: newDeptId })
            ]);
            
        } catch (err) {
            console.error(`Cascading update failed for department ${oldDeptId} -> ${newDeptId}:`, err);
        }
    }
});

// Indexes
departmentSchema.index({ faculty: 1 });
departmentSchema.index({ coordinator: 1 });

const Department = mongoose.model('Department', departmentSchema);

module.exports = Department;
