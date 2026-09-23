const mongoose = require('mongoose');

const taskCommentSchema = new mongoose.Schema(
    {
        taskId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Task',
            required: true,
        },
        taskCustomId: {
            type: String,
            required: true,
        },
        userId: {
            type: String, // User customId
            required: true,
        },
        comment: {
            type: String,
            required: [true, 'Comment cannot be empty'],
            trim: true,
            maxlength: [2000, 'Comment cannot exceed 2000 characters'],
        },
        parentCommentId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'TaskComment',
            default: null,
        },
        customId: {
            type: String,
            unique: true,
        },
        isDeleted: {
            type: Boolean,
            default: false
        }
    },
    { 
        timestamps: true,
        toJSON: { virtuals: true },
        toObject: { virtuals: true }
    }
);

// Virtual for author data
taskCommentSchema.virtual('authorData', {
    ref: 'User',
    localField: 'userId',
    foreignField: 'customId',
    justOne: true
});

// Virtual for parent comment (reply preview)
taskCommentSchema.virtual('parentData', {
    ref: 'TaskComment',
    localField: 'parentCommentId',
    foreignField: '_id',
    justOne: true
});

// Generate Custom ID before saving
taskCommentSchema.pre('save', async function () {
    if (!this.isNew || this.customId) return;

    try {
        const { generateSequentialId } = require('../../utils/idGenerator');
        this.customId = await generateSequentialId('COMMENT', 4);
    } catch (err) {
        throw err;
    }
});

const TaskComment = mongoose.model('TaskComment', taskCommentSchema);

module.exports = TaskComment;
