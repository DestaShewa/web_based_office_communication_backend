const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../../.env') });

const connectDB = require('../config/db.config');
const Department = require('../modules/departments/department.model');

const verify = async () => {
    try {
        await connectDB();
        console.log('Connected to DB. Testing Uniqueness...\n');

        // 1. Test Department Abbreviation Uniqueness
        console.log('Test 1: Duplicate Department Abbreviation');
        const uniqueAbbr = `TEST-${Date.now()}`;
        
        await Department.create({
            name: `Test Dept ${Date.now()}`,
            abbreviation: uniqueAbbr,
            description: 'First dept'
        });
        console.log(`  Created first department with abbr "${uniqueAbbr}"`);

        try {
            await Department.create({
                name: `Test Dept ${Date.now()} Duplicate`,
                abbreviation: uniqueAbbr,
                description: 'Second dept - should fail'
            });
            console.error('  ❌ FAILED: Second department with same abbr was allowed!');
        } catch (err) {
            if (err.code === 11000) {
                console.log('  ✅ SUCCESS: System blocked duplicate department abbreviation.');
            } else {
                console.error('  ❌ FAILED: Unexpected error:', err.message);
            }
        }

        // 2. Test Department CustomId Uniqueness
        console.log('\nTest 2: Duplicate Department CustomId');
        const testDept = await Department.findOne({});
        if (testDept && testDept.customId) {
            try {
                await Department.create({
                    name: `Test Dept ${Date.now()} Duplicate CID`,
                    abbreviation: `ABBR${Date.now()}`,
                    customId: testDept.customId
                });
                console.error('  ❌ FAILED: Second department with same customId was allowed!');
            } catch (err) {
                if (err.code === 11000) {
                    console.log('  ✅ SUCCESS: System blocked duplicate department customId.');
                } else {
                    console.error('  ❌ FAILED: Unexpected error:', err.message);
                }
            }
        }

        console.log('\nVerification Complete.');
        process.exit(0);
    } catch (err) {
        console.error('Fatal error during verification:', err);
        process.exit(1);
    }
};

verify();
