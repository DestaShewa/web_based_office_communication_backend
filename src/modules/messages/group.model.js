const mongoose = require('mongoose');

const groupSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: [true, 'Group must have a name'],
            trim: true,
            maxlength: [50, 'Group name cannot exceed 50 characters'],
        },
        profilePhoto: {
            type: String,
            default: null,
        },
        members: {
            type: [String], // Array of User customIds
            required: [true, 'Group must have members'],
            validate: {
                validator: function(v) {
                    return v && v.length > 0;
                },
                message: 'Group must have at least one member'
            }
        },
        createdBy: {
            type: String, // User customId
            required: [true, 'Group must have a creator'],
        },
        faculty: {
            type: String, // Faculty customId (if created by Dean)
            default: null,
        },
        department: {
            type: String, // Department customId (if created by Coordinator)
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
        toJSON: { virtuals: true },
        toObject: { virtuals: true },
    }
);

// Virtual populate for members
groupSchema.virtual('membersData', {
    ref: 'User',
    localField: 'members',
    foreignField: 'customId',
});

// Virtual populate for creator
groupSchema.virtual('creatorData', {
    ref: 'User',
    localField: 'createdBy',
    foreignField: 'customId',
    justOne: true,
});

groupSchema.pre('save', async function () {
    if (!this.isNew || this.customId) return;

    try {
        const { generateSequentialId } = require('../../utils/idGenerator');
        this.customId = await generateSequentialId('GRP', 3);
    } catch (err) {
        throw err;
    }
});

const Group = mongoose.model('Group', groupSchema);

module.exports = Group;
