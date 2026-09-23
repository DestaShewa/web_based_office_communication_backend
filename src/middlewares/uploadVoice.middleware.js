const multer = require('multer');
const path = require('path');
const AppError = require('../utils/AppError');

// Storage configuration
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/voice/');
    },
    filename: (req, file, cb) => {
        // Format: voice-USERID-TIMESTAMP.ext
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        const ext = path.extname(file.originalname) || '.webm';
        cb(null, `voice-${req.user._id}-${uniqueSuffix}${ext}`);
    },
});

// File filter for audio types
const fileFilter = (req, file, cb) => {
    const allowedMimeTypes = [
        'audio/webm',
        'audio/ogg',
        'audio/mpeg',
        'audio/mp3',
        'audio/wav',
        'audio/x-m4a',
    ];

    if (allowedMimeTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new AppError('Invalid file type. Only audio files are allowed!', 400), false);
    }
};

const uploadVoice = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB limit
    },
});

module.exports = uploadVoice;
