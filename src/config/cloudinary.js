// src/config/cloudinary.js
const cloudinary = require("cloudinary").v2;
const multer = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: async (req, file) => ({
    folder: "uploads",
    resource_type: file.mimetype.startsWith("video/") ? "video" : "image",
    allowed_formats: ["jpg", "jpeg", "png", "webp", "mp4", "mov"],
  }),
});

const upload = multer({
  storage,
  limits: {
    // Tăng fileSize lên 100MB để cho phép tải video có dung lượng lớn
    fileSize: 100 * 1024 * 1024, // 100 MB
    // fieldSize là giới hạn tổng kích thước các trường text, có thể tăng lên để đảm bảo
    fieldSize: 50 * 1024 * 1024, // 50 MB (hoặc tuỳ chỉnh)
    // frontend cho phép tối đa 6 ảnh và 1 video, tổng là 7 file
    files: 7,
  }
});

module.exports = { cloudinary, upload };
