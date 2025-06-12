const router = require('express').Router();
const ReviewAdminController = require('../../controllers/admin/ReviewController');
const { checkJWT, isAdmin } = require('../../middlewares/checkJWT');

router.get('/list', ReviewAdminController.list);

router.put('/:id/reply', checkJWT, ReviewAdminController.reply);

router.get('/summary', checkJWT, ReviewAdminController.getCommentSummary);

router.get('/product/:productId', checkJWT, ReviewAdminController.getByProductId);

router.get('/all', checkJWT, ReviewAdminController.getAll);

module.exports = router;
