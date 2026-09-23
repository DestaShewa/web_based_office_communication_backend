const nodemailer = require('nodemailer');
const env = require('../config/env.config');
const { templates } = require('../utils/emailTemplates');

/**
 * Create reusable nodemailer transporter using SMTP settings from env
 */
const transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465, // true for 465, false for 587
    auth: {
        user: env.SMTP_USER,
        pass: env.SMTP_PASS,
    },
    // Force IPv4 connection to avoid ENETUNREACH issues with IPv6 on some networks
    // This fixes the 'connect ENETUNREACH' error when connecting to Gmail's SMTP
    family: 4, 
    connectionTimeout: 20000, // 20 seconds
});

/**
 * Core send function — wrapped in try/catch so email failures never break app flow
 */
const sendEmail = async ({ to, subject, html }) => {
    try {
        if (!env.SMTP_USER || !env.SMTP_PASS) {
            const logger = require('../utils/logger');
            logger.warn('Email not sent: SMTP credentials are not configured.');
            return;
        }
        await transporter.sendMail({
            from: `"AMITCS System" <${env.EMAIL_FROM}>`,
            to,
            subject,
            html,
        });
    } catch (err) {
        const logger = require('../utils/logger');
        logger.error(`Email send failed (to: ${to}): ${err.message}`);
    }
};

/**
 * Send a security alert email when failed login attempts exceed the threshold
 * @param {Object} user - Mongoose user document with at least { name, email }
 */
const sendSecurityAlertEmail = async (user) => {
    const subject = '⚠️ Security Alert: Multiple Failed Login Attempts Detected';
    const html = templates.securityAlert(user);
    await sendEmail({ to: user.email, subject, html });
};

/**
 * Send a deactivation notification email when a user account is deactivated
 * @param {Object} user - Mongoose user document with at least { name, email }
 */
const sendDeactivationEmail = async (user) => {
    const subject = 'Institutional Access Deactivated — AMITCS';
    const html = templates.deactivation(user);
    await sendEmail({ to: user.email, subject, html });
};

/**
 * Send a welcome email when a new account is created with a system-generated password
 * @param {Object} user - Mongoose user document { name, email }
 * @param {String} password - The plain-text generated password
 */
const sendWelcomeEmail = async (user, password) => {
    const subject = '🎉 Welcome to AMITCS! Your Account has been Created';
    const html = templates.welcome(user, password);
    await sendEmail({ to: user.email, subject, html });
};

/**
 * Send a 6-digit OTP for password reset verification
 * @param {Object} user - Mongoose user document { name, email }
 * @param {String} otp - The plain-text 6-digit OTP
 */
const sendPasswordResetOtp = async (user, otp) => {
    const subject = '🔐 Verify Your Identity — AMITCS Security';
    const html = templates.otp(user, otp);
    await sendEmail({ to: user.email, subject, html });
};

/**
 * Send a task assignment email
 * @param {Object} user - Recipient user
 * @param {Object} task - Task details
 * @param {Object} assigner - Assigner details
 */
const sendTaskAssignmentEmail = async (user, task, assigner) => {
    const subject = `📋 New Task Assigned: ${task.title}`;
    const html = templates.taskAssigned(user, task, assigner);
    await sendEmail({ to: user.email, subject, html });
};

/**
 * Send a meeting invitation email
 * @param {Object} user - Recipient user
 * @param {Object} meeting - Meeting details
 * @param {Object} organizer - Organizer details
 */
const sendMeetingInviteEmail = async (user, meeting, organizer) => {
    const subject = `📅 Meeting Invitation: ${meeting.title}`;
    const html = templates.meetingInvite(user, meeting, organizer);
    await sendEmail({ to: user.email, subject, html });
};

/**
 * Send an OTP for email change verification
 */
const sendEmailChangeOtp = async (user, otp, newEmail) => {
    const subject = '🔐 Verify Your New Email — AMITCS Security';
    const html = templates.emailChangeOtp(user, otp);
    await sendEmail({ to: newEmail, subject, html });
};

/**
 * Notify user that their email has been changed
 */
const sendEmailChangeNotification = async (user, oldEmail) => {
    const subject = '✅ Email Address Successfully Updated — AMITCS';
    const html = templates.emailChangeNotification(user, oldEmail);
    await sendEmail({ to: user.email, subject, html });
};

module.exports = {
    sendEmail,
    sendSecurityAlertEmail,
    sendDeactivationEmail,
    sendWelcomeEmail,
    sendPasswordResetOtp,
    sendTaskAssignmentEmail,
    sendMeetingInviteEmail,
    sendEmailChangeOtp,
    sendEmailChangeNotification,
};
