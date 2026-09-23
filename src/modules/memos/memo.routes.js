const express = require('express');
const memoController = require('./memo.controller');
const { protect, restrictTo } = require('../../middlewares/auth.middleware');
const ROLES = require('../../constants/roles');
const uploadMemo = require('../../middlewares/uploadMemo.middleware');

const router = express.Router();

router.use(protect);
router.use(restrictTo(ROLES.DIRECTOR, ROLES.DEAN, ROLES.COORDINATOR));

router.get('/inbox', memoController.getInbox);
router.get('/outbox', memoController.getOutbox);
router.get('/:memoId', memoController.getMemoDetails);
router.patch('/:memoId/read', memoController.markAsRead);

// Only Director, Dean, and Coordinator can create/update/delete memos
router.post(
    '/', 
    uploadMemo.array('attachments', 5), 
    memoController.createMemo
);

router.patch(
    '/:memoId', 
    uploadMemo.array('attachments', 5), 
    memoController.updateMemo
);

router.delete('/:memoId', memoController.deleteMemo);

module.exports = router;
