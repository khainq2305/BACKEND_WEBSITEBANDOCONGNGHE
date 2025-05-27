const express = require('express');
const router = express.Router();
const CartController = require('../../controllers/client/cartController');
const {checkJWT }= require('../../middlewares/checkJWT');

router.post('/add', checkJWT, CartController.addToCart);
// ✅ Lấy danh sách giỏ hàng
router.get('/my-cart', checkJWT, CartController.getCart);
router.put('/update-quantity', checkJWT, CartController.updateQuantity);

module.exports = router;
