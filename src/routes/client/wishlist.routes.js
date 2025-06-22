const express = require('express');
const router = express.Router();
const WishlistController = require('../../controllers/client/wishlist.controller');
const { checkJWT } = require('../../middlewares/checkJWT');

router.get('/', checkJWT, WishlistController.getAll);

// POST: /api/client/wishlist/:productId (body: { skuId })
router.post('/:productId', checkJWT, WishlistController.add);

// DELETE: /api/client/wishlist/:productId/:skuId? (skuId optional)
router.delete('/:productId/:skuId', checkJWT, WishlistController.remove);


module.exports = router;
