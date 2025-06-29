const { SystemSetting } = require('../../models');

class SystemSettingClientController {
  async getClientSettings(req, res) {
    try {
      const setting = await SystemSetting.findOne();

      if (!setting) {
        return res.status(404).json({ message: 'Không tìm thấy cài đặt hệ thống' });
      }

      const {
        siteName,
        siteLogo,
        favicon,
        hotline,
        hotlineSales,
        hotlineWarranty,
        hotlineFeedback,
        emailContact,
        address,
        facebookPageUrl,
        showSocialFooter,
        facebookEnabled,
        instagramEnabled,
        youtubeEnabled,
        tiktokEnabled,
        zaloEnabled
      } = setting;

      return res.json({
        siteName,
        siteLogo,
        favicon,
        hotline,
        hotlineSales,
        hotlineWarranty,
        hotlineFeedback,
        emailContact,
        address,
        facebookPageUrl,
        showSocialFooter,
        facebookEnabled,
        instagramEnabled,
        youtubeEnabled,
        tiktokEnabled,
        zaloEnabled
      });
    } catch (error) {
      console.error('GET SYSTEM SETTING CLIENT ERROR:', error);
      res.status(500).json({ message: 'Lỗi server khi lấy cài đặt hệ thống' });
    }
  }
}

module.exports = new SystemSettingClientController();
