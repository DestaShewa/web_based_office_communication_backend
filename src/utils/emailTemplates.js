/**
 * Reusable HTML Email Templates for amitcs
 * Designed for professional look, responsive layout, and cross-client compatibility.
 */

const colors = {
    primary: '#1e3a5f',
    secondary: '#334155',
    accent: '#0ea5e9',
    background: '#f8fafc',
    white: '#ffffff',
    text: '#1e293b',
    lightText: '#64748b',
    border: '#e2e8f0',
    success: '#10b981',
    warning: '#f59e0b',
    danger: '#ef4444'
};

/**
 * Wraps content in a standard institutional layout
 */
const baseLayout = (content, title = 'Notification') => `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap');
        body { font-family: 'Inter', Arial, sans-serif; margin: 0; padding: 0; background-color: ${colors.background}; color: ${colors.text}; -webkit-font-smoothing: antialiased; }
        .wrapper { width: 100%; table-layout: fixed; background-color: ${colors.background}; padding: 40px 0; }
        .container { max-width: 600px; margin: 0 auto; background-color: ${colors.white}; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); border: 1px solid ${colors.border}; }
        .header { background-color: ${colors.primary}; padding: 32px; text-align: center; }
        .content { padding: 40px; line-height: 1.6; }
        .footer { padding: 24px; text-align: center; font-size: 12px; color: ${colors.lightText}; background-color: #f1f5f9; }
        .button { display: inline-block; padding: 12px 28px; background-color: ${colors.accent}; color: ${colors.white} !important; text-decoration: none; border-radius: 8px; font-weight: 700; font-size: 14px; margin-top: 24px; text-transform: uppercase; letter-spacing: 0.5px; }
        .badge { display: inline-block; padding: 4px 12px; border-radius: 9999px; font-size: 11px; font-weight: 700; text-transform: uppercase; }
        .info-card { background-color: #f8fafc; border: 1px solid ${colors.border}; border-radius: 12px; padding: 20px; margin: 20px 0; }
        h1 { margin: 0; font-size: 24px; font-weight: 700; color: ${colors.white}; }
        h2 { margin: 0 0 16px 0; font-size: 20px; font-weight: 700; color: ${colors.primary}; }
        p { margin: 0 0 16px 0; font-size: 15px; }
        @media only screen and (max-width: 600px) {
            .container { width: 95% !important; border-radius: 0 !important; }
            .content { padding: 24px !important; }
        }
    </style>
</head>
<body>
    <div class="wrapper">
        <div class="container">
            <div class="header">
                <h1>AMITCS</h1>
                <div style="font-size: 10px; color: ${colors.accent}; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; margin-top: 4px;">Office Communication System</div>
            </div>
            <div class="content">
                ${content}
            </div>
            <div class="footer">
                <p style="margin-bottom: 8px;"><strong>Institutional Oversight & Strategy</strong></p>
                <p style="margin-bottom: 0;">This is an automated institutional message. Please do not reply directly.</p>
                <div style="margin-top: 16px; border-top: 1px solid ${colors.border}; padding-top: 16px;">
                    © ${new Date().getFullYear()} AMITCS System. All Rights Reserved.
                </div>
            </div>
        </div>
    </div>
</body>
</html>
`;

/**
 * Standard templates
 */
