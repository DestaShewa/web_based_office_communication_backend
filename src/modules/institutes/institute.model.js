const mongoose = require('mongoose');

const instituteSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: [true, 'Institute must have a name'],
            unique: true,
            trim: true,
        },
        abbreviation: {
            type: String,
            required: [true, 'Institute must have an abbreviation'],
            unique: true,
            uppercase: true,
            trim: true,
        },
        description: {
            type: String,
            trim: true,
            maxlength: [500, 'Description cannot exceed 500 characters'],
        },
        customId: {
            type: String,
            unique: true,
        },
    },
    {
        timestamps: true,
        toJSON: { virtuals: true },
        toObject: { virtuals: true },
    }
);

// Virtual populate: list all faculties under this institute
instituteSchema.virtual('facultiesData', {
    ref: 'Faculty',
    localField: 'customId',
    foreignField: 'institute',
});

// Generate Custom ID before saving
instituteSchema.pre('save', async function () {
    if (!this.isNew || this.customId) return;

    try {
        const { generateSequentialId } = require('../../utils/idGenerator');
        this.customId = await generateSequentialId('INST', 2);
    } catch (err) {
        throw err;
    }
});

// Indexes
instituteSchema.index({ name: 'text' });

const Institute = mongoose.model('Institute', instituteSchema);

module.exports = Institute;
