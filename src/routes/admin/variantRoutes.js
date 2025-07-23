// src/routes/admin/variantRoutes.js
const express = require('express');
const router = express.Router();
const VariantController = require('../../controllers/admin/variantController');
const VariantValueController = require('../../controllers/admin/variantValueController');
const { validateVariant } = require('../../validations/variantValidator');
const { checkJWT, isAdmin } = require("../../middlewares/checkJWT");
const { authorize } = require("../../middlewares/authorize");
const { attachUserDetail } = require('../../middlewares/getUserDetail ');

router.use(checkJWT);
router.use(attachUserDetail);
router.use(authorize("Product"))
router.get('/list', VariantController.getAll);
router.get('/with-values', VariantController.getAllActiveWithValues);

router.post('/create', validateVariant, VariantController.create);

router.delete('/:id', VariantController.softDelete);          
router.delete('/:id/force', VariantController.forceDelete);   
router.patch('/:id/restore', VariantController.restore); 
router.post('/delete-many', VariantController.softDeleteMany);
router.post('/force-delete-many', VariantController.forceDeleteMany);
router.post('/restore-many', VariantController.restoreMany);
router.get('/:slug', VariantController.getById);
router.put('/:slug', validateVariant, VariantController.update);

router.post('/type/create', VariantController.createTypeOnly); 

// 

module.exports = router;
