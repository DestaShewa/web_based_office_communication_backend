/**
 * Debug script: check department → faculty → dean chain
 * Run: node src/scripts/debugDeptMembers.js
 */
require('dotenv').config();
const mongoose = require('mongoose');

const main = async () => {
    await mongoose.connect(process.env.MONGO_URI || process.env.DATABASE_URL || 'mongodb://localhost:27017/amitcs');

    const Department = require('../modules/departments/department.model');
    const Faculty = require('../modules/faculties/faculty.model');
    const User = require('../modules/users/user.model');

    console.log('\n=== ALL DEPARTMENTS ===');
    const depts = await Department.find({}).select('customId name faculty coordinator');
    depts.forEach(d => {
        console.log(`  [${d.customId}] "${d.name}" | faculty: "${d.faculty}" | coordinator: "${d.coordinator}"`);
    });

    console.log('\n=== ALL FACULTIES ===');
    const faculties = await Faculty.find({}).select('customId name dean');
    faculties.forEach(f => {
        console.log(`  [${f.customId}] "${f.name}" | dean: "${f.dean}"`);
    });

    console.log('\n=== ALL DEAN USERS ===');
    const deans = await User.find({ role: 'dean' }).select('customId name faculty department role');
    if (deans.length === 0) {
        console.log('  ⚠️  NO DEAN USERS FOUND IN DATABASE!');
    } else {
        deans.forEach(d => {
            console.log(`  [${d.customId}] "${d.name}" | faculty: "${d.faculty}" | department: "${d.department}"`);
        });
    }

    console.log('\n=== FULL CHAIN: dept → faculty → dean ===');
    for (const dept of depts) {
        console.log(`\n  Dept: [${dept.customId}] "${dept.name}"`);
        if (!dept.faculty) {
            console.log('    ❌ dept.faculty is NULL/EMPTY');
            continue;
        }
        const faculty = await Faculty.findOne({ customId: dept.faculty }).select('customId name dean');
        if (!faculty) {
            console.log(`    ❌ Faculty with customId "${dept.faculty}" NOT FOUND`);
            continue;
        }
        console.log(`    Faculty: [${faculty.customId}] "${faculty.name}" | dean field: "${faculty.dean}"`);
        if (!faculty.dean) {
            console.log('    ❌ faculty.dean is NULL — no dean assigned to this faculty!');
        } else {
            const dean = await User.findOne({ customId: faculty.dean }).select('customId name role faculty');
            if (!dean) {
                console.log(`    ❌ Dean user with customId "${faculty.dean}" NOT FOUND`);
            } else {
                console.log(`    ✅ Dean user: [${dean.customId}] "${dean.name}" | role: "${dean.role}" | faculty: "${dean.faculty}"`);
            }
        }
    }

    console.log('\n=== ALL USERS BY ROLE ===');
    const allUsers = await User.find({}).select('customId name role faculty department').sort('role name');
    const byRole = {};
    allUsers.forEach(u => {
        if (!byRole[u.role]) byRole[u.role] = [];
        byRole[u.role].push(u);
    });
    Object.entries(byRole).forEach(([role, users]) => {
        console.log(`\n  ${role.toUpperCase()}:`);
        users.forEach(u => {
            console.log(`    [${u.customId}] "${u.name}" | faculty: "${u.faculty}" | dept: "${u.department}"`);
        });
    });

    await mongoose.disconnect();
    console.log('\nDone.');
};

main().catch(err => { console.error(err); process.exit(1); });
