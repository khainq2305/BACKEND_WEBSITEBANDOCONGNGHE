// Load environment variables first
require('dotenv').config();

// Import database connection and models
const connection = require('./src/config/database');
const { SEOReport, SEOConfig } = require('./src/models');

async function createSEOTables() {
  try {
    console.log('Testing database connection...');
    await connection.authenticate();
    console.log('✓ Database connection successful');
    
    console.log('Creating SEO tables...');
    
    // Create SEO Config table first (no dependencies)
    await SEOConfig.sync({ force: false });
    console.log('✓ SEOConfig table created/checked');
    
    // Create SEO Reports table
    await SEOReport.sync({ force: false });
    console.log('✓ SEOReport table created/checked');
    
    // Check if default config exists, if not create it
    const existingConfig = await SEOConfig.findOne();
    if (!existingConfig) {
      await SEOConfig.create({
        siteName: 'Website Bán Đồ Công Nghệ',
        siteDescription: 'Website bán các sản phẩm công nghệ chất lượng cao',
        siteKeywords: ['công nghệ', 'điện thoại', 'laptop', 'máy tính'],
        defaultTitle: 'Website Bán Đồ Công Nghệ',
        titleSeparator: '-',
        defaultMetaDescription: 'Chuyên bán các sản phẩm công nghệ chất lượng cao với giá cả hợp lý',
        robotsTxt: 'User-agent: *\nDisallow:',
        sitemap: {
          enabled: true,
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
            name: 'Website Bán Đồ Công Nghệ',
            logo: '',
            url: 'http://localhost:5000',
            contactPoint: []
          },
          website: {
            name: 'Website Bán Đồ Công Nghệ',
            url: 'http://localhost:5000',
            potentialAction: {
              target: 'http://localhost:5000/search?q={search_term_string}',
              queryInput: 'required name=search_term_string'
            }
          }
        }
      });
      console.log('✓ Default SEO config created');
    }
    
    console.log('SEO tables setup completed successfully!');
    await connection.close();
    process.exit(0);
  } catch (error) {
    console.error('Error creating SEO tables:', error);
    await connection.close();
    process.exit(1);
  }
}

createSEOTables();
