const router = require('express').Router();
const controller = require('../../controllers/admin/productQuestionController');
const { adminReplySpamGuard } = require('../../middlewares/antiSpam');
const { checkJWT } = require('../../middlewares/checkJWT');

router.get('/all', controller.getAll);

router.get('/:id', controller.getById);

router.post('/reply/:questionId', checkJWT, adminReplySpamGuard, controller.reply);

router.patch('/answer/:id/toggle', checkJWT, controller.toggleVisibility);

router.patch('/:questionId/toggle-visibility', checkJWT, controller.toggleQuestionVisibility);

module.exports = router;
