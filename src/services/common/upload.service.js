// services/common/upload.service.js
const { cloudinary } = require('../../config/cloudinary'); // <<<--- SỬA Ở ĐÂY
const fs = require('fs'); // Để xóa file tạm

const uploadImage = async (filePath, folder = 'uploads_on_cloudinary') => { // folder là thư mục trên Cloudinary
  try {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File không tồn tại tại đường dẫn: ${filePath}`);
    }

    const result = await cloudinary.uploader.upload(filePath, {
      folder: folder,
      // resource_type: "auto" // Cloudinary tự động nhận diện loại file
    });

    // Xóa file tạm sau khi upload thành công lên Cloudinary
    try {
      fs.unlinkSync(filePath);
    } catch (unlinkErr) {
      console.warn(`Lỗi xóa file tạm ${filePath}:`, unlinkErr.message);
      // Không throw lỗi ở đây để không ảnh hưởng đến việc trả về URL
    }

    return {
      url: result.secure_url, // URL an toàn (HTTPS) của ảnh
      public_id: result.public_id, // ID công khai để quản lý (ví dụ: xóa)
    };
  } catch (error) {
    console.error(`Lỗi Cloudinary upload cho file ${filePath}:`, error);
    // Thử xóa file tạm nếu có lỗi upload
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (unlinkErr) {
        console.warn(`Lỗi xóa file tạm ${filePath} sau khi Cloudinary lỗi:`, unlinkErr.message);
      }
    }
    throw new Error('Lỗi upload ảnh lên Cloudinary: ' + (error.message || error));
  }
};

module.exports = { uploadImage };