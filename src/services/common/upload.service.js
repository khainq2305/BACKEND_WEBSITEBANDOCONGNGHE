
const { cloudinary } = require('../../config/cloudinary'); 
const fs = require('fs'); 

const uploadImage = async (filePath, folder = 'uploads_on_cloudinary') => { 
  try {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File không tồn tại tại đường dẫn: ${filePath}`);
    }

    const result = await cloudinary.uploader.upload(filePath, {
      folder: folder,

    });


    try {
      fs.unlinkSync(filePath);
    } catch (unlinkErr) {
     
    }

    return {
      url: result.secure_url, 
      public_id: result.public_id, 
    };
  } catch (error) {
    console.error(`Lỗi Cloudinary upload cho file ${filePath}:`, error);

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