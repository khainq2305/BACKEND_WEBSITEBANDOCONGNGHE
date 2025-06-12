const router = require('express').Router();
const controller = require('../../controllers/client/productQuestionController');
const { clientSpamGuard } = require('../../middlewares/antiSpam');
const { checkJWT } = require('../../middlewares/checkJWT');

router.post('/create', checkJWT, clientSpamGuard, controller.create);

router.post('/reply', checkJWT, clientSpamGuard, controller.reply);

router.get('/product/:productId', controller.getByProductId);

module.exports = router;
