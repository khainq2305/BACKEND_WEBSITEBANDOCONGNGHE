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
