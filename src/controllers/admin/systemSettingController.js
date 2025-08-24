const { SystemSetting } = require('../../models');
const { cloudinary } = require('../../config/cloudinary');
const fs = require('fs');

class SystemSettingController {
  static async get(req, res) {
    try {
      const setting = await SystemSetting.findOne();
      res.set('Cache-Control', 'no-store'); // ✅ chống cache
      res.json(setting);
    } catch (err) {
      return res.status(500).json({ message: 'Lỗi máy chủ khi lấy cài đặt hệ thống' });
    }
  }

  static async update(req, res) {
    try {
      let setting = await SystemSetting.findOne();
      if (!setting) {
        setting = await SystemSetting.create({});
      }

      const body = { ...req.body };
      const files = req.files;

      // Multer có thể biến field -> mảng; lấy phần tử đầu nếu chỉ có 1
      for (const key in body) {
        if (Array.isArray(body[key]) && body[key].length === 1) {
          body[key] = body[key][0];
        }
      }

      // Chuẩn hoá boolean
      const booleanFields = [
        'showSocialFooter',
        'facebookEnabled',
        'instagramEnabled',
        'tiktokEnabled',
        'youtubeEnabled',
        'zaloEnabled'
      ];
      for (const field of booleanFields) {
        if (field in body) {
          body[field] = body[field] === 'true' || body[field] === true;
        }
      }

      // Chuẩn hoá number
      if ('lowStockThreshold' in body) {
        body.lowStockThreshold =
          body.lowStockThreshold === '' || body.lowStockThreshold === null
            ? null
            : parseInt(body.lowStockThreshold, 10);
      }

      // Upload ảnh (nếu có)
      if (files?.siteLogo?.[0]) {
        const result = await cloudinary.uploader.upload(files.siteLogo[0].path, { folder: 'system' });
        body.siteLogo = result.secure_url;
        fs.unlinkSync(files.siteLogo[0].path);
      }
      if (files?.favicon?.[0]) {
        const result = await cloudinary.uploader.upload(files.favicon[0].path, { folder: 'system' });
        body.favicon = result.secure_url;
        fs.unlinkSync(files.favicon[0].path);
      }

      // Cập nhật và trả về bản ghi mới
      const updated = await setting.update(body); 
      return res.json(updated);
    } catch (err) {
      return res.status(500).json({ message: 'Lỗi máy chủ khi cập nhật cài đặt' });
    }
  }
}

module.exports = SystemSettingController;
