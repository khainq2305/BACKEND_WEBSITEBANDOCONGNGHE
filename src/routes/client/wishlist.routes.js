const express = require('express');
const router = express.Router();
const WishlistController = require('../../controllers/client/wishlist.controller');
const { checkJWT } = require('../../middlewares/checkJWT');

router.get('/', checkJWT, WishlistController.getAll);

// POST: /api/client/wishlist/:productId (body: { skuId })
router.post('/:productId', checkJWT, WishlistController.add);

// DELETE: /api/client/wishlist/:productId/:skuId? (skuId optional)
router.delete('/:productId/:skuId', checkJWT, (req, res) => {
  console.log('🔥 Route matched: ', req.params);
  WishlistController.remove(req, res);
});

// Không có SKU
module.exports = router;
