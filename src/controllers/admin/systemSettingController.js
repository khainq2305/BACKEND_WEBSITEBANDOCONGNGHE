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
      'show_social_footer',
      'facebook_enabled',
      'instagram_enabled',
      'tiktok_enabled',
      'youtube_enabled',
      'zalo_enabled'
    ];
    for (const field of booleanFields) {
      if (field in body) {
        body[field] = body[field] === 'true';
      }
    }

    if ('low_stock_threshold' in body) {
      body.low_stock_threshold = body.low_stock_threshold === ''
        ? null
        : parseInt(body.low_stock_threshold, 10);
    }

    if (files?.site_logo?.[0]) {
      const result = await cloudinary.uploader.upload(files.site_logo[0].path, {
        folder: 'system',
      });
      body.site_logo = result.secure_url;
      fs.unlinkSync(files.site_logo[0].path);
    }

    if (files?.favicon?.[0]) {
      const result = await cloudinary.uploader.upload(files.favicon[0].path, {
        folder: 'system',
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
