const ROLES = require('../constants/roles');

/**
 * Checks if a sender is authorized to message a receiver.
 * @param {Object} sender The user object of the sender (must contain role, department, departments, faculty)
 * @param {Object} receiver The user object of the receiver (must contain role, department, departments, faculty)
 * @returns {boolean} true if authorized
 */
const isAuthorizedToMessage = (sender, receiver) => {
    // Directors can message:
    // - Everyone except Admin (unless specific logic added)
    // - Institutional Oversight means they can reach anyone
    if (sender.role === ROLES.DIRECTOR) {
        return true;
    }

    // Administrators can message:
    // - Deans
    // - Directors
    // - Other Admins
    if (sender.role === ROLES.ADMIN) {
        return receiver.role === ROLES.ADMIN || receiver.role === ROLES.DIRECTOR || receiver.role === ROLES.DEAN;
    }

    // Deans can message:
    // - Top-level roles (Admin, Director)
    // - Other Deans cross-faculty
    // - Coordinators and Staff strictly within their faculty
    if (sender.role === ROLES.DEAN) {
        if (receiver.role === ROLES.ADMIN || receiver.role === ROLES.DIRECTOR || receiver.role === ROLES.DEAN) {
            return true;
        }

        return receiver.faculty === sender.faculty;
    }

    // Coordinators can message:
    // - The Director (institution-wide)
    // - Their faculty dean
    // - Other coordinators in their faculty
    // - Staff members in their exact department
    if (sender.role === ROLES.COORDINATOR) {
        if (receiver.role === ROLES.DIRECTOR) {
            return true;
        }

        if (receiver.role === ROLES.ADMIN) {
            return false;
        }

        if (receiver.role === ROLES.DEAN || receiver.role === ROLES.COORDINATOR) {
            return receiver.faculty === sender.faculty;
        }

        if (receiver.role === ROLES.STAFF) {
            // Check for department intersection
            const senderDepts = [sender.department, ...(sender.departments || [])].filter(Boolean);
            const receiverDepts = [receiver.department, ...(receiver.departments || [])].filter(Boolean);
            if (senderDepts.some(dept => receiverDepts.includes(dept))) return true;

            // Check for office intersection
            if (sender.office && receiver.office && sender.office === receiver.office) return true;
        }

        return false;
    }

    // Staff can message:
    // - The Director (institution-wide)
    // - Other staff or coordinators in their department
    // - The dean of their faculty
    if (sender.role === ROLES.STAFF) {
        if (receiver.role === ROLES.DIRECTOR) {
            return true;
        }

        if (receiver.role === ROLES.ADMIN) {
            return false;
        }

        if (receiver.role === ROLES.DEAN) {
            return receiver.faculty === sender.faculty;
        }

        if (receiver.role === ROLES.STAFF || receiver.role === ROLES.COORDINATOR) {
            // Check for department intersection
            const senderDepts = [sender.department, ...(sender.departments || [])].filter(Boolean);
            const receiverDepts = [receiver.department, ...(receiver.departments || [])].filter(Boolean);
            if (senderDepts.some(dept => receiverDepts.includes(dept))) return true;

            // Check for office intersection
            if (sender.office && receiver.office && sender.office === receiver.office) return true;
        }

        return false;
    }

    return false;
};

module.exports = {
    isAuthorizedToMessage
};
