const express = require('express');
const messageController = require('./message.controller');
const { protect } = require('../../middlewares/auth.middleware');
const uploadVoice = require('../../middlewares/uploadVoice.middleware');
const uploadFile = require('../../middlewares/uploadFile.middleware');
const { uploadGroupPhoto } = require('../../config/multer.config');

const router = express.Router();

// All message routes are protected
router.use(protect);

router.get('/conversations', messageController.getConversations);
router.get('/unread/count', messageController.getUnreadCount);
router.patch('/:userId/read', messageController.markAsRead);
router.get('/history/:userId', messageController.getChatHistory);
router.get('/department/:deptId', messageController.getDepartmentChat);

// Group management routes
router.get('/groups', messageController.getGroups);
router.post('/groups', messageController.createGroup);
router.get('/group/:groupId', messageController.getGroupChat);
router.delete('/groups/:groupId', messageController.deleteGroup);
router.delete('/groups/:groupId/members/:memberId', messageController.removeGroupMember);
router.post('/groups/:groupId/members', messageController.addGroupMembers);
router.patch('/groups/:groupId/photo', uploadGroupPhoto, messageController.updateGroupPhoto);
router.post('/upload', uploadFile.single('file'), messageController.uploadFile);

router.post(
    '/file',
    uploadFile.single('file'),
    messageController.sendFileMessage
);

router.post(
    '/voice',
    uploadVoice.single('audio'),
    messageController.sendVoiceMessage
);

router.patch('/:messageId', messageController.editMessage);
router.delete('/:messageId', messageController.deleteMessage);
router.post('/forward', messageController.forwardMessages);

module.exports = router;
