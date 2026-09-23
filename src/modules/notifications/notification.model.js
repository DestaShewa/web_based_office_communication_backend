const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
    {
        recipient: {
            type: String, // User customId
            required: [true, 'Notification must have a recipient'],
        },
        type: {
            type: String,
            enum: [
                'NEW_TASK',
                'TASK_STATUS_UPDATE',
                'TASK_REASSIGNED',
                'TASK_OVERDUE',
                'TASK_COMPLETED',
                'NEW_ANNOUNCEMENT',
                'ANNOUNCEMENT_UPDATED',
                'PASSWORD_RESET_REQUEST',
                'SYSTEM_ALERT',
                'MEETING_INVITE',
                'MEETING_CANCELLED',
                'MEETING_REMINDER',
                'MESSAGE_RECEIVED',
                'NEW_MEMO',
                'MEMO_STATUS_UPDATE',
                'MEMO_READ',
                'MEMO_CONVERTED_TO_TASK',
                'MEMO_TASK_PROGRESS',
            ],
            required: [true, 'Notification must have a type'],
        },
        title: {
            type: String,
            required: [true, 'Notification must have a title'],
            trim: true,
            maxlength: [100, 'Title cannot exceed 100 characters'],
        },
        message: {
            type: String,
            required: [true, 'Notification must have a message'],
            trim: true,
            maxlength: [500, 'Message cannot exceed 500 characters'],
        },
        link: {
            type: String,
            trim: true,
        },
        targetId: {
            type: String, // ID of related entity (announcementId, requestId)
            trim: true,
        },
        sender: {
            type: String, // User customId who triggered it (optional)
            trim: true,
        },
        isRead: {
            type: Boolean,
            default: false,
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
                if (ret.recipientData) { ret.recipient = ret.recipientData; delete ret.recipientData; }
                if (ret.senderData) { ret.sender = ret.senderData; delete ret.senderData; }
                return ret;
            }
        },
        toObject: { virtuals: true },
    }
);

// Virtual populate
notificationSchema.virtual('recipientData', {
    ref: 'User',
    localField: 'recipient',
    foreignField: 'customId',
    justOne: true
});

notificationSchema.virtual('senderData', {
    ref: 'User',
    localField: 'sender',
    foreignField: 'customId',
    justOne: true
});

notificationSchema.pre('save', async function () {
    if (!this.isNew || this.customId) return;

    try {
        const { generateSequentialId } = require('../../utils/idGenerator');
        const year = new Date().getFullYear();
        const prefix = `NTF-${year}`;
        this.customId = await generateSequentialId(prefix, 2);
    } catch (err) {
        throw err;
    }
});

// Indexes for fast retrieval of a user's notifications and unread counts
notificationSchema.index({ recipient: 1, createdAt: -1 });
notificationSchema.index({ recipient: 1, isRead: 1 });

const Notification = mongoose.model('Notification', notificationSchema);

module.exports = Notification;
