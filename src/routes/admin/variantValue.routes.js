const express = require('express');
const router = express.Router();
const VariantValueController = require('../../controllers/admin/variantValueController');
const { validateVariantValue } = require('../../validations/variantValueValidator');
const {upload }= require('../../config/cloudinary');
const { checkJWT, isAdmin } = require("../../middlewares/checkJWT");
const { attachUserDetail } = require('../../middlewares/getUserDetail ');
const { authorize } = require('../../middlewares/authorize');



router.use(checkJWT);
router.use(attachUserDetail)
router.use(authorize("Product"))
router.get('/:id', VariantValueController.getByVariant);

router.post(
  '/create',
  upload.single('image'),
  validateVariantValue,
  VariantValueController.create
);
router.post('/reorder', VariantValueController.reorder);
router.post('/create-quick', VariantValueController.createQuick);
router.put(
  '/:id',
  upload.single('image'),
  validateVariantValue,
  VariantValueController.update
);

router.delete('/:id', VariantValueController.softDelete);
router.delete('/:id/force', VariantValueController.forceDelete);
router.patch('/:id/restore', VariantValueController.restore);

router.post('/delete-many', VariantValueController.deleteMany);
router.post('/force-delete-many', VariantValueController.forceDeleteMany);
router.post('/restore-many', VariantValueController.restoreMany);

module.exports = router;
