// routes/client/searchRoutes.js
const express = require("express");
// Import 'uploadCloudinary' từ file cấu hình Cloudinary của bạn
const { upload } = require("../../config/cloudinary"); // Đảm bảo đường dẫn đúng
const { checkJWT } = require("../../middlewares/checkJWT");
const searchImageController = require("../../controllers/client/searchImageController");

const router = express.Router();

router.post("/search-by-image", upload.single("image"), searchImageController.searchByImage);

router.get("/search-by-name", searchImageController.searchByName);

router.get("/suggestions", searchImageController.getSuggestions); // <-- THÊM

router.get("/search/history", checkJWT, searchImageController.getSearchHistory);
router.post("/search/history", checkJWT, searchImageController.addSearchHistory);
router.delete("/search/history/:id", checkJWT, searchImageController.deleteSearchHistoryItem);


module.exports = router;