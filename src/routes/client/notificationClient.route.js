const express = require('express');
const router = express.Router();
const NotificationClientController = require('../../controllers/client/notificationClient.controller');
const { checkJWT } = require('../../middlewares/checkJWT');


router.get('/', checkJWT, NotificationClientController.getForCurrentUser);
router.patch('/:id/read', checkJWT, NotificationClientController.markAsRead);
router.patch('/read-all', checkJWT, NotificationClientController.markAllAsRead);

module.exports = router;
