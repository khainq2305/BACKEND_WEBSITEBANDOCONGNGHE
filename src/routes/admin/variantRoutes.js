// src/routes/admin/variantRoutes.js
const express = require('express');
const router = express.Router();
const VariantController = require('../../controllers/admin/variantController');
const VariantValueController = require('../../controllers/admin/variantValueController');
const { validateVariant } = require('../../validations/variantValidator');
router.get('/variants/list', VariantController.getAll);
router.get('/variants/with-values', VariantController.getAllActiveWithValues);

router.post('/variants/create', validateVariant, VariantController.create);
// router.post('/variant-values/create', VariantValueController.create);
router.delete('/variants/:id', VariantController.softDelete);          // ✅ Chuyển vào thùng rác
router.delete('/variants/:id/force', VariantController.forceDelete);   // ✅ Xoá vĩnh viễn
router.patch('/variants/:id/restore', VariantController.restore); 
router.post('/variants/delete-many', VariantController.softDeleteMany);
router.post('/variants/force-delete-many', VariantController.forceDeleteMany);
router.post('/variants/restore-many', VariantController.restoreMany);
router.get('/variants/:id', VariantController.getById);
router.put('/variants/:id', validateVariant, VariantController.update);
router.post('/variants/type/create', VariantController.createTypeOnly); // ✅ thêm dòng này

// 

module.exports = router;
