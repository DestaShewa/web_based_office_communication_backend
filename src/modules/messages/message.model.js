const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema(
    {
        sender: {
            type: String, // User customId
            required: [true, 'Message must have a sender'],
        },
        receiver: {
            type: String, // User or Department customId
            required: [true, 'Message must have a receiver'],
        },
        content: {
            type: String,
            required: function() { return this.type === 'text'; },
            trim: true,
            maxlength: [2000, 'Message content cannot exceed 2000 characters'],
        },
        type: {
            type: String,
            enum: ['direct', 'department', 'group'],
            default: 'direct',
        },
        messageType: {
            type: String,
            enum: ['text', 'audio', 'file', 'image'],
            default: 'text',
        },
        fileUrl: {
            type: String,
            trim: true,
        },
        fileInfo: {
            name: String,
            size: Number,
            mimeType: String,
        },
        status: {
            type: String,
            enum: ['sent', 'delivered', 'read'],
            default: 'sent',
        },
        duration: {
            type: Number, // in seconds
        },
        isRead: {
            type: Boolean,
            default: false,
        },
        readAt: {
            type: Date,
        },
        customId: {
            type: String,
            unique: true,
        },
        isEdited: {
            type: Boolean,
            default: false,
        },
        deletedBy: {
            type: [String], // Array of user customIds who deleted the message for themselves
            default: [],
        },
        isDeletedForEveryone: {
            type: Boolean,
            default: false,
        },
        forwardedFrom: {
            type: String, // Original sender's customId
            default: null,
        },
        replyTo: {
            type: {
                messageId: String,
                senderName: String,
                contentPreview: String,
            },
            default: null,
        },
    },
    {
        timestamps: true,
        toJSON: {
            virtuals: true,
            transform: (doc, ret) => {
                if (ret.senderData) { ret.sender = ret.senderData; delete ret.senderData; }
                if (ret.receiverUserData) { ret.receiver = ret.receiverUserData; delete ret.receiverUserData; }
                if (ret.receiverDeptData) { ret.receiver = ret.receiverDeptData; delete ret.receiverDeptData; }
                if (ret.receiverGroupData) { ret.receiver = ret.receiverGroupData; delete ret.receiverGroupData; }
                return ret;
            }
        },
        toObject: { virtuals: true },
    }
);

// Virtual populates
messageSchema.virtual('senderData', {
    ref: 'User',
    localField: 'sender',
    foreignField: 'customId',
    justOne: true
});

// For receiver, we need a dynamic ref or multiple virtuals. 
// Given the current usage, we'll provide both.
messageSchema.virtual('receiverUserData', {
    ref: 'User',
    localField: 'receiver',
    foreignField: 'customId',
    justOne: true
});

messageSchema.virtual('receiverDeptData', {
    ref: 'Department',
    localField: 'receiver',
    foreignField: 'customId',
    justOne: true
});

messageSchema.virtual('receiverGroupData', {
    ref: 'Group',
    localField: 'receiver',
    foreignField: 'customId',
    justOne: true
});


messageSchema.pre('save', async function () {
    if (!this.isNew || this.customId) return;

    try {
        const { generateSequentialId } = require('../../utils/idGenerator');
        const year = new Date().getFullYear();
        const prefix = `MSG-${year}`;
        this.customId = await generateSequentialId(prefix, 2);
    } catch (err) {
        throw err;
    }
});

// Index for faster conversation retrieval
messageSchema.index({ sender: 1, receiver: 1, createdAt: -1 });
messageSchema.index({ receiver: 1, sender: 1, createdAt: -1 });
// Index for unread counts
messageSchema.index({ receiver: 1, isRead: 1 });

const Message = mongoose.model('Message', messageSchema);

module.exports = Message;
