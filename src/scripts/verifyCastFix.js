const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../../.env') });

const connectDB = require('../config/db.config');
const userService = require('../modules/users/user.service');
const Department = require('../modules/departments/department.model');
const User = require('../modules/users/user.model');

const verifyFix = async () => {
    try {
        await connectDB();
        console.log('Connected to DB. Verifying CastError fix...');

        // 1. Find a department with a customId
        const dept = await Department.findOne({ customId: { $ne: null } });
        if (!dept) {
            console.error('No department with customId found. Please run backfillIds.js first.');
            process.exit(1);
        }

        console.log(`Using Department: ${dept.name} (customId: ${dept.customId})`);

        // 2. Try to create a user using the customId
        const testUserEmail = `fix-test-${Date.now()}@example.com`;
        const userData = {
            name: 'Fix Test User',
            email: testUserEmail,
            password: 'password123',
            role: 'employee',
            department: dept.customId // This is what caused the CastError
        };

        console.log('Attempting to create user with department customId...');
        const newUser = await userService.createUser(userData, dept.head, '127.0.0.1');
        
        console.log('✅ SUCCESS: User created successfully!');
        console.log(`New User Custom ID: ${newUser.customId}`);
        console.log(`Department Reference (ObjectId): ${newUser.department}`);

        if (newUser.department.toString() === dept._id.toString()) {
            console.log('✅ SUCCESS: Department customId correctly resolved to ObjectId.');
        } else {
            console.error('❌ FAILED: Department ID mismatch.');
        }

        // Cleanup
        await User.findByIdAndDelete(newUser._id);
        console.log('\nVerification Complete.');
        process.exit(0);
    } catch (err) {
        console.error('❌ FAILED: Verification encountered an error:', err);
        process.exit(1);
    }
};

verifyFix();
