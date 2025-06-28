const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const SystemSetting = sequelize.define('SystemSetting', {
  site_name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  site_description: {
    type: DataTypes.STRING,
    allowNull: true
  },
  website_url: {
    type: DataTypes.STRING,
    allowNull: true
  },
  hotline: {
    type: DataTypes.STRING,
    allowNull: false
  },
  hotline_sales: {
    type: DataTypes.STRING,
    allowNull: true
  },
  hotline_warranty: {
    type: DataTypes.STRING,
    allowNull: true
  },
  hotline_feedback: {
    type: DataTypes.STRING,
    allowNull: true
  },
  email_contact: {
    type: DataTypes.STRING,
    allowNull: true,
    validate: {
      isEmail: true
    }
  },
  address: {
    type: DataTypes.STRING,
    allowNull: true
  },
  low_stock_threshold: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  facebook_page_url: {
    type: DataTypes.STRING,
    allowNull: true
  },
  site_logo: {
    type: DataTypes.STRING,
    allowNull: true
  },
  favicon: {
    type: DataTypes.STRING,
    allowNull: true
  },
  show_social_footer: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  facebook_enabled: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  instagram_enabled: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  tiktok_enabled: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  youtube_enabled: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  zalo_enabled: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  }
}, {
  tableName: 'system_settings',
  timestamps: false,
  underscored: false
});

module.exports = SystemSetting;
