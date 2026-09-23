const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

// Load env vars
dotenv.config({ path: path.join(__dirname, '../../.env') });

const connectDB = require('../config/db.config');
const Department = require('../modules/departments/department.model');
const User = require('../modules/users/user.model');
const Task = require('../modules/tasks/task.model');
const Meeting = require('../modules/meetings/meeting.model');
const Counter = require('../modules/system_configs/counter.model');

const runVerification = async () => {
    try {
        await connectDB();
        console.log('Connected to DB...');

        // Clean up test data (optional but safer for repeatability if using a test DB)
        // For now, we just create and check.

        // 1. Test Department ID
        console.log('\n--- Testing Department ID ---');
        const dept = await Department.create({
            name: 'Computer Science and Information Technology ' + Date.now(),
            abbreviation: 'CSIT',
            description: 'Test Department'
        });
        console.log(`Created Department: ${dept.name}`);
        console.log(`Generated ID: ${dept.customId}`);
        if (dept.customId.startsWith('CSIT-AMIT-')) {
            console.log('✅ Department ID Correct');
        } else {
            console.log('❌ Department ID Incorrect');
        }

        // 2. Test User ID
        console.log('\n--- Testing User ID ---');
        const user = await User.create({
            name: 'Test Administrator',
            email: `admin_${Date.now()}@test.com`,
            password: 'password123',
            role: 'admin',
            department: dept._id
        });
        console.log(`Created User: ${user.name} (Role: ${user.role})`);
        console.log(`Generated ID: ${user.customId}`);
        if (user.customId.startsWith('CSIT-ADM-')) {
            console.log('✅ User ID Correct');
        } else {
            console.log('❌ User ID Incorrect');
        }

        const employee = await User.create({
            name: 'Test Employee',
            email: `emp_${Date.now()}@test.com`,
            password: 'password123',
            role: 'employee',
            department: dept._id
        });
        console.log(`Created User: ${employee.name} (Role: ${employee.role})`);
        console.log(`Generated ID: ${employee.customId}`);
        if (employee.customId.startsWith('CSIT-EMP-')) {
            console.log('✅ Employee ID Correct');
        } else {
            console.log('❌ Employee ID Incorrect');
        }

        // 3. Test Others (Task)
        console.log('\n--- Testing Task ID ---');
        const task = await Task.create({
            title: 'Test Task',
            description: 'Testing custom ID',
            assigner: user._id,
            assignee: employee._id,
            department: dept._id,
            dueDate: new Date(Date.now() + 86400000)
        });
        console.log(`Created Task: ${task.title}`);
        console.log(`Generated ID: ${task.customId}`);
        const year = new Date().getFullYear();
        if (task.customId.startsWith(`TASK-${year}-`)) {
            console.log('✅ Task ID Correct');
        } else {
            console.log('❌ Task ID Incorrect');
        }

        console.log('\nVerification Complete.');
        process.exit(0);
    } catch (err) {
        if (err.name === 'ValidationError') {
            console.error('Validation Error Details:');
            for (let field in err.errors) {
                console.error(`- ${field}: ${err.errors[field].message}`);
            }
        } else {
            console.error('Error during verification:', err);
        }
        process.exit(1);
    }
};

runVerification();
