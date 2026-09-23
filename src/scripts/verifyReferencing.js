const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../../.env') });

const connectDB = require('../config/db.config');
const userService = require('../modules/users/user.service');
const taskService = require('../modules/tasks/task.service');
const Department = require('../modules/departments/department.model');
const User = require('../modules/users/user.model');
const Task = require('../modules/tasks/task.model');

const verifyReferencing = async () => {
    try {
        await connectDB();
        console.log('Connected to DB. Verifying Custom ID Referencing...');

        // 1. Get a user with a customId
        const testUser = await User.findOne({ customId: { $ne: null } }).populate('department');
        if (!testUser) {
            console.error('No user with customId found. Please run backfillIds.js first.');
            process.exit(1);
        }

        console.log(`\n--- Test 1: User Population ---`);
        console.log(`User: ${testUser.name} (CID: ${testUser.customId})`);
        console.log(`Populated Dept CID: ${testUser.department.customId}`);
        if (testUser.department.customId) {
            console.log('✅ SUCCESS: Population includes customId.');
        } else {
            console.error('❌ FAILED: Population missing customId.');
        }

        // 2. Query Tasks by User CustomId
        console.log(`\n--- Test 2: Query by CustomId ---`);
        console.log(`Querying tasks for User CID: ${testUser.customId}`);
        const tasks = await taskService.getTasksForUser(testUser.customId);
        console.log(`Found ${tasks.length} tasks.`);
        console.log('✅ SUCCESS: Querying by customId works.');

        // 3. Verify task population
        if (tasks.length > 0) {
            console.log(`\n--- Test 3: Task Population ---`);
            const task = tasks[0];
            console.log(`Task: ${task.title}`);
            console.log(`Populated Assignee CID: ${task.assignee.customId || 'No assignee (unpopulated)'}`);
            console.log(`Populated Dept CID: ${task.department.customId || 'No dept'}`);
        }

        console.log('\nFinal Verification Complete.');
        process.exit(0);
    } catch (err) {
        console.error('❌ FAILED: Verification encountered an error:', err);
        process.exit(1);
    }
};

verifyReferencing();
