const express = require('express');
const router = express.Router();
const ProductController = require('../../controllers/admin/productController');
const { validateSimpleProduct } = require('../../validations/validateSimpleProduct');

const { upload } = require('../../config/cloudinary');

router.get('/product/list', ProductController.getAll);  
router.get(
  '/product/:slug',
  ProductController.getById    
);



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

router.post(
  '/product/create',
 upload.any(),
parseProductBody, 
validateSimpleProduct,

  ProductController.create
);
router.put(
  '/product/update/:slug',
  upload.any(),
  parseProductBody,
  validateSimpleProduct,
  ProductController.update  
);
router.delete('/product/soft/:id', ProductController.softDelete);


  
router.get('/categories/tree', ProductController.getCategoryTree);
router.post  ('/product/force-delete-many',  ProductController.forceDeleteMany); 

router.post('/product/soft-delete-many', ProductController.softDeleteMany);


router.patch('/product/restore/:id', ProductController.restore);


router.post('/product/restore-many', ProductController.restoreMany);


router.delete('/product/force/:id', ProductController.forceDelete);


router.get('/brands/list', ProductController.getBrandList);


router.post('/product/update-order', ProductController.updateOrderIndexBulk);


module.exports = router;
