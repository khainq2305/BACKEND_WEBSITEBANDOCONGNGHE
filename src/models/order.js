const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Order = sequelize.define('Order', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
status: {
  // chỉ luồng xử lý/hậu cần, KHÔNG dính tới tiền
  type: DataTypes.ENUM('processing', 'shipping', 'delivered', 'completed', 'cancelled'),
  defaultValue: 'processing',
},

paymentStatus: {
  type: DataTypes.ENUM('unpaid', 'waiting', 'paid', 'refunded', 'processing'),
  defaultValue: 'unpaid',
},
vnpOrderId: {
  type: DataTypes.STRING,
  allowNull: true,
  comment: 'Mã đơn VNPay được sinh ra khi thanh toán (dùng để phân biệt mỗi lần retry)',
},

  shippingProviderId: {
    type: DataTypes.INTEGER,
    allowNull: true, // null nếu chưa chọn (hoặc giao tay)
    comment: 'ID hãng vận chuyển: 1=GHN, 2=GHTK, 3=J&T...'
  },
shippingServiceId: {
  type: DataTypes.INTEGER,
  allowNull: true,
  comment: 'ID dịch vụ vận chuyển (liên kết với bảng service nếu có)'
},

  shippingLeadTime: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Thời gian dự kiến giao hàng (ETD)'
  },


orderCode: {
  type: DataTypes.STRING,
  unique: true,
  allowNull: false,
},
  couponDiscount: {
    type: DataTypes.FLOAT,
    defaultValue: 0
  },
  shippingDiscount: {
    type: DataTypes.FLOAT,
    defaultValue: 0
  },
  note: DataTypes.TEXT,
  shippingFee: DataTypes.DECIMAL(10, 2),
  finalPrice: DataTypes.DECIMAL(10, 2),
  ghnOrderCode: DataTypes.STRING,
  cancelReason: DataTypes.TEXT,
    momoOrderId: {
    type: DataTypes.STRING,
    unique: true,
    allowNull: true,
  },
  momoTransId: {
  type: DataTypes.STRING,
  allowNull: true,
  comment: 'Mã giao dịch MoMo trả về sau thanh toán thành công'
},
// Trong Order model
proofUrl: {
  type: DataTypes.STRING,
  allowNull: true,
  comment: 'Đường dẫn tới file chứng từ thanh toán (ảnh, PDF, ...)',
},
vnpTransactionId: {
  type: DataTypes.STRING,
  allowNull: true,
  comment: 'Mã giao dịch VNPay trả về sau thanh toán thành công',
},
zaloTransId: {
  type: DataTypes.STRING,
  allowNull: true,
  comment: 'Mã giao dịch ZaloPay trả về sau thanh toán thành công',
},
zaloAppTransId: {
  type: DataTypes.STRING,
  allowNull: true,
  comment: 'Mã app_trans_id của ZaloPay dùng để hoàn tiền',
},

stripePaymentIntentId: {
  type: DataTypes.STRING,
  allowNull: true,
  comment: 'ID của Stripe PaymentIntent dùng để hoàn tiền'
},


  refundStatus: DataTypes.ENUM('none', 'requested', 'approved', 'rejected'),
  totalPrice: DataTypes.DECIMAL(10, 2),
  paymentTime: DataTypes.DATE,
  userId: DataTypes.INTEGER,
  userAddressId: DataTypes.INTEGER,
  paymentMethodId: DataTypes.INTEGER
}, {
  tableName: 'orders',
  timestamps: true,
});

module.exports = Order;
