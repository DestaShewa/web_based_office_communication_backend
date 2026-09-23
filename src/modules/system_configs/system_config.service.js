const SystemConfig = require('./system_config.model');
const { logAction } = require('../audit/audit.service');
const { AUDIT_ACTIONS } = require('../audit/audit.model');


/**
 * Get current system settings
 */
const getSettings = async () => {
    return await SystemConfig.getSettings();
};

/**
 * Update system settings — only saves and audits when values actually change
 */
const updateSettings = async (updateData, adminId) => {
    const settings = await SystemConfig.getSettings();

    // Whitelist: only allow known config fields
    const ALLOWED_FIELDS = ['maintenanceMode'];
    const changedFields = [];

    ALLOWED_FIELDS.forEach((key) => {
        if (key in updateData && settings[key] !== Boolean(updateData[key])) {
            settings[key] = Boolean(updateData[key]);
            changedFields.push(key);
        }
    });

    // Only persist and audit if something actually changed
    if (changedFields.length === 0) {
        return settings;
    }

    settings.updatedBy = adminId;
    await settings.save();

    await logAction({
        actor: adminId,
        action: AUDIT_ACTIONS.SYSTEM_CONFIG_UPDATED,
        targetType: 'SystemConfig',
        targetId: 'GLOBAL',
        details: { updatedFields: changedFields, maintenanceMode: settings.maintenanceMode }
    });

    return settings;
};

module.exports = {
    getSettings,
    updateSettings,
};
