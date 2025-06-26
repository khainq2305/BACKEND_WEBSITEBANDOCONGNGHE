const { SystemSetting } = require('../../models');

class SystemSettingClientController {
  async getClientSettings(req, res) {
    try {
      const setting = await SystemSetting.findOne();

      if (!setting) {
        return res.status(404).json({ message: 'Không tìm thấy cài đặt hệ thống' });
      }

      const {
        site_name,
        site_logo,
        favicon,
        hotline,
        hotline_sales,
        hotline_warranty,
        hotline_feedback,
        email_contact,
        address,
        facebook_page_url,
        show_social_footer,
        facebook_enabled,
        instagram_enabled,
        youtube_enabled,
        tiktok_enabled,
        zalo_enabled
      } = setting;

      return res.json({
        site_name,
        site_logo,
        favicon,
        hotline,
        hotline_sales,
        hotline_warranty,
        hotline_feedback,
        email_contact,
        address,
        facebook_page_url,
        show_social_footer,
        facebook_enabled,
        instagram_enabled,
        youtube_enabled,
        tiktok_enabled,
        zalo_enabled
      });
    } catch (error) {
      console.error('GET SYSTEM SETTING ERROR:', error);
      res.status(500).json({ message: 'Lỗi server khi lấy cài đặt hệ thống' });
    }
  }

}

module.exports = new SystemSettingClientController();
