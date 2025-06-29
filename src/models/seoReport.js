const { DataTypes } = require('sequelize');
const connection = require('../config/database');

const SEOReport = connection.define('SEOReport', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  url: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  },
  title: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: {
      content: '',
      length: 0,
      score: 0,
      issues: []
    }
  },
  metaDescription: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: {
      content: '',
      length: 0,
      score: 0,
      issues: []
    }
  },
  focusKeyword: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: {
      keyword: '',
      density: 0,
      inTitle: false,
      inDescription: false,
      inHeadings: false,
      inUrl: false,
      score: 0
    }
  },
  headings: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: {
      h1: { count: 0, content: [] },
      h2: { count: 0, content: [] },
      h3: { count: 0, content: [] },
      h4: { count: 0, content: [] },
      h5: { count: 0, content: [] },
      h6: { count: 0, content: [] },
      score: 0,
      issues: []
    }
  },
  images: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: {
      total: 0,
      withAlt: 0,
      withoutAlt: 0,
      altTexts: [],
      issues: [],
      score: 0
    }
  },
  content: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: {
      wordCount: 0,
      readabilityScore: 0,
      sentences: 0,
      paragraphs: 0,
      averageSentenceLength: 0,
      score: 0
    }
  },
  internalLinks: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: {
      count: 0,
      links: [],
      score: 0
    }
  },
  externalLinks: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: {
      count: 0,
      links: [],
      score: 0
    }
  },
  socialTags: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: {
      openGraph: {
        title: '',
        description: '',
        image: '',
        type: '',
        score: 0
      },
      twitter: {
        title: '',
        description: '',
        image: '',
        card: '',
        score: 0
      }
    }
  },
  performance: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: {
      loadTime: 0,
      pageSize: 0,
      requests: 0,
      score: 0
    }
  },
  technical: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: {
      canonical: '',
      robots: '',
      sitemap: false,
      ssl: false,
      mobileFriendly: false,
      schema: [],
      score: 0
    }
  },
  overallScore: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    validate: {
      min: 0,
      max: 100
    }
  },
  recommendations: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: []
  },
  lastAnalyzed: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  analysisHistory: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: []
  }
}, {
  tableName: 'seo_reports',
  timestamps: true,
  indexes: [
    {
      fields: ['url']
    },
    {
      fields: ['overallScore']
    },
    {
      fields: ['lastAnalyzed']
    }
  ]
});

module.exports = SEOReport;
