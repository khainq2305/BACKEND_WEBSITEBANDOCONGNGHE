const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const PostSEO = sequelize.define('PostSEO', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  postId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'posts',
      key: 'id'
    }
  },
  title: {
    type: DataTypes.STRING(255),
    allowNull: true,
    comment: 'SEO Title'
  },
  metaDescription: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Meta Description'
  },
  focusKeyword: {
    type: DataTypes.STRING(255),
    allowNull: true,
    comment: 'Focus keyword'
  },
  canonicalUrl: {
    type: DataTypes.STRING(500),
    allowNull: true,
    comment: 'Canonical URL'
  },
  robots: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: {
      index: true,
      follow: true,
      archive: true,
      snippet: true,
      imageIndex: true
    },
    comment: 'Robot settings'
  },
  socialMeta: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: {
      facebook: {
        title: '',
        description: '',
        image: ''
      },
      twitter: {
        title: '',
        description: '',
        image: '',
        cardType: 'summary_large_image'
      }
    },
    comment: 'Social media meta tags'
  },
  schema: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: 'Schema markup data'
  },
  redirectUrl: {
    type: DataTypes.STRING(500),
    allowNull: true,
    comment: 'Redirect URL'
  },
  redirectType: {
    type: DataTypes.ENUM('301', '302', '307'),
    allowNull: true,
    comment: 'Redirect type'
  },
  seoScore: {
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: 0,
    comment: 'SEO Score'
  },
  readabilityScore: {
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: 0,
    comment: 'Readability Score'
  },
  analysis: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: 'SEO analysis data'
  },
  isNoIndex: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    comment: 'No index flag'
  },
  isNoFollow: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    comment: 'No follow flag'
  }
}, {
  tableName: 'post_seo',
  timestamps: true,
  indexes: [
    {
      fields: ['postId']
    },
    {
      fields: ['focusKeyword']
    },
    {
      fields: ['seoScore']
    }
  ]
});

module.exports = PostSEO;
