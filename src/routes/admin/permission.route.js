const express = require('express');
const router = express.Router();
const PermissionController = require('../../controllers/admin/permissionController');
const { authorize } = require("../../middlewares/authorize"); // Import middleware thông minh
const { checkJWT } = require('../../middlewares/checkJWT');
const { attachUserDetail } = require('../../middlewares/getUserDetail ');

router.use(checkJWT);
router.use(attachUserDetail);
router.use(authorize("Post"))

router.get('/subjects', PermissionController.getAllSubject);


router.get('/role/:roleId', PermissionController.getPermissionsByRole);

// GET /api/admin/permissions/actions/:subject
router.get('/actions/:subject', PermissionController.getActionsForSubject);

// GET /api/admin/permissions/matrix/:subject
router.get('/matrix/:subject', PermissionController.getMatrix);

// POST /api/admin/permissions/update
router.post('/update', PermissionController.updatePermission);

module.exports = router;
