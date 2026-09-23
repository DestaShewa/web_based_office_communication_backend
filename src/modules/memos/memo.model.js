const mongoose = require('mongoose');

const memoSchema = new mongoose.Schema(
    {
        customId: {
            type: String,
            unique: true,
        },
        sender: {
            type: String, // User customId
            required: [true, 'Memo must have a sender'],
        },
        senderOffice: {
            type: String, // Department or Faculty customId
            required: [true, 'Memo must have a sender office'],
        },
        recipientOffice: {
            type: String, // Department or Faculty customId
            required: [true, 'Memo must have a recipient office'],
        },
        ccOffices: [{
            type: String, // Department or Faculty customIds
        }],
        onModelSender: {
            type: String,
            required: true,
            enum: ['Faculty', 'Department', 'Office']
        },
        onModelRecipient: {
            type: String,
            required: true,
            enum: ['Faculty', 'Department', 'Office']
        },
        subject: {
            type: String,
            required: [true, 'Memo must have a subject'],
            trim: true,
            maxlength: [100, 'Subject cannot exceed 100 characters'],
        },
        body: {
            type: String,
            required: [true, 'Memo must have a body'],
            trim: true,
            maxlength: [2000, 'Body cannot exceed 2000 characters'],
        },
        priority: {
            type: String,
            enum: ['low', 'normal', 'urgent'],
            default: 'normal',
            required: true,
        },
        status: {
            type: String,
            enum: ['draft', 'dispatched', 'read', 'actioned', 'resolved'],
            default: 'dispatched',
        },
        expectedActionDate: {
            type: Date,
        },
        attachments: [{
            type: String, // File paths/URLs
        }],
        readBy: [{
            user: String, // User customId
            readAt: { type: Date, default: Date.now }
        }],
        tasks: [{
            type: String, // Task customIds
        }]
    },
    {
        timestamps: true,
        toJSON: { virtuals: true },
        toObject: { virtuals: true },
    }
);

// Virtuals for populating data
memoSchema.virtual('senderData', {
    ref: 'User',
    localField: 'sender',
    foreignField: 'customId',
    justOne: true
});

memoSchema.virtual('senderOfficeData', {
    refPath: 'onModelSender',
    localField: 'senderOffice',
    foreignField: 'customId',
    justOne: true
});

memoSchema.virtual('recipientOfficeData', {
    refPath: 'onModelRecipient',
    localField: 'recipientOffice',
    foreignField: 'customId',
    justOne: true
});

// These are now real fields, so we remove the virtual getters

// Set dynamic model types before validation
memoSchema.pre('validate', function () {
    // Resolve model types for population
    if (this.isModified('senderOffice')) {
        if (this.senderOffice?.startsWith('OFF-')) this.onModelSender = 'Office';
        else if (this.senderOffice?.includes('FAC')) this.onModelSender = 'Faculty';
        else this.onModelSender = 'Department';
    }

    if (this.isModified('recipientOffice')) {
        if (this.recipientOffice?.startsWith('OFF-')) this.onModelRecipient = 'Office';
        else if (this.recipientOffice?.includes('FAC')) this.onModelRecipient = 'Faculty';
        else this.onModelRecipient = 'Department';
    }
});

// Generate Custom ID before saving
memoSchema.pre('save', async function () {
    // Generate ID
    if (this.isNew && !this.customId) {
        try {
            const { generateSequentialId } = require('../../utils/idGenerator');
            this.customId = await generateSequentialId('MEM', 3);
        } catch (err) {
            throw err;
        }
    }
});

const Memo = mongoose.model('Memo', memoSchema);

module.exports = Memo;
