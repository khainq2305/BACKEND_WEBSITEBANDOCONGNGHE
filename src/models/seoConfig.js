const { DataTypes } = require('sequelize');
const connection = require('../config/database');

const SEOConfig = connection.define('SEOConfig', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  siteName: {
    type: DataTypes.STRING,
    allowNull: true
  },
  siteDescription: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  siteKeywords: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: []
  },
  defaultTitle: {
    type: DataTypes.STRING,
    allowNull: true
  },
  titleSeparator: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: '|'
  },
  defaultMetaDescription: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  robotsTxt: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  sitemap: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: {
      enabled: true,
      includeImages: true,
      excludeUrls: []
    }
  },
  socialMedia: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: {
      facebook: {
        appId: '',
        adminId: '',
        defaultImage: ''
      },
      twitter: {
        username: '',
        defaultCard: 'summary_large_image'
      },
      linkedin: '',
      instagram: ''
    }
  },
  analytics: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: {
      googleAnalytics: '',
      googleTagManager: '',
      facebookPixel: ''
    }
  },
  schema: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: {
      organization: {
        name: '',
        logo: '',
        url: '',
        contactPoint: []
      },
      website: {
        name: '',
        url: '',
        potentialAction: {
          target: '',
          queryInput: ''
        }
      }
    }
  },
  redirects: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: []
  }
}, {
  tableName: 'seo_configs',
  timestamps: true
});

module.exports = SEOConfig;
