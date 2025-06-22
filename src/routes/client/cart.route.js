const express = require('express');
const router = express.Router();
const CartController = require('../../controllers/client/cartController');
const {checkJWT }= require('../../middlewares/checkJWT');

router.post('/add', checkJWT, CartController.addToCart);

router.get('/my-cart', checkJWT, CartController.getCart);
router.put('/update-quantity', checkJWT, CartController.updateQuantity);
router.delete('/item/:id', checkJWT, CartController.deleteItem);
router.put('/update-selected', checkJWT, CartController.updateSelected);
// Xóa nhiều sản phẩm cùng lúc
router.post('/delete-multiple', checkJWT, CartController.deleteMultiple);

module.exports = router;
