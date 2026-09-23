const systemConfigService = require('./system_config.service');
const sendResponse = require('../../utils/apiResponse');

/**
 * @desc    Get system settings (Admin only)
 * @route   GET /api/v1/system-configs
 */
const getSettings = async (req, res, next) => {
    try {
        const settings = await systemConfigService.getSettings();
        sendResponse(res, 200, 'System settings fetched', { settings });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Update system settings (Admin only)
 * @route   PATCH /api/v1/system-configs
 */
const updateSettings = async (req, res, next) => {
    try {
        const settings = await systemConfigService.updateSettings(req.body, req.user.id);
        sendResponse(res, 200, 'System settings updated', { settings });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getSettings,
    updateSettings,
};
