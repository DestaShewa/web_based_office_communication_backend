const Counter = require('../modules/system_configs/counter.model');

/**
 * Generates a formatted sequential ID.
 * @param {string} prefix - The prefix for the ID (e.g., 'TASK', 'DOC', 'ECE-AMIT')
 * @param {number} padding - Number of digits for the increment (default 2)
 * @returns {Promise<string>}
 */
const generateSequentialId = async (prefix, padding = 2) => {
    const counter = await Counter.findOneAndUpdate(
        { name: prefix },
        { $inc: { seq: 1 } },
        { returnDocument: 'after', upsert: true }
    );

    const seqString = counter.seq.toString().padStart(padding, '0');
    return `${prefix}-${seqString}`;
};

/**
 * Maps system roles to their abbreviations.
 */
const ROLE_MAP = {
    staff: 'STF',
    coordinator: 'CORD',
    dean: 'DEAN',
    director: 'DIR',
    admin: 'ADM',
};

module.exports = {
    generateSequentialId,
    ROLE_MAP
};
