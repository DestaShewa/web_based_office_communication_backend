const mongoose = require('mongoose');


// --- Sub-schema for reassignment history ---
const reassignmentSchema = new mongoose.Schema({
    previousAssignee: { type: String }, // User customId
    newAssignee:      { type: String }, // User customId
    reassignedBy:     { type: String }, // User customId
    reassignedAt:     { type: Date, default: Date.now },
});

const taskSchema = new mongoose.Schema(
    {
        title: {
            type: String,
            required: [true, 'Task must have a title'],
            trim: true,
            maxlength: [100, 'Title cannot exceed 100 characters'],
        },
        description: {
            type: String,
            required: [true, 'Task must have a description'],
            trim: true,
            maxlength: [1000, 'Description cannot exceed 1000 characters'],
        },
        assigner: {
            type: String,
            required: [true, 'Task must have an assigner'],
        },
        assignees: [{
            user: { type: String, required: true },
            status: { 
                type: String, 
                enum: ['pending', 'in_progress', 'completed', 'overdue'], 
                default: 'pending' 
            },
            completedAt: Date
        }],
        roleType: {
            type: String, // e.g. dean, coordinator, staff, admin
            trim: true,
        },
        faculty: {
            type: String,
            required: false,
        },
        department: {
            type: String,
            required: false,
        },
        dueDate: {
            type: Date,
            required: [true, 'Task must have a due date'],
        },
        status: {
            type: String,
            enum: ['pending', 'in_progress', 'completed', 'overdue'],
            default: 'pending',
        },
        priority: {
            type: String,
            enum: ['low', 'medium', 'high', 'urgent'],
            default: 'medium',
        },
        customId: {
            type: String,
            unique: true,
        },
        reassignmentHistory: [reassignmentSchema],
        memoId: {
            type: String, // Memo customId
            required: false,
        },
        office: {
            type: String,
            required: false,
        },
    },
    {
        timestamps: true,
        toJSON: {
            virtuals: true,
            transform: (doc, ret) => {
                // Calculate aggregate progress for the frontend
                if (ret.assignees && ret.assignees.length > 0) {
                    const completed = ret.assignees.filter(a => a.status === 'completed').length;
                    const inProgress = ret.assignees.filter(a => a.status === 'in_progress').length;
                    
                    ret.progress = {
                        completed,
                        total: ret.assignees.length,
                        percentage: Math.round((completed / ret.assignees.length) * 100)
                    };
                    // Standard status for the whole task (conceptual)
                    // Priority: Completed > Overdue > In Progress > Pending
                    if (completed === ret.assignees.length) {
                        ret.status = 'completed';
                    } else if (doc.status === 'overdue') {
                        ret.status = 'overdue';
                    } else if (completed > 0 || inProgress > 0) {
                        ret.status = 'in_progress';
                    } else {
                        ret.status = 'pending';
                    }
                }
                
                return ret;
            }
        },
        toObject: { virtuals: true },
    }
);

// Virtual populates
taskSchema.virtual('assignerData', {
    ref: 'User',
    localField: 'assigner',
    foreignField: 'customId',
    justOne: true
});

taskSchema.virtual('assigneesData', {
    ref: 'User',
    localField: 'assignees.user',
    foreignField: 'customId',
    justOne: false
});

// Backward compatibility virtual for single-member logic
taskSchema.virtual('assignee').get(function() {
    return this.assignees && this.assignees.length > 0 ? this.assignees[0].user : null;
});

taskSchema.virtual('assigneeData').get(function() {
    return this.assigneesData && this.assigneesData.length > 0 ? this.assigneesData[0] : null;
});

taskSchema.virtual('facultyData', {
    ref: 'Faculty',
    localField: 'faculty',
    foreignField: 'customId',
    justOne: true
});

taskSchema.virtual('departmentData', {
    ref: 'Department',
    localField: 'department',
    foreignField: 'customId',
    justOne: true
});

taskSchema.virtual('memoData', {
    ref: 'Memo',
    localField: 'memoId',
    foreignField: 'customId',
    justOne: true
});

taskSchema.virtual('officeData', {
    ref: 'Office',
    localField: 'office',
    foreignField: 'customId',
    justOne: true
});

// Generate Custom ID before saving
taskSchema.pre('save', async function () {
    if (this.isNew && !this.customId) {
        try {
            const { generateSequentialId } = require('../../utils/idGenerator');
            const year = new Date().getFullYear();
            const prefix = `TASK-${year}`;
            this.customId = await generateSequentialId(prefix, 2);
        } catch (err) {
            throw err;
        }
    }

    // --- Auto-detect aggregate status ---
    if (this.assignees && this.assignees.length > 0) {
        const completed = this.assignees.filter(a => a.status === 'completed').length;
        const inProgress = this.assignees.filter(a => a.status === 'in_progress').length;
        
        if (completed === this.assignees.length) {
            this.status = 'completed';
        } else if (this.status !== 'overdue' && (completed > 0 || inProgress > 0)) {
            this.status = 'in_progress';
        } else if (this.status !== 'overdue' && completed === 0 && inProgress === 0) {
            this.status = 'pending';
        }
    }

    // --- Auto-detect overdue before every save ---
    if (this.status !== 'completed' && this.dueDate < new Date()) {
        this.status = 'overdue';
        // Also update individual assignees if they haven't completed
        this.assignees.forEach(a => {
            if (a.status !== 'completed') a.status = 'overdue';
        });
    }
});

// --- Indexes ---
taskSchema.index({ assignee: 1, status: 1 });
taskSchema.index({ faculty: 1, status: 1 });
taskSchema.index({ department: 1, status: 1 });
taskSchema.index({ office: 1, status: 1 });
taskSchema.index({ title: 'text' });

const Task = mongoose.model('Task', taskSchema);

module.exports = Task;
