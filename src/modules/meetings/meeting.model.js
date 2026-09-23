const mongoose = require('mongoose');

const meetingSchema = new mongoose.Schema(
    {
        title: {
            type: String,
            required: [true, 'Please provide a meeting title'],
            trim: true,
            maxlength: [100, 'Meeting title cannot be more than 100 characters']
        },
        description: {
            type: String,
            trim: true,
            maxlength: [1500, 'Description cannot be more than 1500 characters']
        },
        agenda: {
            type: String,
            trim: true
        },
        date: {
            type: Date,
            required: [true, 'Please provide a meeting date']
        },
        time: {
            type: String,
            required: [true, 'Please provide a meeting time (e.g., "14:30")']
        },
        duration: {
            type: Number,
            default: 60,
            validate: {
                validator: function (val) {
                    return val > 0;
                },
                message: 'Duration must be greater than 0 minutes'
            }
        },
        location: {
            type: String,
            required: [true, 'Please provide a meeting location or link'],
            trim: true
        },
        organizer: {
            type: String, // User customId
            required: true
        },
        attendees: [String], // Array of User customIds
        scope: {
            type: String,
            enum: ['department', 'faculty', 'university', 'office'],
            default: 'department'
        },
        department: {
            type: String,
            // Optional: if set, it means it's a department-related meeting
        },
        office: {
            type: String, // Office customId
            // Optional: if set, it means it's an office-related meeting
        },
        faculty: {
            type: String, // Faculty customId
            // Optional: if set, it means it's a faculty-related meeting
        },
        status: {
            type: String,
            enum: ['scheduled', 'completed', 'cancelled'],
            default: 'scheduled'
        },
        customId: {
            type: String,
            unique: true,
        },
        involvedFaculties: {
            type: [String], // Array of faculty customIds from all participants
            default: []
        },
        involvedDepartments: {
            type: [String], // Array of department customIds from all participants
            default: []
        },
        involvedOffices: {
            type: [String], // Array of office customIds from all participants
            default: []
        },
    },
    {
        timestamps: true,
        toJSON: {
            virtuals: true,
            transform: (doc, ret) => {
                if (ret.organizerData) { ret.organizer = ret.organizerData; delete ret.organizerData; }
                if (ret.attendeesData) { ret.attendees = ret.attendeesData; delete ret.attendeesData; }
                if (ret.facultyData) { ret.faculty = ret.facultyData; delete ret.facultyData; }
                if (ret.departmentData) { ret.department = ret.departmentData; delete ret.departmentData; }
                if (ret.officeData) { ret.office = ret.officeData; delete ret.officeData; }
                return ret;
            }
        },
        toObject: { virtuals: true }
    }
);

// Virtual populates
meetingSchema.virtual('organizerData', {
    ref: 'User',
    localField: 'organizer',
    foreignField: 'customId',
    justOne: true
});

meetingSchema.virtual('attendeesData', {
    ref: 'User',
    localField: 'attendees',
    foreignField: 'customId'
});

meetingSchema.virtual('departmentData', {
    ref: 'Department',
    localField: 'department',
    foreignField: 'customId',
    justOne: true
});

meetingSchema.virtual('facultyData', {
    ref: 'Faculty',
    localField: 'faculty',
    foreignField: 'customId',
    justOne: true
});

meetingSchema.virtual('officeData', {
    ref: 'Office',
    localField: 'office',
    foreignField: 'customId',
    justOne: true
});

meetingSchema.pre('save', async function () {
    if (!this.isNew || this.customId) return;

    try {
        const { generateSequentialId } = require('../../utils/idGenerator');
        const year = new Date().getFullYear();
        const prefix = `MEET-${year}`;
        this.customId = await generateSequentialId(prefix, 2);
    } catch (err) {
        throw err;
    }
});

// Indexes
meetingSchema.index({ date: 1 });
meetingSchema.index({ organizer: 1 });
meetingSchema.index({ attendees: 1 });
meetingSchema.index({ faculty: 1, date: 1 });
meetingSchema.index({ department: 1 });
meetingSchema.index({ office: 1 });
meetingSchema.index({ involvedFaculties: 1 });
meetingSchema.index({ involvedDepartments: 1 });
meetingSchema.index({ involvedOffices: 1 });

const Meeting = mongoose.model('Meeting', meetingSchema);

module.exports = Meeting;
