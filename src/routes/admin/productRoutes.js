const express = require('express');
const router = express.Router();
const ProductController = require('../../controllers/admin/productController');
const { validateSimpleProduct } = require('../../validations/validateSimpleProduct');
const { attachUserDetail } = require('../../middlewares/getUserDetail ');
const { authorize } = require('../../middlewares/authorize'); // Import middleware phân quyền thông minh
const { checkJWT } = require('../../middlewares/checkJWT');
const { upload } = require('../../config/cloudinary');
const { auditMiddleware } = require('../../middlewares/auditMiddleware');
router.use(checkJWT);
router.use(attachUserDetail);
router.use(authorize("Product"))
router.get('/list', ProductController.getAll);  
router.get(
  '/:slug',
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
  '/create',
  
  upload.any(),
parseProductBody, 
validateSimpleProduct,
auditMiddleware('Product'),
  ProductController.create
);
router.put(
  '/update/:slug',
  
  upload.any(),
  parseProductBody,
  validateSimpleProduct,
  auditMiddleware('Product'),
  ProductController.update  
);
router.delete('/soft/:id', auditMiddleware('Product'),  ProductController.softDelete);


  
router.get('/categories/tree', ProductController.getCategoryTree);
router.post  ('/force-delete-many',   ProductController.forceDeleteMany); 

router.post('/soft-delete-many',  ProductController.softDeleteMany);


router.patch('/restore/:id', auditMiddleware('Product'), ProductController.restore);


router.post('/restore-many', ProductController.restoreMany);


router.delete('/force/:id', auditMiddleware('Product'),  ProductController.forceDelete);


router.get('/brands/list', ProductController.getBrandList);


router.post('/update-order', ProductController.updateOrderIndexBulk);


module.exports = router;