const templates = {
    // Welcome Email
    welcome: (user, password) => baseLayout(`
        <h2>Welcome to the Team, ${user.name}!</h2>
        <p>Your account on the <strong>AMIT Official Communication System (AMITCS)</strong> has been successfully provisioned by the administration.</p>
        <div class="info-card" style="border-left: 4px solid ${colors.success};">
            <p style="color: ${colors.success}; font-weight: 700; font-size: 13px; text-transform: uppercase; margin-bottom: 8px;">Your Temporary Password</p>
            <p style="font-size: 20px; font-family: monospace; letter-spacing: 2px; margin: 0; font-weight: 700; color: ${colors.primary};">
                ${password}
            </p>
        </div>
        <p style="color: ${colors.danger}; font-size: 13px; font-weight: 600;">
            <strong>Immediate Action:</strong> For security compliance, you are required to change this temporary password during your first session.
        </p>
        <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/login" class="button">Access Dashboard</a>
    `, 'Welcome to AMITCS'),

    // OTP Email
    otp: (user, otp) => baseLayout(`
        <h2>Security Verification</h2>
        <p>Hello ${user.name}, we received a request to verify your identity for a password reset. Use the following code to proceed:</p>
        <div style="text-align: center; padding: 32px 0;">
            <div style="font-size: 48px; font-weight: 700; letter-spacing: 12px; color: ${colors.accent}; font-family: monospace;">
                ${otp}
            </div>
        </div>
        <div style="background-color: #fffbeb; border: 1px solid #fde68a; padding: 16px; border-radius: 8px; font-size: 13px; color: #92400e;">
            <strong>Expiry Notice:</strong> This secure code will expire in 10 minutes. If you did not initiate this request, please secure your account immediately.
        </div>
    `, 'Security Verification'),

    // Security Alert
    securityAlert: (user, details) => baseLayout(`
        <div style="text-align: center; margin-bottom: 24px;">
            <span class="badge" style="background-color: ${colors.danger}; color: ${colors.white}; padding: 6px 16px;">Security Warning</span>
        </div>
        <h2>Unusual Activity Detected</h2>
        <p>Dear ${user.name}, our security systems have logged multiple failed login attempts on your account. This may indicate an unauthorized access attempt.</p>
        <div class="info-card" style="border-left: 4px solid ${colors.danger};">
            <p style="margin: 0; font-size: 14px; font-weight: 600; color: ${colors.danger};">What happened?</p>
            <p style="margin: 8px 0 0 0; font-size: 14px; color: ${colors.secondary};">${details || 'Multiple consecutive failed password entries detected.'}</p>
        </div>
        <p><strong>Recommended Actions:</strong></p>
        <ul style="font-size: 14px; color: ${colors.secondary};">
            <li>Change your password if it is weak.</li>
            <li>Report suspicious behavior to your supervisor.</li>
        </ul>
        <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/login" class="button">Review Account Activity</a>
    `, 'Security Alert'),

    // Deactivation
    deactivation: (user) => baseLayout(`
        <h2>Account Deactivation Notice</h2>
        <p>Dear ${user.name}, this message is to inform you that your institutional access to <strong>AMITCS</strong> has been deactivated by a system administrator.</p>
        <div class="info-card" style="border-left: 4px solid ${colors.secondary}; background-color: #f1f5f9;">
            <p style="margin: 0; font-size: 14px; font-weight: 500;">Access to messaging, task management, and departmental collaboration has been suspended effective immediately.</p>
        </div>
        <p>If you believe this is an error or need to retrieve critical data, please contact your direct supervisor.</p>
    `, 'Account Deactivation'),

    // Task Assigned
    taskAssigned: (user, task, assigner) => baseLayout(`
        <div style="text-align: center; margin-bottom: 24px;">
            <span class="badge" style="background-color: ${colors.accent}; color: ${colors.white}; padding: 6px 16px;">New Assignment</span>
        </div>
        <h2>Task: ${task.title}</h2>
        <p>${assigner.name} has assigned a new operational task to you.</p>
        
        <div class="info-card">
            <table width="100%" cellspacing="0" cellpadding="0">
                <tr>
                    <td style="padding-bottom: 12px; font-size: 12px; color: ${colors.lightText}; text-transform: uppercase; font-weight: 700;">Deadline</td>
                    <td style="padding-bottom: 12px; font-size: 12px; color: ${colors.lightText}; text-transform: uppercase; font-weight: 700;">Priority</td>
                </tr>
                <tr>
                    <td style="font-weight: 700; color: ${colors.primary};">${new Date(task.dueDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</td>
                    <td>
                        <span style="color: ${task.priority === 'urgent' ? colors.danger : task.priority === 'high' ? colors.warning : colors.success}; font-weight: 700; text-transform: capitalize;">
                            ${task.priority}
                        </span>
                    </td>
                </tr>
            </table>
            <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid ${colors.border};">
                <p style="font-size: 12px; color: ${colors.lightText}; text-transform: uppercase; font-weight: 700; margin-bottom: 4px;">Context/Description</p>
                <p style="font-size: 14px; margin: 0; color: ${colors.secondary};">${task.description || 'No additional details provided.'}</p>
            </div>
        </div>
        
        <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/${user.role || 'staff'}/tasks" class="button">Open Task Manager</a>
    `, 'New Task Assigned'),

    // Meeting Invitation
    meetingInvite: (user, meeting, organizer) => baseLayout(`
        <div style="text-align: center; margin-bottom: 24px;">
            <span class="badge" style="background-color: ${colors.primary}; color: ${colors.white}; padding: 6px 16px;">Meeting Invitation</span>
        </div>
        <h2>${meeting.title}</h2>
        <p>${organizer.name} has invited you to a meeting.</p>
        
        <div class="info-card" style="border-left: 4px solid ${colors.accent};">
            <table width="100%" cellspacing="0" cellpadding="0">
                <tr>
                    <td style="padding-bottom: 8px;"><strong style="font-size: 13px; color: ${colors.lightText};">EVENT DATE</strong></td>
                    <td style="padding-bottom: 8px; font-weight: 700;">${new Date(meeting.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</td>
                </tr>
                <tr>
                    <td style="padding-bottom: 8px;"><strong style="font-size: 13px; color: ${colors.lightText};">START TIME</strong></td>
                    <td style="padding-bottom: 8px; font-weight: 700;">${meeting.time} <span style="font-size: 11px; font-weight: 400; color: ${colors.lightText};">(${meeting.duration}m)</span></td>
                </tr>
                <tr>
                    <td><strong style="font-size: 13px; color: ${colors.lightText};">LOCATION</strong></td>
                    <td style="font-weight: 700; border-bottom: 1px dashed ${colors.border}; padding: 4px 0;">${meeting.location}</td>
                </tr>
            </table>
            <div style="margin-top: 12px; font-style: italic; font-size: 13px; color: ${colors.secondary};">
                "${meeting.agenda || meeting.description || 'No agenda specified.'}"
            </div>
        </div>
        
        <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/${user.role || 'staff'}/meetings" class="button">View Meeting Record</a>
    `, 'Meeting Invitation'),

    // Email Change OTP
    emailChangeOtp: (user, otp) => baseLayout(`
        <h2>Email Change Verification</h2>
        <p>Hello ${user.name}, you requested to change your official email address. Please use the verification code below to confirm this change:</p>
        <div style="text-align: center; padding: 32px 0;">
            <div style="font-size: 48px; font-weight: 700; letter-spacing: 12px; color: ${colors.success}; font-family: monospace;">
                ${otp}
            </div>
        </div>
        <p>This code will expire in 10 minutes. If you did not request this change, please ignore this email and your account will remain secure.</p>
    `, 'Verify New Email Address'),

    // Email Change Notification
    emailChangeNotification: (user, oldEmail) => baseLayout(`
        <div style="text-align: center; margin-bottom: 24px;">
            <span class="badge" style="background-color: ${colors.success}; color: ${colors.white}; padding: 6px 16px;">Update Successful</span>
        </div>
        <h2>Email Address Changed</h2>
        <p>Dear ${user.name}, your account email address has been successfully updated from <strong>${oldEmail}</strong> to <strong>${user.email}</strong>.</p>
        <p>If you did not perform this action, please contact the IT administration immediately to secure your account.</p>
    `, 'Email Address Updated')
};

module.exports = {
    templates
};
