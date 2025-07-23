const router = require('express').Router();
const ReviewAdminController = require('../../controllers/admin/ReviewController');
const { checkJWT, isAdmin } = require('../../middlewares/checkJWT');
const { attachUserDetail } = require('../../middlewares/getUserDetail ');
const { authorize } = require('../../middlewares/authorize');
router.use(checkJWT);
router.use(attachUserDetail)
router.use(authorize("Comment"))
router.get('/list', ReviewAdminController.list);

router.put('/:id/reply', checkJWT, ReviewAdminController.reply);

router.get('/summary', checkJWT, ReviewAdminController.getCommentSummary);

router.get('/product/:productId', checkJWT, ReviewAdminController.getByProductId);

router.get('/all', checkJWT, ReviewAdminController.getAll);


module.exports = router;
