const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const hpp = require('hpp');
const { rateLimit } = require('express-rate-limit');
const xss = require('xss');

const env = require('./config/env.config');
const logger = require('./utils/logger');
const errorHandler = require('./middlewares/error.middleware');
const notFound = require('./middlewares/notFound.middleware');
const sendResponse = require('./utils/apiResponse');

const path = require('path');
const app = express();

// 1. GLOBAL MIDDLEWARES

// Security Headers
app.use(helmet({
    crossOriginResourcePolicy: false,
}));

// CORS
const allowedOrigins = env.CLIENT_URL ? env.CLIENT_URL.split(',') : [];
app.use(cors({
    origin: function (origin, callback) {
        // In development, allow any local network origin to facilitate testing on different machines
        if (env.NODE_ENV === 'development') {
            return callback(null, true);
        }
        
        // In production, enforce strict origin list
        if (!origin || allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
}));

// Static file serving moved after cookieParser

// HTTP Logging
app.use(morgan('combined', { stream: { write: (message) => logger.http(message.trim()) } }));

// Rate Limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 500, // Limit each IP to 500 requests per windowMs
    message: 'Too many requests from this IP, please try again after 15 minutes',
});
app.use('/api', limiter);

// Body Parser
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// Cookie Parser
app.use(cookieParser(env.COOKIE_SECRET));

// Serve static files SECURELY from the uploads directory
app.use('/uploads', require('./middlewares/auth.middleware').protect, express.static(path.join(__dirname, '../uploads')));

// Data Sanitization against XSS and NoSQL Injection
const sanitize = (val) => {
    if (typeof val === 'string') return xss(val);
    if (Array.isArray(val)) return val.map(sanitize);
    if (typeof val === 'object' && val !== null) {
        return Object.keys(val).reduce((acc, key) => {
            // Prevent NoSQL Injection: strip keys starting with $
            if (key.startsWith('$')) return acc;

            acc[key] = sanitize(val[key]);
            return acc;
        }, {});
    }
    return val;
};

app.use((req, res, next) => {
    if (req.body) req.body = sanitize(req.body);
    if (req.query) req.query = sanitize(req.query);
    if (req.params) req.params = sanitize(req.params);
    next();
});

// Protect against HTTP Parameter Pollution
app.use(hpp());

// Compression
app.use(compression());

// Swagger Docs Setup
const swaggerUi = require('swagger-ui-express');
const swaggerDocument = require('./docs/swagger');
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// 2. ROUTES
const authRoutes = require('./modules/auth/auth.routes');
const userRoutes = require('./modules/users/user.routes');
const messageRoutes = require('./modules/messages/message.routes');
const taskRoutes = require('./modules/tasks/task.routes');
const announcementRoutes = require('./modules/announcements/announcement.routes');
const departmentRoutes = require('./modules/departments/department.routes');
const systemConfigRoutes = require('./modules/system_configs/system_config.routes');
const auditRoutes = require('./modules/audit/audit.routes');
const notificationRoutes = require('./modules/notifications/notification.routes');
const meetingRoutes = require('./modules/meetings/meeting.routes');
const reportRoutes = require('./modules/reports/report.routes');
const instituteRoutes = require('./modules/institutes/institute.routes');
const facultyRoutes = require('./modules/faculties/faculty.routes');
const officeRoutes = require('./modules/offices/office.routes');

// Mount Routes
const maintenanceMode = require('./middlewares/maintenance.middleware');
app.use('/api/v1', maintenanceMode);

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/messages', messageRoutes);
app.use('/api/v1/tasks', taskRoutes);
app.use('/api/v1/announcements', announcementRoutes);
app.use('/api/v1/departments', departmentRoutes);
app.use('/api/v1/system-configs', systemConfigRoutes);
app.use('/api/v1/audit', auditRoutes);
app.use('/api/v1/notifications', notificationRoutes);
app.use('/api/v1/meetings', meetingRoutes);
app.use('/api/v1/reports', reportRoutes);
app.use('/api/v1/institutes', instituteRoutes);
app.use('/api/v1/faculties', facultyRoutes);
app.use('/api/v1/offices', officeRoutes);
app.use('/api/v1/memos', require('./modules/memos/memo.routes'));

// Health Check
app.get('/health', (req, res) => {
    sendResponse(res, 200, 'Server is healthy and running!');
});

// Base Route
app.get('/', (req, res) => {
    res.status(200).json({
        message: 'Welcome to AMITCS Backend API',
        version: '1.0.0',
    });
});

// 3. ERROR HANDLING

// 404 handler
app.use(notFound);

// Global Error Handler
app.use(errorHandler);

module.exports = app;
