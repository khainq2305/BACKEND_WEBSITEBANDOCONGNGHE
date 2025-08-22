const express = require('express');
const cors = require('cors');
const path = require('path');
const bodyParser = require('body-parser');
const stripeWebhookRoute = require('./webhook/stripeWebhookRoute');
const clientRoutes = require('./routes/client');
const adminRoutes = require('./routes/admin');
const sequelize = require('./config/database');
const WalletController = require('./controllers/client/WalletController');

const app = express();

app.get('/health', (_req, res) => res.send('ok'));

const allowOrigins = (process.env.CORS_ORIGIN || 'http://localhost:9999')
  .split(',')
  .map(s => s.trim());

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

app.post(
  '/orders/stripe/webhook',
  bodyParser.raw({ type: 'application/json' }),
  stripeWebhookRoute
);

app.post(
  '/webhooks/payos/payout',
  express.json({ type: 'application/json' }),
  WalletController.payoutWebhook
);

app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

app.use('/uploads', express.static(path.join(__dirname, '../public/uploads')));

// SEO public routes (không cần authentication)
const seoController = require('./controllers/admin/seoController');
app.get('/robots.txt', (req, res) => seoController.generateRobotsTxt(req, res));
app.get('/sitemap.xml', (req, res) => seoController.generateSitemap(req, res));

// Public SEO config endpoint cho frontend
app.get('/api/seo/config', async (req, res) => {
  try {
    const SEOConfig = require('./models/seoConfig');
    const config = await SEOConfig.findOne();
    
    if (!config) {
      return res.json({
        success: true,
        data: {
          siteName: 'Điện Thoại Giá Kho',
          defaultTitle: 'Điện Thoại Giá Kho - Cửa hàng điện thoại uy tín, giá tốt nhất',
          siteDescription: 'Mua điện thoại chính hãng với giá tốt nhất tại Điện Thoại Giá Kho',
          siteKeywords: ['điện thoại', 'iPhone', 'Samsung', 'Xiaomi'],
          enableOpenGraph: true,
          enableTwitterCard: true,
          enableJsonLd: true
        }
      });
    }
    
    // Chỉ trả về thông tin cần thiết cho frontend
    res.json({
      success: true,
      data: {
        siteName: config.siteName || 'Điện Thoại Giá Kho',
        defaultTitle: config.defaultTitle || config.siteName || 'Điện Thoại Giá Kho',
        siteDescription: config.siteDescription || 'Mua điện thoại chính hãng với giá tốt nhất',
        siteKeywords: config.siteKeywords || [],
        enableOpenGraph: config.enableOpenGraph !== false,
        enableTwitterCard: config.enableTwitterCard !== false,
        enableJsonLd: config.enableJsonLd !== false,
        socialMedia: config.socialMedia
      }
    });
    
  } catch (error) {
    console.error('Public SEO config error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get SEO config',
      error: error.message
    });
  }
});

app.use('/admin', adminRoutes);
app.use('/', clientRoutes);

(async () => {
  try {
    await sequelize.authenticate();
    console.log('✅ MySQL connected');
    require('./cron');
  } catch (err) {
    console.error('❌ Lỗi kết nối MySQL:', err);
  }
})();

module.exports = app;
