const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const Task = require('../src/modules/tasks/task.model');

async function migrate() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        const db = mongoose.connection.db;
        const collection = db.collection('tasks');
        const tasks = await collection.find({}).toArray();
        console.log(`Found ${tasks.length} tasks to process`);

        const conceptualGroups = {};

        for (const task of tasks) {
            // Handle legacy 'assignee' field if it exists and 'assignees' is empty
            const raw = task.toObject();
            const assigneeId = raw.assignee || raw.assignedTo;
            
            if (assigneeId && (!task.assignees || task.assignees.length === 0)) {
                // If it's a legacy task, we'll try to group it
                const key = `${task.title}-${task.description}-${task.assigner}-${task.dueDate ? new Date(task.dueDate).getTime() : 'nodate'}`;
                
                if (!conceptualGroups[key]) {
                    conceptualGroups[key] = {
                        masterId: task._id,
                        assignees: [{
                            user: assigneeId,
                            status: task.status || 'pending',
                            completedAt: task.status === 'completed' ? new Date() : null
                        }],
                        idsToDelete: []
                    };
                } else {
                    conceptualGroups[key].assignees.push({
                        user: assigneeId,
                        status: task.status || 'pending',
                        completedAt: task.status === 'completed' ? new Date() : null
                    });
                    conceptualGroups[key].idsToDelete.push(task._id);
                }
            }
        }

        console.log(`Identified ${Object.keys(conceptualGroups).length} unique task directives`);

        for (const key of Object.keys(conceptualGroups)) {
            const group = conceptualGroups[key];
            
            // Update the master task
            await Task.updateOne(
                { _id: group.masterId },
                { 
                    $set: { assignees: group.assignees },
                    $unset: { assignee: "", assignedTo: "", assignedBy: "" }
                }
            );

            // Delete the redundant tasks
            if (group.idsToDelete.length > 0) {
                await Task.deleteMany({ _id: { $in: group.idsToDelete } });
                console.log(`Deleted ${group.idsToDelete.length} redundant records for group: ${key.split('-')[0]}`);
            }
        }

        console.log('Migration completed successfully');
        process.exit(0);
    } catch (err) {
        console.error('Migration failed:', err);
        process.exit(1);
    }
}

migrate();
