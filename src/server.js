const http = require('http');
const { Server } = require('socket.io');
const app = require('./app');
const env = require('./config/env.config');
const connectDB = require('./config/db.config');
const logger = require('./utils/logger');

const server = http.createServer(app);

// Initialize Socket.io via utility
const socketUtil = require('./utils/socket');
const { verifySocketToken } = require('./middlewares/auth.middleware');
const io = socketUtil.init(server);

// Apply Security Middleware to Sockets
io.use(verifySocketToken);

// Make io accessible globally if needed (optional since we have getIO)
app.set('io', io);

const startServer = async () => {
    await connectDB();

    // Start background maintenance scheduler
    const { initScheduler } = require('./utils/scheduler');
    const { initUploadDirs } = require('./utils/dirInit');
    
    initUploadDirs();
    initScheduler();

    server.listen(env.PORT, '0.0.0.0', () => {
        const os = require('os');
        const networkInterfaces = os.networkInterfaces();
        let localIp = 'localhost';
        
        // Find the first IPv4 address that isn't internal
        Object.keys(networkInterfaces).forEach((ifname) => {
            networkInterfaces[ifname].forEach((iface) => {
                if (iface.family === 'IPv4' && !iface.internal) {
                    localIp = iface.address;
                }
            });
        });

        logger.info(`🚀 Server running in ${env.NODE_ENV} mode on port ${env.PORT}`);
        logger.info(`🔗 Local: http://localhost:${env.PORT}`);
        logger.info(`🌐 Network: http://${localIp}:${env.PORT}`);
    });
};

startServer();

// Handle unhandled rejections
process.on('unhandledRejection', (err) => {
    logger.error('UNHANDLED REJECTION! 💥 Shutting down...');
    logger.error(err.name, err.message);
    server.close(() => {
        process.exit(1);
    });
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
    console.error('UNCAUGHT EXCEPTION! 💥 Shutting down...');
    console.error(err);
    process.exit(1);
});
