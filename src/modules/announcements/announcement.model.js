const mongoose = require('mongoose');

const readBySchema = new mongoose.Schema(
    {
        user: {
            type: String, // User customId
        },
        readAt: {
            type: Date,
            default: Date.now,
        },
    },
    { 
        _id: false, 
        toJSON: { virtuals: true }, 
        toObject: { virtuals: true } 
    }
);

readBySchema.virtual('userData', {
    ref: 'User',
    localField: 'user',
    foreignField: 'customId',
    justOne: true
});

const announcementSchema = new mongoose.Schema(
    {
        title: {
            type: String,
            required: [true, 'Announcement must have a title'],
            trim: true,
            maxlength: [150, 'Title cannot exceed 150 characters'],
        },
        content: {
            type: String,
            required: [true, 'Announcement must have content'],
            trim: true,
            maxlength: [5000, 'Content cannot exceed 5000 characters'],
        },
        createdBy: {
            type: String, // User customId
            required: [true, 'Announcement must have a creator'],
        },
        targetType: {
            type: String,
            enum: ['global', 'faculty', 'department', 'office'],
            required: [true, 'Must specify target type (global, faculty, department, or office)'],
        },
        targetId: {
            type: String, // facultyId / departmentId
            // Required if targetType is faculty or department
            required: function () {
                return ['faculty', 'department', 'office'].includes(this.targetType);
            },
        },
        poster: {
            type: String, // Will store the poster image URL
        },
        attachments: [
            {
                type: String, // Will store the file URL
            },
        ],
        readBy: {
            type: [readBySchema],
            select: false,
        },
        deletedForUsers: {
            type: [String], // Array of customIds
            default: [],
            select: false
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
                if (ret.createdByData) { ret.createdBy = ret.createdByData; delete ret.createdByData; }
                
                // Map targetId to facultyData or departmentData virtuals if needed for UI
                if (ret.targetType === 'faculty') ret.faculty = ret.targetData;
                if (ret.targetType === 'department') ret.department = ret.targetData;
                if (ret.targetType === 'office') ret.office = ret.targetData;
                delete ret.targetData;

                // Clean up readBy data in transform if populated
                if (ret.readBy && Array.isArray(ret.readBy)) {
                    ret.readBy = ret.readBy.map(entry => {
                        if (entry.userData) {
                            const user = entry.userData;
                            delete entry.userData;
                            return { ...entry, user };
                        }
                        return entry;
                    });
                }
                
                return ret;
            }
        },
        toObject: { virtuals: true },
    }
);

// Virtual populates
announcementSchema.virtual('createdByData', {
    ref: 'User',
    localField: 'createdBy',
    foreignField: 'customId',
    justOne: true
});

// Dynamic virtual for target details
announcementSchema.virtual('targetData', {
    ref: function() {
        if (this.targetType === 'faculty') return 'Faculty';
        if (this.targetType === 'department') return 'Department';
        if (this.targetType === 'office') return 'Office';
        return null;
    },
    localField: 'targetId',
    foreignField: 'customId',
    justOne: true
});

announcementSchema.pre('save', async function () {
    if (!this.isNew || this.customId) return;

    try {
        const { generateSequentialId } = require('../../utils/idGenerator');
        const year = new Date().getFullYear();
        const prefix = `ANN-${year}`;
        this.customId = await generateSequentialId(prefix, 2);
    } catch (err) {
        throw err;
    }
});

// Indexes
announcementSchema.index({ targetType: 1, createdAt: -1 });
announcementSchema.index({ targetId: 1, createdAt: -1 });
announcementSchema.index({ 'readBy.user': 1 }); // For fast checking if a user read it

const Announcement = mongoose.model('Announcement', announcementSchema);

module.exports = Announcement;
