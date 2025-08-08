const router = require('express').Router();
const controller = require('../../controllers/admin/productQuestionController');
const { adminReplySpamGuard } = require('../../middlewares/antiSpam');
const { checkJWT } = require('../../middlewares/checkJWT');
const { attachUserDetail } = require('../../middlewares/getUserDetail ');
const { authorize } = require('../../middlewares/authorize');
router.use(checkJWT);
router.use(attachUserDetail)
router.use(authorize("ProductQA"))
router.get('/', controller.getAll);

router.get('/:id', controller.getById);

router.post('/reply/:questionId', checkJWT, adminReplySpamGuard, controller.reply);

router.patch('/answer/:id/toggle', checkJWT, controller.toggleVisibility);

router.patch('/:questionId/toggle-visibility', checkJWT, controller.toggleQuestionVisibility);

module.exports = router;
