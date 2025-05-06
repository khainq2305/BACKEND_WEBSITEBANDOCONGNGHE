const cloudinary = require('../../config/cloudinary');
const fs = require('fs');

// Hàm upload 1 file lên Cloudinary
const uploadImage = async (filePath, folder = 'uploads') => {
  try {
    const result = await cloudinary.uploader.upload(filePath, {
      folder: folder,
    });

    // Xóa file tạm sau khi upload
    fs.unlinkSync(filePath);

    return {
      url: result.secure_url,
      public_id: result.public_id,
    };
  } catch (error) {
    throw new Error('Lỗi upload ảnh: ' + error.message);
  }
};

module.exports = { uploadImage };
