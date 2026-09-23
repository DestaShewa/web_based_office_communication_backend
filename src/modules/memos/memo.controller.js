const memoService = require('./memo.service');
const sendResponse = require('../../utils/apiResponse');
const catchAsync = require('../../utils/catchAsync');

const createMemo = catchAsync(async (req, res) => {
    const memoData = { ...req.body };
    if (req.files) {
        memoData.attachments = req.files.map(file => file.path);
    }
    const memo = await memoService.createMemo(memoData, req.user);
    sendResponse(res, 201, 'Memo created and dispatched successfully', { memo });
});

const getInbox = catchAsync(async (req, res) => {
    const memos = await memoService.getInbox(req.user);
    sendResponse(res, 200, 'Inbox retrieved successfully', { memos });
});

const getOutbox = catchAsync(async (req, res) => {
    const memos = await memoService.getOutbox(req.user);
    sendResponse(res, 200, 'Outbox retrieved successfully', { memos });
});

const markAsRead = catchAsync(async (req, res) => {
    const memo = await memoService.markAsRead(req.params.memoId, req.user);
    sendResponse(res, 200, 'Memo marked as read', { memo });
});

const getMemoDetails = catchAsync(async (req, res) => {
    const memo = await memoService.getMemoDetails(req.params.memoId, req.user);
    sendResponse(res, 200, 'Memo details retrieved', { memo });
});

const updateMemo = catchAsync(async (req, res) => {
    const memoData = { ...req.body };
    if (req.files) {
        memoData.attachments = req.files.map(file => file.path);
    }
    const memo = await memoService.updateMemo(req.params.memoId, memoData, req.user);
    sendResponse(res, 200, 'Memo updated successfully', { memo });
});

const deleteMemo = catchAsync(async (req, res) => {
    await memoService.deleteMemo(req.params.memoId, req.user);
    sendResponse(res, 204, 'Memo deleted successfully');
});

module.exports = {
    createMemo,
    getInbox,
    getOutbox,
    markAsRead,
    getMemoDetails,
    updateMemo,
    deleteMemo
};
