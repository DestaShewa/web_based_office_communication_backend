const multer = require('multer');
const path = require('path');
const AppError = require('../utils/AppError');

// Storage configuration for general chat files
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/messages/');
    },
    filename: (req, file, cb) => {
        // Format: msg-UID-TIMESTAMP-ORIGINALNAME
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        const cleanName = file.originalname.replace(/[^a-zA-Z0-9.]/g, '_');
        cb(null, `file-${req.user._id}-${uniqueSuffix}-${cleanName}`);
    },
});

// File filter for general allowed types
const fileFilter = (req, file, cb) => {
    const allowedExtensions = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.png', '.jpg', '.jpeg', '.zip', '.txt'];
    const ext = path.extname(file.originalname).toLowerCase();
    
    if (allowedExtensions.includes(ext)) {
        cb(null, true);
    } else {
        cb(new AppError(`File type ${ext} not allowed. Supported: PDF, DOC, Images, ZIP, etc.`, 400), false);
    }
};

const uploadFile = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB limit as discussed
    },
});

module.exports = uploadFile;
