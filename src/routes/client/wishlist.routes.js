const express = require('express');
const router = express.Router();
const WishlistController = require('../../controllers/client/wishlist.controller');
const { checkJWT } = require('../../middlewares/checkJWT');

router.get('/', checkJWT, WishlistController.getAll);

router.post('/:productId', checkJWT, WishlistController.add);

router.delete('/:productId', checkJWT, WishlistController.remove);

module.exports = router;
