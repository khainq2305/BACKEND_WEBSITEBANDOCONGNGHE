const express = require('express');
const router = express.Router();
const ProductController = require('../../controllers/admin/productController');
const { validateSimpleProduct } = require('../../validations/validateSimpleProduct');

const upload = require('../../middlewares/upload');
router.get('/product/list', ProductController.getAll);  
router.get('/product/:id', ProductController.getById);
const parseProductBody = (req, res, next) => {
  try {
    if (req.body.product) {
      req.product = JSON.parse(req.body.product);

      // ÉP đảm bảo luôn có array
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

router.post(
  '/product/create',
 upload.any(),
parseProductBody, // ✅ THÊM VÔ ĐÂY
validateSimpleProduct,

  ProductController.create
);
// Xoá mềm 1 sản phẩm
router.delete('/product/soft/:id', ProductController.softDelete);

// (Nếu cần)
  
router.get('/categories/tree', ProductController.getCategoryTree);

// Xoá mềm nhiều sản phẩm
router.post('/product/soft-delete-many', ProductController.softDeleteMany);

// Khôi phục 1 sản phẩm
router.patch('/product/restore/:id', ProductController.restore);

// Khôi phục nhiều sản phẩm
router.post('/product/restore-many', ProductController.restoreMany);

// Xoá vĩnh viễn 1 sản phẩm
router.delete('/product/force/:id', ProductController.forceDelete);
router.put('/product/update/:id',
  upload.any(),
  parseProductBody,
  validateSimpleProduct,
  ProductController.update
);

router.get('/brands/list', ProductController.getBrandList);
// Thêm dòng này vào trước `module.exports = router;`

router.post('/product/update-order', ProductController.updateOrderIndexBulk);


module.exports = router;
