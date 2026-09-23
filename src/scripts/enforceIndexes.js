const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

// Load env vars
dotenv.config({ path: path.join(__dirname, '../../.env') });

const connectDB = require('../config/db.config');

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
    { name: 'Announcement', model: Announcement, fields: ['customId'] },
    { name: 'AuditLog', model: AuditLog, fields: ['customId'] },
    { name: 'Department', model: Department, fields: ['customId', 'abbreviation', 'name'] },
    { name: 'Meeting', model: Meeting, fields: ['customId'] },
    { name: 'Message', model: Message, fields: ['customId'] },
    { name: 'Notification', model: Notification, fields: ['customId'] },
    { name: 'SystemConfig', model: SystemConfig, fields: ['customId'] },
    { name: 'Task', model: Task, fields: ['customId'] },
    { name: 'User', model: User, fields: ['customId', 'email'] }
];

const checkAndBuildIndexes = async () => {
    try {
        await connectDB();
        console.log('Connected to DB. Auditing unique constraints...\n');

        for (const item of models) {
            console.log(`Checking Model: ${item.name}`);
            
            for (const field of item.fields) {
                // Check for duplicates
                const duplicates = await item.model.aggregate([
                    { $match: { [field]: { $ne: null } } },
                    { $group: { _id: `$${field}`, count: { $sum: 1 } } },
                    { $match: { count: { $gt: 1 } } }
                ]);

                if (duplicates.length > 0) {
                    console.error(`  ❌ Duplicate found on field "${field}":`);
                    duplicates.forEach(d => {
                        console.error(`    - Value: "${d._id}", Count: ${d.count}`);
                    });
                } else {
                    console.log(`  ✅ No duplicates on field "${field}".`);
                }
            }

            // Attempt to build indexes
            try {
                await item.model.createIndexes();
                console.log(`  ✅ Indexes verified/built for ${item.name}.\n`);
            } catch (idxErr) {
                console.error(`  ⚠️  Failed to build indexes for ${item.name}: ${idxErr.message}\n`);
            }
        }

        console.log('Audit Complete.');
        process.exit(0);
    } catch (err) {
        console.error('Fatal error during audit:', err);
        process.exit(1);
    }
};

checkAndBuildIndexes();
