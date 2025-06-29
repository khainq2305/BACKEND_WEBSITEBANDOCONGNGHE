const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const SystemSetting = sequelize.define('SystemSetting', {
  siteName: {
    type: DataTypes.STRING,
    allowNull: false
  },
  siteDescription: {
    type: DataTypes.STRING,
    allowNull: true
  },
  websiteUrl: {
    type: DataTypes.STRING,
    allowNull: true
  },
  hotline: {
    type: DataTypes.STRING,
    allowNull: false
  },
  hotlineSales: {
    type: DataTypes.STRING,
    allowNull: true
  },
  hotlineWarranty: {
    type: DataTypes.STRING,
    allowNull: true
  },
  hotlineFeedback: {
    type: DataTypes.STRING,
    allowNull: true
  },
  emailContact: {
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
  lowStockThreshold: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  facebookPageUrl: {
    type: DataTypes.STRING,
    allowNull: true
  },
  siteLogo: {
    type: DataTypes.STRING,
    allowNull: true
  },
  favicon: {
    type: DataTypes.STRING,
    allowNull: true
  },
  showSocialFooter: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  facebookEnabled: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  instagramEnabled: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  tiktokEnabled: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  youtubeEnabled: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  zaloEnabled: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  }
}, {
  tableName: 'systemsettings',
  timestamps: false,
  underscored: false // ⚙️ Giữ camelCase cột DB
});

module.exports = SystemSetting;
