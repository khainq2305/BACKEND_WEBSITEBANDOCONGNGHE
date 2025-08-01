const express = require('express');
const router = express.Router();
const ProductController = require('../../controllers/admin/productController');
const { validateSimpleProduct } = require('../../validations/validateSimpleProduct');
const { attachUserDetail } = require('../../middlewares/getUserDetail ');
const { authorize } = require('../../middlewares/authorize');
const { checkJWT } = require('../../middlewares/checkJWT');
const { upload } = require('../../config/cloudinary');

router.use(checkJWT);
router.use(attachUserDetail);

const parseProductBody = (req, res, next) => {
  try {
    if (req.body.product) {
      req.product = JSON.parse(req.body.product);
      if (Array.isArray(req.product?.skus)) {
        req.product.skus = req.product.skus.map(sku => ({
          ...sku,
          mediaUrls: Array.isArray(sku.mediaUrls) ? sku.mediaUrls : [],
        }));
      }
    } else {
      req.product = req.body;
    }
    next();
  } catch (error) {
    return res.status(400).json({ message: 'Dữ liệu sản phẩm không hợp lệ', error: error.message });
  }
};

router.get('/list', ProductController.getAll);
router.get('/:slug', ProductController.getById);

router.post(
  '/create',
  upload.any(),
  parseProductBody,
  validateSimpleProduct,
  ProductController.create
);

router.put(
  '/update/:slug',
  upload.any(),
  parseProductBody,
  validateSimpleProduct,
  ProductController.update
);

router.delete('/soft/:id', ProductController.softDelete);
router.delete('/force/:id', ProductController.forceDelete);
router.patch('/restore/:id', ProductController.restore);

router.post('/soft-delete-many', ProductController.softDeleteMany);
router.post('/force-delete-many', ProductController.forceDeleteMany);
router.post('/restore-many', ProductController.restoreMany);
router.post('/update-order', ProductController.updateOrderIndexBulk);

router.get('/categories/tree', ProductController.getCategoryTree);
router.get('/brands/list', ProductController.getBrandList);

module.exports = router;
