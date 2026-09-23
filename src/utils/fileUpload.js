const multer = require('multer');
const AppError = require('./AppError');

const fs = require('fs');
const path = require('path');

// Set storage engine
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadPath = 'uploads';
        // Ensure directory exists
        if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
        }
        cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
        // Create unique filename: fieldname-timestamp.extension
        const ext = path.extname(file.originalname) || `.${file.mimetype.split('/')[1]}`;
        cb(null, `attachment-${Date.now()}${ext}`);
    },
});

// Check File Type Security
const multerFilter = (req, file, cb) => {
    // Allowed mimetypes: images, pdf, word, excel
    const allowedTypes = [
        'image/jpeg', 'image/png', 'image/jpg',
        'application/pdf',
        'application/msword', 
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ];

    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new AppError('Not a supported file type! Please upload only images, PDFs, or Office documents.', 400), false);
    }
};

const upload = multer({
    storage: storage,
    fileFilter: multerFilter,
    limits: {
        fileSize: 10 * 1024 * 1024, // 10 MB limit
    },
});

module.exports = upload;
