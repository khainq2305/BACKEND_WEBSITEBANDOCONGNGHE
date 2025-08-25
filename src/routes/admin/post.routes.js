const express = require("express");
const router = express.Router();
const PostController = require("../../controllers/admin/postController");
const { Post } = require("../../models/index");
const autoSlug = require("../../middlewares/autoSlug");
const pagination = require("../../middlewares/pagination");
const { upload } = require("../../config/cloudinary");
const validatePost = require("../../validations/postValidator");
const { checkJWT } = require("../../middlewares/checkJWT");
const { attachUserDetail } = require("../../middlewares/getUserDetail ");
const { authorize } = require("../../middlewares/authorize"); // Import middleware thông minh

// =================================================================
// ÁP DỤNG MIDDLEWARE CHUNG CHO TẤT CẢ CÁC ROUTE BÊN DƯỚI
// Bạn không cần gọi lại checkJWT và attachUserDetail ở từng route nữa.
// =================================================================
router.use(checkJWT);
router.use(attachUserDetail);
router.use(authorize("Post"))
// =================================================================
// ĐỊNH NGHĨA CÁC ROUTE
// Giờ đây, chúng ta chỉ cần dùng authorize() rất gọn gàng.
// =================================================================

// [POST] /them-bai-viet-moi -> Tự động hiểu action là 'create'
router.post("/create",  upload.single("thumbnail"), autoSlug(Post), PostController.create);

// [GET] / -> Tự động hiểu action là 'read'
router.get(
  "/",
  pagination,
  PostController.getAll
);

// [GET] /chinh-sua-bai-viet/:slug -> Tự động hiểu action là 'read'
router.get("/edit/:slug", PostController.getBySlug);

// [PUT] /cap-nhat-bai-viet/:slug -> Tự động hiểu action là 'update'
router.put(
  "/update/:slug",
  authorize("Post"),
  upload.single("thumbnailUrl"),
  validatePost,
  autoSlug(Post),
  PostController.update
);

// [POST] /chuyen-vao-thung-rac -> Ghi đè action thành 'delete'
router.post(
  "/trash",
  authorize("Post", "delete"), // Ghi đè action mặc định của POST
  PostController.softDelete
);

// [POST] /khoi-phuc -> Ghi đè action thành 'update'
router.post(
  "/restore",
  authorize("Post", "update"), // Ghi đè action mặc định của POST
  PostController.restore
);

// Route này dành cho quyền lực cao nhất, không cần kiểm tra phân quyền thông thường
// Ví dụ: chỉ có Super Admin mới thấy và sử dụng được
router.post("/force-delete", PostController.forceDelete);

module.exports = router;
