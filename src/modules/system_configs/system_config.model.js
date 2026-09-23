const mongoose = require('mongoose');

const systemConfigSchema = new mongoose.Schema(
    {
        maintenanceMode: {
            type: Boolean,
            default: false,
        },
        updatedBy: {
            type: String, // User customId
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
                if (ret.updatedByData) { ret.updatedBy = ret.updatedByData; delete ret.updatedByData; }
                return ret;
            }
        },
        toObject: { virtuals: true },
    }
);

// Virtual populate
systemConfigSchema.virtual('updatedByData', {
    ref: 'User',
    localField: 'updatedBy',
    foreignField: 'customId',
    justOne: true
});

systemConfigSchema.pre('save', async function () {
    if (!this.isNew || this.customId) return;

    try {
        const { generateSequentialId } = require('../../utils/idGenerator');
        const year = new Date().getFullYear();
        const prefix = `CONFIG-${year}`;
        this.customId = await generateSequentialId(prefix, 2);
    } catch (err) {
        throw err;
    }
});

// Ensure only one settings document exists
systemConfigSchema.statics.getSettings = async function () {
    let settings = await this.findOne();
    if (!settings) {
        settings = await this.create({});
    }
    return settings;
};

const SystemConfig = mongoose.model('SystemConfig', systemConfigSchema);

module.exports = SystemConfig;
