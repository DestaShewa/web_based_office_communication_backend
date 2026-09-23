const mongoose = require('mongoose');
const env = require('../config/env.config');
const Institute = require('../modules/institutes/institute.model');
const Faculty = require('../modules/faculties/faculty.model');
const Counter = require('../modules/system_configs/counter.model');
const logger = require('./logger');

const seedOrgStructure = async () => {
    try {
        await mongoose.connect(env.MONGODB_URI);
        logger.info('Connected to MongoDB for Organizational Structure seeding...');

        // 1. Clear existing organization data to prevent unique constraint errors
        // Note: We don't clear users here to protect existing Admin accounts.
        await Institute.deleteMany({});
        await Faculty.deleteMany({});
        await Counter.deleteMany({ key: { $in: ['INST', 'AMIT'] } }); // Reset counters for these units
        
        logger.info('Cleared existing Institutes, Faculties, and relevant Counters.');

        // 2. Seed Institute
        const instituteData = {
            name: 'Arba Minch Institute of Technology',
            abbreviation: 'AMIT',
            description: 'Established in September 1997, Arba Minch Institute of Technology (AMiT) evolved from the Arba Minch Water Technology Institute (AWTi) by expanding its programs to include Civil, Electrical, and Mechanical Engineering, alongside water-related fields.',
            customId: 'AMU-AMIT-2026'
        };

        const institute = await Institute.create(instituteData);
        logger.info(`Seeded Institute: ${institute.name} [${institute.customId}]`);

        // 3. Seed Faculties
        const facultiesData = [
            {
                name: 'Architecture and Urban Planning',
                abbreviation: 'AUP',
                description: 'Focuses on sustainable urban design and architectural excellence.',
                institute: institute.customId
            },
            {
                name: 'Civil Engineering',
                abbreviation: 'CE',
                description: 'Core engineering faculty dedicated to infrastructure and structural design.',
                institute: institute.customId
            },
            {
                name: 'Computing and Software Engineering',
                abbreviation: 'CSE',
                description: 'Center for excellence in software development and computer science.',
                institute: institute.customId
            },
            {
                name: 'Electrical and Computer Engineering',
                abbreviation: 'ECE',
                description: 'Driving innovation in electrical systems and computer hardware/software integration.',
                institute: institute.customId
            },
            {
                name: 'Mechanical Engineering',
                abbreviation: 'ME',
                description: 'Focuses on advanced mechanical systems and manufacturing technology.',
                institute: institute.customId
            }
        ];

        // We use a loop to ensure pre-save hooks (IdGenerator) run sequentially for correct increments
        for (const fac of facultiesData) {
            const createdFac = await Faculty.create(fac);
            logger.info(`Seeded Faculty: ${createdFac.name} [${createdFac.customId}]`);
        }

        logger.info('Organizational Structure seeding completed successfully! 🚀');
        process.exit(0);
    } catch (error) {
        logger.error(`Error Seeding Org Structure: ${error.message}`);
        process.exit(1);
    }
};

seedOrgStructure();
