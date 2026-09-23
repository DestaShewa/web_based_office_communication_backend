/**
 * Evaluates the strength of a password based on institutional security criteria.
 * Strong: Minimum 8 characters, at least one uppercase, one lowercase, one number, and one special character.
 * 
 * @param {string} password - The plain-text password to evaluate.
 * @returns {Object} { isStrong: boolean, score: number, message: string }
 */
const evaluatePasswordStrength = (password) => {
    if (!password) {
        return { isStrong: false, score: 0, message: 'Password cannot be empty.' };
    }

    let score = 0;
    const requirements = [];

    // 1. Length Check
    if (password.length >= 8) {
        score += 1;
    } else {
        requirements.push('at least 8 characters');
    }

    // 2. Uppercase Check
    if (/[A-Z]/.test(password)) {
        score += 1;
    } else {
        requirements.push('an uppercase letter');
    }

    // 3. Lowercase Check
    if (/[a-z]/.test(password)) {
        score += 1;
    } else {
        requirements.push('a lowercase letter');
    }

    // 4. Number Check
    if (/[0-9]/.test(password)) {
        score += 1;
    } else {
        requirements.push('a number');
    }

    // 5. Special Character Check
    if (/[^A-Za-z0-9]/.test(password)) {
        score += 1;
    } else {
        requirements.push('a special character');
    }

    const isStrong = score === 5;
    let message = isStrong ? 'Strong' : 'Weak';

    if (!isStrong && requirements.length > 0) {
        // Construct helpful feedback
        message = `Weak: Needs ${requirements.join(', ')}.`;
    }

    return {
        isStrong,
        score,
        message
    };
};

module.exports = { evaluatePasswordStrength };
