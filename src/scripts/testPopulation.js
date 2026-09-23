const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../../.env') });

const connectDB = require('../config/db.config');
const User = require('../modules/users/user.model');
const Department = require('../modules/departments/department.model');
const Task = require('../modules/tasks/task.model');

const verifyPopulation = async () => {
    try {
        await connectDB();
        console.log('--- Verification Started ---');

        // Test User -> Department population
        const user = await User.findOne({ department: { $exists: true } }).populate('departmentData');
        if (user) {
            console.log(`User: ${user.name}`);
            console.log(`Stored Department Link: ${user.department}`);
            console.log(`Populated Department Name: ${user.departmentData?.name || 'FAILED'}`);
            console.log(`Populated Department ID: ${user.departmentData?.customId || 'N/A'}`);
            
            // Check JSON transform
            const json = user.toJSON();
            console.log(`JSON department: ${typeof json.department === 'object' ? 'OBJECT (SUCCESS)' : 'STRING (STAYED AS ID)'}`);
        }

        // Test Task population
        const task = await Task.findOne({ assignee: { $exists: true } })
            .populate('assigneeData')
            .populate('departmentData');
            
        if (task) {
            console.log(`\nTask: ${task.title}`);
            console.log(`Populated Assignee: ${task.assigneeData?.name || 'FAILED'}`);
            console.log(`Populated Department: ${task.departmentData?.name || 'FAILED'}`);
            
            const taskJson = task.toJSON();
            console.log(`JSON assignee: ${typeof taskJson.assignee === 'object' ? 'OBJECT (SUCCESS)' : 'STRING'}`);
        }

        console.log('\n--- Verification Finished ---');
        process.exit(0);
    } catch (err) {
        console.error('Verification failed:', err);
        process.exit(1);
    }
};

verifyPopulation();
