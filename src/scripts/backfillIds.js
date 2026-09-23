const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../../.env') });

const connectDB = require('../config/db.config');
const { generateSequentialId, ROLE_MAP } = require('../utils/idGenerator');

// Import all models
const Announcement = require('../modules/announcements/announcement.model');
const AuditLog = require('../modules/audit/audit.model').AuditLog;
const Department = require('../modules/departments/department.model');
const Meeting = require('../modules/meetings/meeting.model');
const Message = require('../modules/messages/message.model');
const Notification = require('../modules/notifications/notification.model');
const SystemConfig = require('../modules/system_configs/system_config.model');
const Task = require('../modules/tasks/task.model');
const User = require('../modules/users/user.model');

const models = [
    { name: 'Announcement', model: Announcement, prefix: (doc) => `ANN-${new Date(doc.createdAt).getFullYear()}` },
    { name: 'AuditLog', model: AuditLog, prefix: (doc) => `AUDIT-${new Date(doc.createdAt).getFullYear()}` },
    { name: 'Department', model: Department, prefix: (doc) => `${doc.abbreviation}-AMIT` },
    { name: 'Meeting', model: Meeting, prefix: (doc) => `MEET-${new Date(doc.createdAt).getFullYear()}` },
    { name: 'Message', model: Message, prefix: (doc) => `MSG-${new Date(doc.createdAt).getFullYear()}` },
    { name: 'Notification', model: Notification, prefix: (doc) => `NTF-${new Date(doc.createdAt).getFullYear()}` },
    { name: 'SystemConfig', model: SystemConfig, prefix: (doc) => `CONFIG-${new Date(doc.createdAt).getFullYear()}` },
    { name: 'Task', model: Task, prefix: (doc) => `TASK-${new Date(doc.createdAt).getFullYear()}` },
    { name: 'User', model: User, prefix: async (doc) => {
        const dept = await Department.findById(doc.department);
        const deptAbbr = dept ? dept.abbreviation : 'GEN';
        const roleAbbr = ROLE_MAP[doc.role] || 'EMP';
        return `${deptAbbr}-${roleAbbr}`;
    }}
];

const backfill = async () => {
    try {
        await connectDB();
        console.log('Connected to DB. Starting backfill...\n');

        // Resolve Department null/duplicate abbreviations
        console.log('Resolving Department abbreviation issues...');
        const missingAbbr = await Department.find({ $or: [{ abbreviation: null }, { abbreviation: { $exists: false } }] });
        console.log(`  Found ${missingAbbr.length} departments without abbreviation.`);
        
        for (const dept of missingAbbr) {
            const nameWords = dept.name.split(' ');
            let baseAbbr = nameWords.map(w => w[0]).join('').toUpperCase().substring(0, 5) || 'DEPT';
            
            let uniqueAbbr = baseAbbr;
            let counter = 1;
            while (await Department.findOne({ abbreviation: uniqueAbbr })) {
                uniqueAbbr = `${baseAbbr}${counter++}`;
            }
            
            dept.abbreviation = uniqueAbbr;
            await dept.save();
            console.log(`  Assigned abbreviation "${uniqueAbbr}" to department "${dept.name}"`);
        }

        // Handle duplicates
        const abbrFreq = await Department.aggregate([
            { $group: { _id: '$abbreviation', count: { $sum: 1 }, ids: { $push: '$_id' } } },
            { $match: { count: { $gt: 1 } } }
        ]);

        for (const freq of abbrFreq) {
            console.log(`  Fixing duplicates for abbreviation "${freq._id}"...`);
            for (let i = 1; i < freq.ids.length; i++) {
                const newAbbr = `${freq._id}_${i}`;
                await Department.updateOne({ _id: freq.ids[i] }, { $set: { abbreviation: newAbbr } });
                console.log(`    Renamed duplicate to "${newAbbr}"`);
            }
        }

        for (const item of models) {
            console.log(`Backfilling ${item.name}...`);
            const docs = await item.model.find({ customId: null });

            for (const doc of docs) {
                const prefix = typeof item.prefix === 'function' ? await item.prefix(doc) : item.prefix;
                const newId = await generateSequentialId(prefix, item.name === 'User' ? 3 : 2);
                await item.model.updateOne({ _id: doc._id }, { $set: { customId: newId } });
            }
            console.log(`  Finished ${item.name}.\n`);
            
            try {
                await item.model.createIndexes();
                console.log(`  ✅ Indexes enforced for ${item.name}.\n`);
            } catch (err) {
                console.error(`  ❌ Failed to enforce indexes for ${item.name}: ${err.message}\n`);
            }
        }

        console.log('Backfill and index enforcement complete.');
        process.exit(0);
    } catch (err) {
        console.error('Fatal error during backfill:', err);
        process.exit(1);
    }
};

backfill();
