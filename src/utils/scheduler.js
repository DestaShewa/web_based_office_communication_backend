const { checkOverdueTasks } = require('../modules/tasks/task.service');
const logger = require('./logger');

/**
 * Starts background maintenance tasks
 */
const initScheduler = () => {
    logger.info('Initializing System Task Scheduler...');

    // Runs once every minute to check for overdue tasks
    // Since this is a live communication system, 1-minute resolution is appropriate.
    const OVERDUE_CHECK_INTERVAL = 60 * 1000; 

    setInterval(async () => {
        try {
            const count = await checkOverdueTasks();
            if (count > 0) {
                logger.info(`Scheduler: Processed ${count} pending tasks for deadline audit.`);
            }
        } catch (err) {
            logger.error('Scheduler Error (checkOverdueTasks):', err);
        }
    }, OVERDUE_CHECK_INTERVAL);

    // Run once on startup
    checkOverdueTasks().catch(err => logger.error('Initial Scheduler Run Error:', err));
};

module.exports = { initScheduler };
