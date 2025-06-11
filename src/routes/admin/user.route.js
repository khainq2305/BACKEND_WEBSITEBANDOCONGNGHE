const express = require('express');
const router = express.Router();
const UserController = require('../../controllers/admin/userController');
const { createUserValidator } = require('../../validations/userValidator');
const { checkJWT } = require('../../middlewares/checkJWT');
const { attachUserDetail } = require('../../middlewares/getUserDetail ');
const { authorize } = require('../../middlewares/authorize'); // Import middleware phân quyền thông minh

// =================================================================
// ÁP DỤNG MIDDLEWARE CHUNG CHO TẤT CẢ CÁC ROUTE BÊN DƯỚI
// =================================================================
router.use(checkJWT);
router.use(attachUserDetail);

// =================================================================
// CHỈ ADMIN MỚI ĐƯỢC PHÉP TRUY CẬP TẤT CẢ CÁC ROUTE TRONG FILE NÀY
// Middleware này sẽ kiểm tra người dùng có quyền cao nhất ('manage' trên 'all') không.
// Nếu không, request sẽ bị chặn ngay tại đây.
// =================================================================
router.use(authorize('all', 'manage'));

// =================================================================
// ĐỊNH NGHĨA CÁC ROUTE
// Giờ đây không cần kiểm tra quyền riêng lẻ nữa vì đã có lớp bảo vệ chung ở trên.
// =================================================================

// --- Quản lý User ---
router.get('/users', UserController.getAllUsers);
router.post('/users', createUserValidator, UserController.createUser);
router.get('/users/:id', UserController.getUserById);
router.put('/users/:id/status', UserController.updateUserStatus);
router.post('/users/:id/reset-password', UserController.resetUserPassword);

// --- Quản lý Role ---
router.get('/roles', UserController.getAllRoles);

// --- Xử lý hàng loạt & Dọn dẹp ---
router.delete('/users/inactive', UserController.deleteInactiveUsers);
router.post('/users/force-delete-many', UserController.forceDeleteManyUsers);
router.get('/users/deleted', UserController.getDeletedUsers);

module.exports = router;
