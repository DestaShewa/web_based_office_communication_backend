const mongoose = require('mongoose');
const env = require('../config/env.config');
const User = require('../modules/users/user.model');
// Register other models to prevent 'MissingSchemaError' in User hooks
require('../modules/departments/department.model');
require('../modules/faculties/faculty.model');
require('../modules/institutes/institute.model');
require('../modules/system_configs/counter.model');
const { AuditLog } = require('../modules/audit/audit.model');
const ROLES = require('../constants/roles');
const logger = require('./logger');

const seedAdminOnly = async () => {
    try {
        await mongoose.connect(env.MONGODB_URI);
        logger.info('Connected to MongoDB for clean admin seeding...');

        // 1. Clear relevant collections
        const collections = ['users', 'departments', 'faculties', 'institutes', 'counters', 'auditlogs', 'tasks', 'meetings', 'announcements', 'notifications'];

        for (const colName of collections) {
            await mongoose.connection.collection(colName).deleteMany({});
            logger.info(`Cleared collection: ${colName}`);
        }

        // 2. Seed the Admin User
        // Note: Without an Institute, the sequential ID prefix will default to 'INST-ADM'
        const admin = await User.create({
            name: 'Habtamu Abera',
            email: 'habtamu@gmail.com',
            password: 'admin1234',
            role: ROLES.ADMIN,
            status: 'Available',
        });

        logger.info(`Seeded Root Admin: ${admin.email} (${admin.customId})`);
        logger.info('Database reset to Admin-only state. 🚀');

        process.exit(0);
    } catch (error) {
        logger.error(`Error Seeding Admin: ${error.message}`);
        process.exit(1);
    }
};

seedAdminOnly();
