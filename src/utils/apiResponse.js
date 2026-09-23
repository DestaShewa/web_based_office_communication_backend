/**
 * @desc    Standard API Response
 */
const sendResponse = (res, statusCode, message, data = null) => {
    return res.status(statusCode).json({
        status: 'success',
        message,
        data,
    });
};

module.exports = sendResponse;
