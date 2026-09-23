const mongoose = require('mongoose');

const officeSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: [true, 'Please provide an office name'],
            unique: true,
            trim: true,
        },
        abbreviation: {
            type: String,
            required: [true, 'Please provide an office abbreviation'],
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
                return ret;
            }
        },
        toObject: { virtuals: true },
    }
);

// Virtual populate for coordinator details
officeSchema.virtual('coordinatorData', {
    ref: 'User',
    localField: 'coordinator',
    foreignField: 'customId',
    justOne: true,
});

officeSchema.pre('save', async function () {
    if (!this.isNew && !this.isModified('abbreviation')) return;

    // Capture old ID for cascading updates if it's an existing document
    if (!this.isNew && this.isModified('abbreviation')) {
        this._oldCustomId = this.customId;
    }

    try {
        const { generateSequentialId } = require('../../utils/idGenerator');
        
        // Use 'OFF' as a generic prefix category, but include abbreviation in ID
        const seqId = await generateSequentialId('OFFICE', 2);
        
        // Format: OFF-{Abbr}-{Seq} 
        // e.g., OFF-FIN-01
        this.customId = `OFF-${this.abbreviation}-${seqId}`;
    } catch (err) {
        throw err;
    }
});

// Cascading updates for related models after Office ID changes
officeSchema.post('save', async function (doc) {
    if (this._oldCustomId && this._oldCustomId !== doc.customId) {
        const User = mongoose.model('User');
        const Task = mongoose.model('Task');
        const Memo = mongoose.model('Memo');
        const oldOfficeId = this._oldCustomId;
        const newOfficeId = doc.customId;

        try {
            // Find all users in this office
            const users = await User.find({ office: oldOfficeId });
            for (const user of users) {
                user.office = newOfficeId;
                await user.save();
            }

            // Bulk update other models using the office customId
            await Promise.all([
                Task.updateMany({ office: oldOfficeId }, { office: newOfficeId }),
                Memo.updateMany({ recipientOffice: oldOfficeId }, { recipientOffice: newOfficeId }),
                Memo.updateMany({ senderOffice: oldOfficeId }, { senderOffice: newOfficeId }),
                Memo.updateMany({ ccOffices: oldOfficeId }, { $set: { "ccOffices.$": newOfficeId } })
            ]);
            
        } catch (err) {
            console.error(`Cascading update failed for office ${oldOfficeId} -> ${newOfficeId}:`, err);
        }
    }
});

const Office = mongoose.model('Office', officeSchema);

module.exports = Office;
