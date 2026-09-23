const mongoose = require('mongoose');

/**
 * Resolves a potential customId or ObjectId string to a valid Mongoose ObjectId.
 * @param {string} idValue - The ID value (could be customId or ObjectId string)
 * @param {string} modelName - The Mongoose model name to search in
 * @returns {Promise<mongoose.Types.ObjectId|null>}
 */
const resolveId = async (idValue, modelName) => {
    if (!idValue) return null;

    // If it's an object (like from a direct model instance), get its customId
    if (typeof idValue === 'object' && idValue.customId) {
        return idValue.customId;
    }

    const idStr = idValue.toString();

    // If it's already a customId (doesn't fit ObjectId hex pattern)
    if (!mongoose.Types.ObjectId.isValid(idStr)) {
        return idStr;
    }

    // It's an ObjectId string, resolve its customId
    const Model = mongoose.model(modelName);
    const doc = await Model.findById(idStr).select('customId');
    
    if (!doc) {
        // Fallback for new documents that might not have customId yet or are being created
        return idStr; 
    }

    return doc.customId || idStr;
};

/**
 * Resolves an array of potential customId or ObjectId strings to Custom ID strings.
 * @param {Array<string>} idValues - Array of ID values
 * @param {string} modelName - The Mongoose model name
 * @returns {Promise<Array<string>>}
 */
const resolveIds = async (idValues, modelName) => {
    if (!Array.isArray(idValues)) return [];
    const results = await Promise.all(idValues.map(id => resolveId(id, modelName)));
    return results.filter(id => id !== null);
};

/**
 * Returns a query object to find a document by either ObjectId or customId.
 * @param {string} id - The ID value
 * @returns {Object} { _id: ObjectId } or { customId: string }
 */
const getIdentifierQuery = (id) => {
    if (!id) return {};
    const idStr = id.toString();
    return mongoose.Types.ObjectId.isValid(idStr) 
        ? { _id: idStr } 
        : { customId: idStr };
};

module.exports = {
    resolveId,
    resolveIds,
    getIdentifierQuery,
};
