const { SystemSetting } = require('../../models');
const { cloudinary } = require('../../config/cloudinary');
const fs = require('fs');

class SystemSettingController {
  static async get(req, res) {
    try {
      const setting = await SystemSetting.findOne();
      res.json(setting);
    } catch (err) {
      console.error('GET SYSTEM SETTINGS ERROR:', err);
      res.status(500).json({ message: 'Lỗi máy chủ khi lấy cài đặt hệ thống' });
    }
  }

  static async update(req, res) {
    try {
      let setting = await SystemSetting.findOne();
      if (!setting) {
        setting = await SystemSetting.create({});
      }

      const body = req.body;
      const files = req.files;

      for (const key in body) {
        if (Array.isArray(body[key]) && body[key].length === 1) {
          body[key] = body[key][0];
        }
      }

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
          body[field] = body[field] === 'true';
        }
      }

      if ('lowStockThreshold' in body) {
        body.lowStockThreshold = body.lowStockThreshold === ''
          ? null
          : parseInt(body.lowStockThreshold, 10);
      }

      if (files?.siteLogo?.[0]) {
        const result = await cloudinary.uploader.upload(files.siteLogo[0].path, {
          folder: 'system'
        });
        body.siteLogo = result.secure_url;
        fs.unlinkSync(files.siteLogo[0].path);
      }

      if (files?.favicon?.[0]) {
        const result = await cloudinary.uploader.upload(files.favicon[0].path, {
          folder: 'system'
        });
        body.favicon = result.secure_url;
        fs.unlinkSync(files.favicon[0].path);
      }

      await setting.update(body);
      res.json(setting);
    } catch (err) {
      console.error('UPDATE SYSTEM SETTING ERROR:', err);
      res.status(500).json({ message: 'Lỗi máy chủ khi cập nhật cài đặt' });
    }
  }
}

module.exports = SystemSettingController;
