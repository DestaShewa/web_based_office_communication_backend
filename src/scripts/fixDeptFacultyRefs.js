/**
 * Migration: Fix department faculty references that point to non-existent faculty customIds.
 * Strategy: for each department with a broken faculty reference, find the real faculty
 * using a case-insensitive search and update the department to point to it.
 * Run: node src/scripts/fixDeptFacultyRefs.js
 */
require('dotenv').config();
const mongoose = require('mongoose');

const main = async () => {
    await mongoose.connect(process.env.MONGO_URI || process.env.DATABASE_URL || 'mongodb://localhost:27017/amitcs');
    console.log('Connected to MongoDB\n');

    const Department = require('../modules/departments/department.model');
    const Faculty = require('../modules/faculties/faculty.model');
    const User = require('../modules/users/user.model');

    const depts = await Department.find({});
    let fixedCount = 0;

    for (const dept of depts) {
        // Check if the faculty reference is valid (exact match)
        const exactMatch = await Faculty.findOne({ customId: dept.faculty });
        if (exactMatch) {
            console.log(`✅ [${dept.customId}] "${dept.name}" → faculty "${dept.faculty}" is valid.`);
            continue;
        }

        // Try case-insensitive match using the prefix (e.g. "CSE" from "CSE-AMIT-03")
        const prefix = dept.faculty ? dept.faculty.split('-')[0] : null;
        if (!prefix) {
            console.log(`⚠️  [${dept.customId}] "${dept.name}" → faculty field empty, skipping.`);
            continue;
        }

        const fuzzyMatch = await Faculty.findOne({
            customId: { $regex: new RegExp(`^${prefix}-`, 'i') }
        });

        if (fuzzyMatch) {
            console.log(`🔧 [${dept.customId}] "${dept.name}"`);
            console.log(`   Broken ref: "${dept.faculty}" → Correct: "${fuzzyMatch.customId}"`);

            // Use updateOne to bypass post-save hooks needing unregistered models
            await Department.updateOne({ customId: dept.customId }, { faculty: fuzzyMatch.customId });

            // Also update all users in this department who have the wrong faculty ref
            const userUpdateResult = await User.updateMany(
                { department: dept.customId, faculty: { $ne: fuzzyMatch.customId } },
                { faculty: fuzzyMatch.customId }
            );
            if (userUpdateResult.modifiedCount > 0) {
                console.log(`   Updated ${userUpdateResult.modifiedCount} user(s) faculty reference.`);
            }
            fixedCount++;

        } else {
            console.log(`❌ [${dept.customId}] "${dept.name}" → cannot resolve faculty "${dept.faculty}" — no fuzzy match found.`);
        }
    }

    // Ensure Faculty.dean is set for all dean users
    console.log('\n=== Syncing Faculty.dean from User records ===');
    const deans = await User.find({ role: 'dean', faculty: { $ne: null } });
    for (const dean of deans) {
        const faculty = await Faculty.findOne({ customId: dean.faculty });
        if (!faculty) {
            console.log(`❌ Dean [${dean.customId}] "${dean.name}" has faculty "${dean.faculty}" which doesn't exist.`);
            continue;
        }
        if (faculty.dean !== dean.customId) {
            console.log(`🔧 Faculty [${faculty.customId}] "${faculty.name}": setting dean → "${dean.customId}" ("${dean.name}")`);
            faculty.dean = dean.customId;
            await Faculty.updateOne({ customId: faculty.customId }, { dean: dean.customId });
        } else {
            console.log(`✅ Faculty [${faculty.customId}] dean is already correctly set to "${faculty.dean}".`);
        }
    }

    console.log(`\nDone. Fixed ${fixedCount} department(s).`);
    await mongoose.disconnect();
};

main().catch(err => { console.error(err); process.exit(1); });
