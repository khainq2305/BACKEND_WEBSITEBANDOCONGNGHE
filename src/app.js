// app.js
const express = require('express');
const cors = require('cors');
const path = require('path');
const bodyParser = require('body-parser'); // chỉ để xử lý raw cho Stripe
const stripeWebhookRoute = require('./webhook/stripeWebhookRoute'); // nếu bạn dùng Stripe
const payosWebhookRoute = require('./webhook/payosWebhookRoute');
const clientRoutes = require('./routes/client');
const adminRoutes  = require('./routes/admin');
const sequelize    = require('./config/database');

const app = express();

// Healthcheck cho Render
app.get('/health', (_req, res) => res.send('ok'));

// CORS qua ENV (prod không hard-code)
const allowOrigins = (process.env.CORS_ORIGIN || 'http://localhost:9999')
  .split(',')
  .map(s => s.trim());

app.use((req, res, next) => {
  next();
});

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

// Stripe webhook (PHẢI trước express.json để giữ raw body)
app.use(
  '/orders/stripe/webhook',
  bodyParser.raw({ type: 'application/json' }),
  stripeWebhookRoute
);

// app.js
app.use(
  "/payment/payos-webhook", 
  express.json(),
  require("./webhook/payosWebhookRoute")
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
    require('./cron'); // chỉ chạy cron khi DB ok
  } catch (err) {
    console.error('❌ Lỗi kết nối MySQL:', err);
  }
})();

module.exports = app;
