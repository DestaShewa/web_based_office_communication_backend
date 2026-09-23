const mongoose = require('mongoose');
const env = require('../config/env.config');
const User = require('../modules/users/user.model');
const Institute = require('../modules/institutes/institute.model');
const Faculty = require('../modules/faculties/faculty.model');
const Department = require('../modules/departments/department.model');
const Office = require('../modules/offices/office.model');
const { AuditLog, AUDIT_ACTIONS } = require('../modules/audit/audit.model');
const ROLES = require('../constants/roles');
const logger = require('./logger');

const seedDB = async () => {
    try {
        await mongoose.connect(env.MONGODB_URI);
        logger.info('Connected to MongoDB for seeding...');

        // 1. Clear existing data
        await User.deleteMany({});
        await Department.deleteMany({});
        await Faculty.deleteMany({});
        await Institute.deleteMany({});
        await Office.deleteMany({});
        logger.info('Cleared existing Users, Departments, Faculties, Institutes, and Offices.');

        // 2. Create Institute
        const institute = await Institute.create({
            name: 'Arba Minch Institute of Technology',
            abbreviation: 'AMIT',
            description: 'Leading Research and Technology Institute in Ethiopia'
        });
        logger.info(`Seeded Institute: ${institute.name} (${institute.customId})`);

        // 3. Create Faculty
        const faculty = await Faculty.create({
            name: 'Faculty of Computing and Software Engineering',
            abbreviation: 'FCSE',
            description: 'Faculty of Computing and Software Engineering',
            institute: institute.customId
        });
        logger.info(`Seeded Faculty: ${faculty.name} (${faculty.customId})`);

        // 4. Create Department under Faculty
        const deanOffice = await Department.create({
            name: 'Dean Office',
            abbreviation: 'DO',
            description: 'Main Administration and Dean\'s Office',
            faculty: faculty.customId
        });
        logger.info(`Seeded Department: ${deanOffice.name} (${deanOffice.customId})`);

        // 5. Seed an Admin User
        const admin = await User.create({
            name: 'Desta Shewa',
            email: 'destashewa67@gmail.com',
            password: 'admin1234',
            role: ROLES.ADMIN,
            status: 'Available',
        });
        logger.info(`Seeded Admin User: ${admin.email} (${admin.customId})`);

        // Audit Logging for Seeding
        await AuditLog.create({
            actor: admin.customId || 'SYSTEM-SEED',
            action: AUDIT_ACTIONS.DEPARTMENT_CREATED || 'DEPARTMENT_CREATED',
            targetType: 'Department',
            targetId: deanOffice.customId,
            details: { name: deanOffice.name, note: 'Initial system seeding' }
        });

        logger.info('Database Seeded Successfully! 🚀');
        process.exit(0);
    } catch (error) {
        logger.error(`Error Seeding Database: ${error.message}`);
        process.exit(1);
    }
};

seedDB();

