const SEOAnalyzer = require('../../services/seoAnalyzer');
const { SEOReport, SEOConfig } = require('../../models');
const { Op } = require('sequelize');

class SEOController {
  // Phân tích SEO cho một URL
  async analyzeURL(req, res) {
    try {
      const { url, focusKeyword = '' } = req.body;
      
      if (!url) {
        return res.status(400).json({
          success: false,
          message: 'URL is required'
        });
      }
      
      const analyzer = new SEOAnalyzer();
      
      try {
        const analysisResult = await analyzer.analyzePage(url, focusKeyword);
        
        // Save or update report
        const existingReport = await SEOReport.findOne({ where: { url } });
        let seoReport;
        
        if (existingReport) {
          // Add to history
          const history = existingReport.analysisHistory || [];
          history.push({
            date: existingReport.lastAnalyzed,
            score: existingReport.overallScore,
            changes: [] // Temporarily disable change detection
          });
          
          // Update with new data
          await existingReport.update({
            ...analysisResult,
            analysisHistory: history
          });
          seoReport = existingReport;
        } else {
          seoReport = await SEOReport.create(analysisResult);
        }
        
        res.json({
          success: true,
          data: seoReport
        });
        
      } finally {
        await analyzer.close();
      }
      
    } catch (error) {
      console.error('SEO Analysis Error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to analyze URL',
        error: error.message
      });
    }
  }
  
  // Lấy danh sách báo cáo SEO
  async getSEOReports(req, res) {
    try {
      const { 
        page = 1, 
        limit = 10, 
        sortBy = 'lastAnalyzed',
        sortOrder = 'desc',
        minScore,
        maxScore,
        search
      } = req.query;
      
      let query = {};
      
      // Filter by score range
      if (minScore || maxScore) {
        query.overallScore = {};
        if (minScore) query.overallScore[Op.gte] = parseInt(minScore);
        if (maxScore) query.overallScore[Op.lte] = parseInt(maxScore);
      }
      
      // Search in URL
      if (search) {
        query.url = { [Op.like]: `%${search}%` };
      }
      
      const { count: total, rows: reports } = await SEOReport.findAndCountAll({
        where: query,
        order: [[sortBy, sortOrder === 'desc' ? 'DESC' : 'ASC']],
        limit: parseInt(limit),
        offset: (page - 1) * limit
      });
      
      res.json({
        success: true,
        data: {
          reports,
          pagination: {
            current: parseInt(page),
            total: Math.ceil(total / limit),
            count: total,
            limit: parseInt(limit)
          }
        }
      });
      
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to fetch SEO reports',
        error: error.message
      });
    }
  }
  
  // Lấy chi tiết báo cáo SEO
  async getSEOReport(req, res) {
    try {
      const { id } = req.params;
      
      const report = await SEOReport.findByPk(id);
      
      if (!report) {
        return res.status(404).json({
          success: false,
          message: 'SEO report not found'
        });
      }
      
      res.json({
        success: true,
        data: report
      });
      
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to fetch SEO report',
        error: error.message
      });
    }
  }
  
  // Xóa báo cáo SEO
  async deleteSEOReport(req, res) {
    try {
      const { id } = req.params;
      
      const report = await SEOReport.findByPk(id);
      
      if (!report) {
        return res.status(404).json({
          success: false,
          message: 'SEO report not found'
        });
      }
      
      await report.destroy();
      
      res.json({
        success: true,
        message: 'SEO report deleted successfully'
      });
      
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to delete SEO report',
        error: error.message
      });
    }
  }
  
  // Phân tích hàng loạt URLs
  async bulkAnalyze(req, res) {
    try {
      const { urls, focusKeyword = '' } = req.body;
      
      if (!urls || !Array.isArray(urls)) {
        return res.status(400).json({
          success: false,
          message: 'URLs array is required'
        });
      }
      
      const analyzer = new SEOAnalyzer();
      const results = [];
      
      try {
        for (const url of urls) {
          try {
            const analysisResult = await analyzer.analyzePage(url, focusKeyword);
            
            // Save report
            await SEOReport.upsert({
              url,
              ...analysisResult
            });
            
            results.push({
              url,
              success: true,
              score: analysisResult.overallScore
            });
          } catch (error) {
            results.push({
              url,
              success: false,
              error: error.message
            });
          }
        }
      } finally {
        await analyzer.close();
      }
      
      res.json({
        success: true,
        data: results
      });
      
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Bulk analysis failed',
        error: error.message
      });
    }
  }
  
  // Lấy cấu hình SEO
  async getSEOConfig(req, res) {
    try {
      let config = await SEOConfig.findOne();
      
      if (!config) {
        // Create default config
        config = await SEOConfig.create({
          siteName: 'Website Bán Đồ Công Nghệ',
          siteDescription: 'Website bán các sản phẩm công nghệ chất lượng cao',
          siteKeywords: ['công nghệ', 'điện thoại', 'laptop'],
          defaultTitle: 'Website Bán Đồ Công Nghệ',
          titleSeparator: '-',
          defaultMetaDescription: 'Chuyên bán các sản phẩm công nghệ chất lượng cao',
          robotsTxt: `User-agent: *
Allow: /

# SEO-friendly URLs - Allow crawling
Allow: /san-pham/
Allow: /danh-muc/
Allow: /tin-tuc/

# Disallow admin pages
Disallow: /admin/
Disallow: /api/admin/`,
          sitemap: { enabled: true, includeImages: true },
          socialMedia: {
            twitter: { defaultCard: 'summary_large_image' }
          }
        });
      }
      
      // Map backend fields to frontend expected format
      const frontendData = {
        siteName: config.siteName || '',
        siteUrl: config.schema?.website?.url || 'http://localhost:5001',
        metaDescription: config.defaultMetaDescription || '',
        keywords: Array.isArray(config.siteKeywords) ? config.siteKeywords.join(', ') : '',
        titleSeparator: config.titleSeparator || '-',
        maxTitleLength: 60,
        maxMetaDescLength: 160,
        enableOpenGraph: config.enableOpenGraph,
        enableTwitterCard: config.enableTwitterCard,
        enableJsonLd: config.enableJsonLd,
        enableSitemap: config.sitemap?.enabled !== false,
        robotsTxt: config.robotsTxt || ''
      };
      
      console.log('=== GET SEO CONFIG DEBUG ===');
      console.log('Raw config:', config);
      console.log('Frontend data:', frontendData);
      
      res.json({
        success: true,
        data: frontendData
      });
      
    } catch (error) {
      console.error('Get SEO config error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch SEO config',
        error: error.message
      });
    }
  }
  
  // Cập nhật cấu hình SEO
  async updateSEOConfig(req, res) {
    try {
      const configData = req.body;
      
      console.log('=== UPDATE SEO CONFIG DEBUG ===');
      console.log('Received data:', configData);
      
      // Map frontend fields to backend model fields
      const mappedData = {
        siteName: configData.siteName,
        siteDescription: configData.metaDescription, // frontend sends metaDescription, model expects siteDescription
        siteKeywords: configData.keywords ? configData.keywords.split(',').map(k => k.trim()) : [],
        defaultTitle: configData.siteName,
        titleSeparator: configData.titleSeparator || '-',
        defaultMetaDescription: configData.metaDescription,
        robotsTxt: configData.robotsTxt,
        enableOpenGraph: configData.enableOpenGraph !== false,
        enableTwitterCard: configData.enableTwitterCard !== false,
        enableJsonLd: configData.enableJsonLd !== false,
        sitemap: {
          enabled: configData.enableSitemap !== false,
          includeImages: true,
          excludeUrls: []
        },
        socialMedia: {
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
        },
        analytics: {
          googleAnalytics: '',
          googleTagManager: '',
          facebookPixel: ''
        },
        schema: {
          organization: {
            name: configData.siteName || 'Website',
            logo: '',
            url: configData.siteUrl || 'http://localhost:5001',
            contactPoint: []
          },
          website: {
            name: configData.siteName || 'Website',
            url: configData.siteUrl || 'http://localhost:5001',
            potentialAction: {
              target: `${configData.siteUrl || 'http://localhost:5001'}/search?q={search_term_string}`,
              queryInput: 'required name=search_term_string'
            }
          }
        }
      };
      
      console.log('Mapped data:', mappedData);
      
      let config = await SEOConfig.findOne();
      
      if (config) {
        await config.update(mappedData);
        console.log('SEO config updated successfully');
      } else {
        config = await SEOConfig.create(mappedData);
        console.log('SEO config created successfully');
      }
      
      res.json({
        success: true,
        data: config,
        message: 'SEO configuration updated successfully'
      });
      
    } catch (error) {
      console.error('Update SEO config error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update SEO config',
        error: error.message
      });
    }
  }
  
  // Lấy thống kê SEO
  async getSEOStats(req, res) {
    try {
      const totalReports = await SEOReport.count();
      
      const averageScoreResult = await SEOReport.findOne({
        attributes: [
          [SEOReport.sequelize.fn('AVG', SEOReport.sequelize.col('overallScore')), 'avgScore']
        ]
      });
      
      const averageScore = averageScoreResult?.dataValues?.avgScore || 0;
      
      // Score distribution (simplified for SQL)
      const scoreDistribution = [
        { _id: 20, count: await SEOReport.count({ where: { overallScore: { [Op.between]: [0, 40] } } }) },
        { _id: 50, count: await SEOReport.count({ where: { overallScore: { [Op.between]: [40, 60] } } }) },
        { _id: 70, count: await SEOReport.count({ where: { overallScore: { [Op.between]: [60, 80] } } }) },
        { _id: 90, count: await SEOReport.count({ where: { overallScore: { [Op.between]: [80, 100] } } }) }
      ];
      
      // Top issues (simplified - we'll count recommendation types)
      const allReports = await SEOReport.findAll({
        attributes: ['recommendations']
      });
      
      const issueCount = {};
      allReports.forEach(report => {
        if (report.recommendations) {
          report.recommendations.forEach(rec => {
            issueCount[rec.type] = (issueCount[rec.type] || 0) + 1;
          });
        }
      });
      
      const topIssues = Object.entries(issueCount)
        .map(([type, count]) => ({ _id: type, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);
      
      const recentReports = await SEOReport.findAll({
        attributes: ['url', 'overallScore', 'lastAnalyzed'],
        order: [['lastAnalyzed', 'DESC']],
        limit: 5
      });
      
      res.json({
        success: true,
        data: {
          totalReports,
          averageScore: Math.round(averageScore * 100) / 100,
          scoreDistribution,
          topIssues,
          recentReports
        }
      });
      
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to fetch SEO statistics',
        error: error.message
      });
    }
  }
  
  // Generate sitemap
  async generateSitemap(req, res) {
    try {
      const reports = await SEOReport.findAll({
        where: { overallScore: { [Op.gte]: 60 } },
        attributes: ['url', 'lastAnalyzed']
      });
      
      let sitemap = '<?xml version="1.0" encoding="UTF-8"?>\n';
      sitemap += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
      
      reports.forEach(report => {
        sitemap += '  <url>\n';
        sitemap += `    <loc>${report.url}</loc>\n`;
        sitemap += `    <lastmod>${report.lastAnalyzed.toISOString().split('T')[0]}</lastmod>\n`;
        sitemap += '    <changefreq>weekly</changefreq>\n';
        sitemap += '    <priority>0.8</priority>\n';
        sitemap += '  </url>\n';
      });
      
      sitemap += '</urlset>';
      
      res.set('Content-Type', 'application/xml');
      res.send(sitemap);
      
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to generate sitemap',
        error: error.message
      });
    }
  }
  
  // Generate robots.txt từ database
  async generateRobotsTxt(req, res) {
    try {
      let config = await SEOConfig.findOne();
      
      let robotsTxt = '';
      
      if (config && config.robotsTxt) {
        robotsTxt = config.robotsTxt;
        
        // Tự động thêm sitemap nếu chưa có
        if (!robotsTxt.includes('Sitemap:')) {
          const baseUrl = config.schema?.website?.url || `${req.protocol}://${req.get('host')}`;
          robotsTxt += `\n\n# Sitemap\nSitemap: ${baseUrl}/sitemap.xml`;
        }
      } else {
        // Default robots.txt
        const baseUrl = `${req.protocol}://${req.get('host')}`;
        robotsTxt = `User-agent: *
Allow: /

# SEO-friendly URLs - Allow crawling
Allow: /san-pham/
Allow: /danh-muc/
Allow: /tin-tuc/

# Disallow admin pages
Disallow: /admin/
Disallow: /api/admin/

# Sitemap
Sitemap: ${baseUrl}/sitemap.xml`;
      }
      
      res.set('Content-Type', 'text/plain');
      res.send(robotsTxt);
      
    } catch (error) {
      console.error('Generate robots.txt error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to generate robots.txt',
        error: error.message
      });
    }
  }
  
  // Helper method to detect changes
  detectChanges(oldReport, newReport) {
    const changes = [];
    
    if (oldReport.overallScore !== newReport.overallScore) {
      const diff = newReport.overallScore - oldReport.overallScore;
      changes.push(`Overall score changed by ${diff > 0 ? '+' : ''}${diff} points`);
    }
    
    if (oldReport.title?.content !== newReport.title?.content) {
      changes.push('Title changed');
    }
    
    if (oldReport.metaDescription?.content !== newReport.metaDescription?.content) {
      changes.push('Meta description changed');
    }
    
    return changes;
  }
}

const seoController = new SEOController();
module.exports = seoController;
