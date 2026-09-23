require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../modules/users/user.model');
const Department = require('../modules/departments/department.model');
const userService = require('../modules/users/user.service');

const main = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to DB');

        const staffUser = await User.findOne({ role: 'director', isActive: true });
        if (!staffUser) {
            console.log('No director found');
            process.exit(0);
        }

        console.log(`\nTesting Directory Fetch for MONITORING (No Purpose) simulating login as Director: ${staffUser.username}`);
        const resultFull = await userService.getAllUsers({}, 100, 1, staffUser);
        console.log(`- Monitoring available: ${resultFull.total} users.`);

        console.log(`\nTesting Directory Fetch for MESSAGING (Purpose=messaging) simulating login as Director: ${staffUser.username}`);
        const resultMessaging = await userService.getAllUsers({ purpose: 'messaging' }, 100, 1, staffUser);
        console.log(`- Messaging available: ${resultMessaging.total} users.`);
        
        console.log('\n--- FETCHED MESSAGING DIRECTORY RESULTS ---');
        resultMessaging.users.forEach(u => {
            console.log(`- ${u.role.toUpperCase()}: ${u.name} (CustomId: ${u.customId})`);
        });

    } catch (err) {
        console.error('Error during test', err);
    } finally {
        await mongoose.disconnect();
    }
};

main();
