const express = require('express');
const router = express.Router();
const RoleController = require('../../controllers/admin/RoleController');
const { checkJWT } = require('../../middlewares/checkJWT');
const { attachUserDetail } = require('../../middlewares/getUserDetail ')
const { checkPermission } = require('../../middlewares/casl.middleware')
const { authorize } = require("../../middlewares/authorize");

/**
 * @function checkJWT đặt ở mỗi router 
 * 
 * @function attachUserDetail lấy userId đã được giải mã từ @function checkJWT
 * 
 * @function authorize Chỉ cần truyền đối tượng vào vd: Post, Product, CategoryProduct
 */


console.log('đã gọi router role')
router.use(checkJWT)
router.use(attachUserDetail);
router.use(authorize("Role"))

router.get('/', RoleController.findAll);

router.get('/:id', RoleController.getById);

router.post('/', RoleController.create);

router.put('/:id', RoleController.update);

router.delete('/:id', RoleController.remove);

module.exports = router;
