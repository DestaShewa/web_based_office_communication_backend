/**
 * Migration: Fix user department/faculty references after dept customId changed.
 * CS users still point to CS-CSE-01 (old) and CSE-AMIT-03 (bad faculty).
 * Run: node src/scripts/fixUserDeptRefs.js
 */
require('dotenv').config();
const mongoose = require('mongoose');

const main = async () => {
    await mongoose.connect(process.env.MONGO_URI || process.env.DATABASE_URL || 'mongodb://localhost:27017/amitcs');
    console.log('Connected to MongoDB\n');

    const Department = require('../modules/departments/department.model');
    const Faculty = require('../modules/faculties/faculty.model');
    const User = require('../modules/users/user.model');

    // Get all valid departments and faculties for reference
    const depts = await Department.find({});
    const faculties = await Faculty.find({});

    console.log('=== Current Departments ===');
    depts.forEach(d => console.log(`  [${d.customId}] "${d.name}" | faculty: ${d.faculty}`));

    console.log('\n=== Fixing Users with Invalid department/faculty refs ===');

    const allUsers = await User.find({ role: { $in: ['staff', 'coordinator', 'dean'] } })
        .select('customId name role department faculty');

    for (const u of allUsers) {
        let needsUpdate = false;
        const updates = {};

        // Check department reference
        if (u.department) {
            const deptExists = depts.find(d => d.customId === u.department);
            if (!deptExists) {
                // Find by matching name OR find the department this user belongs to by checking
                // coordinator field or any staff membership
                console.log(`⚠️  User [${u.customId}] "${u.name}" has invalid department: "${u.department}"`);

                // Try to find correct dept by comparing prefixes (e.g. CS-CORD-001 → CS dept)
                const userPrefix = u.customId.split('-')[0]; // e.g. "CS"
                const correctDept = depts.find(d => {
                    const deptPrefix = d.customId.split('-')[0]; // e.g. "CS"
                    return deptPrefix === userPrefix;
                });

                if (correctDept) {
                    console.log(`   → Fixing department: "${u.department}" → "${correctDept.customId}"`);
                    updates.department = correctDept.customId;
                    needsUpdate = true;

                    // Find correct faculty for this department
                    const correctFaculty = faculties.find(f => f.customId === correctDept.faculty);
                    if (correctFaculty && u.faculty !== correctFaculty.customId) {
                        console.log(`   → Fixing faculty: "${u.faculty}" → "${correctFaculty.customId}"`);
                        updates.faculty = correctFaculty.customId;
                    }
                }
            } else {
                // Department is valid, but check faculty
                const correctFaculty = faculties.find(f => f.customId === deptExists.faculty);
                if (correctFaculty && u.faculty !== correctFaculty.customId) {
                    console.log(`⚠️  User [${u.customId}] "${u.name}" has wrong faculty: "${u.faculty}" → "${correctFaculty.customId}"`);
                    updates.faculty = correctFaculty.customId;
                    needsUpdate = true;
                }
            }
        }

        if (needsUpdate) {
            await User.updateOne({ customId: u.customId }, updates);
            console.log(`✅ Updated user [${u.customId}]`);
        }
    }

    // Also fix coordinator fields in departments that reference old user dept
    console.log('\n=== Fixing departments with no coordinator assigned (check by coordinator.department) ===');
    for (const dept of depts) {
        if (!dept.coordinator) {
            // Find any coordinator user in this dept
            const cord = await User.findOne({ department: dept.customId, role: 'coordinator' }).select('customId name');
            if (cord) {
                await Department.updateOne({ customId: dept.customId }, { coordinator: cord.customId });
                console.log(`✅ Set coordinator of [${dept.customId}] to [${cord.customId}] "${cord.name}"`);
            } else {
                console.log(`ℹ️  [${dept.customId}] has no coordinator user found.`);
            }
        }
    }

    // Final verification
    console.log('\n=== FINAL VERIFICATION ===');
    for (const dept of depts) {
        const deptFresh = await Department.findOne({ customId: dept.customId });
        const facultyDoc = await Faculty.findOne({ customId: deptFresh.faculty });
        console.log(`\nDept [${dept.customId}] "${dept.name}"`);
        console.log(`  faculty: ${deptFresh.faculty} → dean: ${facultyDoc?.dean || 'NONE'}`);
        const members = await User.find({ department: dept.customId }).select('customId name role faculty');
        members.forEach(m => console.log(`  member: [${m.customId}] "${m.name}" | role: ${m.role} | faculty: ${m.faculty}`));
        if (facultyDoc?.dean) {
            const dean = await User.findOne({ customId: facultyDoc.dean }).select('customId name role');
            if (dean) console.log(`  dean: [${dean.customId}] "${dean.name}" ← from Faculty.dean`);
        }
    }

    console.log('\nDone.');
    await mongoose.disconnect();
};

main().catch(err => { console.error(err); process.exit(1); });
