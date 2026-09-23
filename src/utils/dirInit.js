const fs = require('fs');
const path = require('path');
const logger = require('./logger');

/**
 * Ensures all required upload directories exist.
 * This prevents ENOENT errors on new machines or after cloning.
 */
const initUploadDirs = () => {
    const baseDir = path.join(__dirname, '../../uploads');
    const dirs = [
        '',
        'profiles',
        'voice',
        'messages',
        'memos'
    ];

    dirs.forEach(dir => {
        const fullPath = path.join(baseDir, dir);
        if (!fs.existsSync(fullPath)) {
            try {
                fs.mkdirSync(fullPath, { recursive: true });
                logger.info(`Created missing directory: ${fullPath}`);
            } catch (err) {
                logger.error(`Failed to create directory ${fullPath}:`, err);
            }
        }
    });
};

module.exports = { initUploadDirs };
