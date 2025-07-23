// src/routes/uploadRoutes.js
const express = require("express");
const router = express.Router();
const { upload } = require("../../config/cloudinary");

const {checkJWT} = require('../../middlewares/checkJWT')
router.use(checkJWT);
router.post(
  "/",
  upload.single("file"),
  (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: "Không có file nào được upload." });
    }
    // Lấy URL ảnh trên Cloudinary từ req.file.path
    // Thường multer-storage-cloudinary sẽ gán URL ở req.file.path
    const imageUrl = req.file.path; 
    // TinyMCE mong muốn trả về JSON có key 'location' chứa URL
    return res.json({ location: imageUrl });
  }
);

module.exports = router;
