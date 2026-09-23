const Office = require('./office.model');
const User = require('../users/user.model');
const AppError = require('../../utils/AppError');

/**
 * Creates a new office
 */
const createOffice = async (officeData) => {
    const office = await Office.create(officeData);
    return office;
};

const getAllOffices = async (queryObj = {}) => {
    // 1) Filtering
    const excludedFields = ['page', 'sort', 'limit', 'fields', 'search'];
    const query = { ...queryObj };
    excludedFields.forEach(el => delete query[el]);

    // 2) Search functionality
    if (queryObj.search) {
        query.$or = [
            { name: { $regex: queryObj.search, $options: 'i' } },
            { abbreviation: { $regex: queryObj.search, $options: 'i' } },
            { customId: { $regex: queryObj.search, $options: 'i' } }
        ];
    }

    // 3) Execute query
    let findQuery = Office.find(query);

    // 4) Pagination
    const page = queryObj.page * 1 || 1;
    const limit = queryObj.limit * 1 || 100;
    const skip = (page - 1) * limit;
    findQuery = findQuery.skip(skip).limit(limit);

    const offices = await findQuery.populate('coordinatorData', 'name customId email profilePhoto role');
    const total = await Office.countDocuments(query);

    return {
        offices,
        total,
        page,
        limit
    };
};

/**
 * Gets a single office by ID
 */
const getOfficeById = async (officeId) => {
    const office = await Office.findOne({ customId: officeId })
        .populate('coordinatorData', 'name customId email profilePhoto role');
    if (!office) throw new AppError('Office not found', 404);
    return office;
};

/**
 * Updates an office
 */
const updateOffice = async (officeId, updateData) => {
    const office = await Office.findOne({ customId: officeId });
    if (!office) throw new AppError('Office not found', 404);

    // Update fields
    Object.keys(updateData).forEach(key => {
        office[key] = updateData[key];
    });

    await office.save();
    return office;
};

/**
 * Deletes an office permanently
 */
const deleteOffice = async (officeId) => {
    const office = await Office.findOne({ customId: officeId });
    if (!office) throw new AppError('Office not found', 404);

    // Check if there are users still assigned to this office
    const usersCount = await User.countDocuments({ office: officeId });
    if (usersCount > 0) {
        throw new AppError(`Cannot delete office with ${usersCount} assigned users. Reassign them first.`, 400);
    }

    await Office.deleteOne({ customId: officeId });
    return true;
};

/**
 * Gets all staff members in an office
 */
const getOfficeMembers = async (officeId) => {
    return await User.find({ office: officeId, role: 'staff' });
};

module.exports = {
    createOffice,
    getAllOffices,
    getOfficeById,
    updateOffice,
    deleteOffice,
    getOfficeMembers
};
