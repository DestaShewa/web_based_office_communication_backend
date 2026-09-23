const { cleanEnv, str, port, url } = require('envalid');
const dotenv = require('dotenv');

dotenv.config();

const env = cleanEnv(process.env, {
    NODE_ENV: str({ choices: ['development', 'test', 'production'], default: 'development' }),
    PORT: port({ default: 5000 }),
    MONGODB_URI: str(),
    JWT_SECRET: str(),
    JWT_EXPIRES_IN: str({ default: '7d' }),
    COOKIE_SECRET: str(),
    CLIENT_URL: str({ default: 'http://localhost:5173' }),
    SMTP_HOST: str({ default: 'smtp.gmail.com' }),
    SMTP_PORT: port({ default: 587 }),
    SMTP_USER: str({ default: '' }),
    SMTP_PASS: str({ default: '' }),
    EMAIL_FROM: str({ default: 'noreply@amitcs.amit.edu.et' }),
});

module.exports = env;
