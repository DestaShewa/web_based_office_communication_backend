const mongoose = require('mongoose');

const facultySchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: [true, 'Faculty must have a name'],
            unique: true,
            trim: true,
        },
        abbreviation: {
            type: String,
            required: [true, 'Faculty must have an abbreviation'],
            unique: true,
            uppercase: true,
            trim: true,
        },
        description: {
            type: String,
            trim: true,
            maxlength: [500, 'Description cannot exceed 500 characters'],
        },
        institute: {
            type: String, // Institute customId
            required: [true, 'Faculty must belong to an institute'],
        },
        dean: {
            type: String, // User customId (role: dean)
            default: null,
        },
        customId: {
            type: String,
            unique: true,
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
                if (ret.deanData) {
                    ret.dean = ret.deanData;
                    delete ret.deanData;
                }
                if (ret.instituteData) {
                    ret.institute = ret.instituteData;
                    delete ret.instituteData;
                }
                return ret;
            },
        },
        toObject: { virtuals: true },
    }
);

// Virtual populates
facultySchema.virtual('deanData', {
    ref: 'User',
    localField: 'dean',
    foreignField: 'customId',
    justOne: true,
});

facultySchema.virtual('instituteData', {
    ref: 'Institute',
    localField: 'institute',
    foreignField: 'customId',
    justOne: true,
});

facultySchema.virtual('departmentsData', {
    ref: 'Department',
    localField: 'customId',
    foreignField: 'faculty',
});

// Generate Custom ID before saving
// Format: {facultyAbbr}-{instituteAbbr}-{seq}
// Example: CSE-AMIT-01
facultySchema.pre('save', async function () {
    const isNew = this.isNew;
    const abbrChanged = this.isModified('abbreviation');
    const instituteChanged = this.isModified('institute');

    if (!isNew && !abbrChanged && !instituteChanged) return;

    // Capture old ID for cascading updates if it's an existing document
    if (!isNew && (abbrChanged || instituteChanged)) {
        this._oldCustomId = this.customId;
    }

    try {
        const { generateSequentialId } = require('../../utils/idGenerator');
        const Institute = mongoose.model('Institute');

        // Look up the institute to get its abbreviation
        const inst = await Institute.findOne({ customId: this.institute });
        if (!inst) throw new Error('Institute not found');

        // Use the institute abbreviation as the counter key
        const seqId = await generateSequentialId(inst.abbreviation, 2);

        // Format: {FacultyAbbr}-{seqId} where seqId = {InstAbbr}-{Inc}
        this.customId = `${this.abbreviation}-${seqId}`;
    } catch (err) {
        throw err;
    }
});

// Cascading updates after Faculty ID changes
facultySchema.post('save', async function (doc) {
    if (this._oldCustomId && this._oldCustomId !== doc.customId) {
        const Department = mongoose.model('Department');
        const User = mongoose.model('User');
        const { AuditLog } = require('../audit/audit.model');
        const oldId = this._oldCustomId;
        const newId = doc.customId;

        try {
            // Update departments referencing this faculty
            await Department.updateMany({ faculty: oldId }, { faculty: newId });

            // Update users referencing this faculty
            await User.updateMany({ faculty: oldId }, { faculty: newId });

            // Update audit logs
            await AuditLog.updateMany(
                { targetType: 'Faculty', targetId: oldId },
                { targetId: newId }
            );
        } catch (err) {
            console.error(`Cascading update failed for faculty ${oldId} -> ${newId}:`, err);
        }
    }
});

// Indexes
facultySchema.index({ institute: 1 });
facultySchema.index({ dean: 1 });
facultySchema.index({ name: 'text' });

const Faculty = mongoose.model('Faculty', facultySchema);

module.exports = Faculty;
