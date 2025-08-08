require('dotenv').config();
const PayOS = require('@payos/node');

// Khởi tạo với thông tin từ .env
const payos = new PayOS(
  process.env.PAYOS_CLIENT_ID,
  process.env.PAYOS_API_KEY,
  process.env.PAYOS_CHECKSUM_KEY
);

async function testCreatePayment() {
  try {
    const orderCode = Date.now(); // mã đơn random
    const amount = 4922000;

    const res = await payos.createPaymentLink({
      orderCode,
      amount,
     description: `DH${orderCode}`, // hoặc "Thanh toán DH001"

      buyerName: 'Nguyen Quoc Khai',
      buyerEmail: 'test@example.com',
      buyerPhone: '0912345678',
      returnUrl: 'https://your-ngrok-url/order-confirmation',
      cancelUrl: 'https://your-ngrok-url/checkout',
      items: [
        {
          name: `Đơn hàng ${orderCode}`,
          quantity: 1,
          price: amount
        }
      ]
    });

    console.log('✅ Tạo link thành công:', res.checkoutUrl);
  } catch (error) {
    console.error('❌ Lỗi tạo link:', error?.response?.data || error.message);
  }
}

testCreatePayment();
