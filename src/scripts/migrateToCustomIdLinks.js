const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../../.env') });

const connectDB = require('../config/db.config');

// Import all models
const User = require('../modules/users/user.model');
const Department = require('../modules/departments/department.model');
const Task = require('../modules/tasks/task.model');
const Meeting = require('../modules/meetings/meeting.model');
const Announcement = require('../modules/announcements/announcement.model');
const Message = require('../modules/messages/message.model');
const Notification = require('../modules/notifications/notification.model');
const { AuditLog } = require('../modules/audit/audit.model');
const SystemConfig = require('../modules/system_configs/system_config.model');

const migrateReferences = async () => {
    try {
        await connectDB();
        console.log('Connected to DB. Starting migration to Custom ID storage links...');

        // 1. Build Global ID Map (_id -> customId)
        const idMap = new Map();
        
        const collections = [
            { model: User, name: 'User' },
            { model: Department, name: 'Department' },
            { model: Task, name: 'Task' },
            { model: Meeting, name: 'Meeting' },
            { model: Announcement, name: 'Announcement' },
            { model: Message, name: 'Message' },
            { model: Notification, name: 'Notification' },
            { model: AuditLog, name: 'AuditLog' },
            { model: SystemConfig, name: 'SystemConfig' }
        ];

        console.log('Building ID map...');
        for (const col of collections) {
            const docs = await col.model.find({}, '_id customId').lean();
            docs.forEach(doc => {
                if (doc.customId) {
                    idMap.set(doc._id.toString(), doc.customId);
                }
            });
        }
        console.log(`Mapped ${idMap.size} IDs.`);

        const resolve = (id) => {
            if (!id) return id;
            const strId = id.toString();
            return idMap.get(strId) || id; // Return customId if found, else original
        };

        // 2. Define update tasks
        const updateTasks = [
            {
                model: User,
                records: await User.find({}).lean(),
                process: doc => ({
                    department: resolve(doc.department)
                })
            },
            {
                model: Department,
                records: await Department.find({}).lean(),
                process: doc => ({
                    head: resolve(doc.head)
                })
            },
            {
                model: Task,
                records: await Task.find({}).lean(),
                process: doc => ({
                    assigner: resolve(doc.assigner),
                    assignee: resolve(doc.assignee),
                    department: resolve(doc.department),
                    comments: (doc.comments || []).map(c => ({ ...c, author: resolve(c.author) })),
                    reassignmentHistory: (doc.reassignmentHistory || []).map(r => ({
                        ...r,
                        previousAssignee: resolve(r.previousAssignee),
                        newAssignee: resolve(r.newAssignee),
                        reassignedBy: resolve(r.reassignedBy)
                    }))
                })
            },
            {
                process: doc => ({
                    department: resolve(doc.department),
                    uploader: resolve(doc.uploader),
                    sharedWith: (doc.sharedWith || []).map(id => resolve(id)),
                    approvalChain: (doc.approvalChain || []).map(a => ({ ...a, actor: resolve(a.actor) })),
                    versionHistory: (doc.versionHistory || []).map(v => ({ ...v, uploadedBy: resolve(v.uploadedBy) }))
                })
            },
            {
                model: Meeting,
                records: await Meeting.find({}).lean(),
                process: doc => ({
                    organizer: resolve(doc.organizer),
                    attendees: (doc.attendees || []).map(id => resolve(id)),
                    department: resolve(doc.department)
                })
            },
            {
                model: Announcement,
                records: await Announcement.find({}).lean(),
                process: doc => ({
                    author: resolve(doc.author),
                    department: resolve(doc.department),
                    readBy: (doc.readBy || []).map(r => ({ ...r, user: resolve(r.user) }))
                })
            },
            {
                model: Message,
                records: await Message.find({}).lean(),
                process: doc => ({
                    sender: resolve(doc.sender),
                    receiver: resolve(doc.receiver)
                })
            },
            {
                model: Notification,
                records: await Notification.find({}).lean(),
                process: doc => ({
                    recipient: resolve(doc.recipient)
                })
            },
            {
                model: AuditLog,
                records: await AuditLog.find({}).lean(),
                process: doc => ({
                    actor: resolve(doc.actor),
                    targetId: resolve(doc.targetId)
                })
            },
            {
                model: SystemConfig,
                records: await SystemConfig.find({}).lean(),
                process: doc => ({
                    updatedBy: resolve(doc.updatedBy)
                })
            }
        ];

        // 3. Execute Updates
        console.log('Executing migration updates...');
        for (const task of updateTasks) {
            console.log(`Updating ${task.model.modelName}...`);
            for (const doc of task.records) {
                const updates = task.process(doc);
                await task.model.updateOne({ _id: doc._id }, { $set: updates });
            }
        }

        console.log('✅ Migration to Custom ID links completed successfully.');
        process.exit(0);
    } catch (err) {
        console.error('❌ Migration failed:', err);
        process.exit(1);
    }
};

migrateReferences();
