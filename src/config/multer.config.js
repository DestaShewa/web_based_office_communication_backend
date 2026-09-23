const multer = require('multer');
const path = require('path');
const fs = require('fs');
const AppError = require('../utils/AppError');

// Ensure upload directory exists
const profileDir = path.join(__dirname, '../../uploads/profiles');

if (!fs.existsSync(profileDir)) {
    fs.mkdirSync(profileDir, { recursive: true });
}

// --- Profile Photo Storage engine ---
const profileStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, profileDir);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        const uniqueName = `profile_${req.user.customId}_${Date.now()}${ext}`;
        cb(null, uniqueName);
    },
});

const photoFilter = (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
        cb(null, true);
    } else {
        cb(new AppError('Not an image! Please upload only images.', 400), false);
    }
};

// --- Export upload middleware ---
const uploadProfilePhoto = multer({
    storage: profileStorage,
    fileFilter: photoFilter,
    limits: {
        fileSize: 5 * 1024 * 1024, // 5 MB
    },
}).single('photo'); // field name must be 'photo'

// --- Group Photo Storage engine ---
const groupStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, profileDir);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        const uniqueName = `group_${req.params.groupId || req.user.customId}_${Date.now()}${ext}`;
        cb(null, uniqueName);
    },
});

const uploadGroupPhoto = multer({
    storage: groupStorage,
    fileFilter: photoFilter,
    limits: {
        fileSize: 5 * 1024 * 1024, // 5 MB
    },
}).single('photo'); // field name must be 'photo'

module.exports = { uploadProfilePhoto, uploadGroupPhoto };
