//--------------------------------------------------
//  VNPay Service – tạo link thanh toán (version 2.1.0)
//--------------------------------------------------
const crypto = require('crypto');
const moment = require('moment-timezone');

/* Bỏ dấu tiếng Việt & ký tự lạ */
function toLatin(str = '') {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s\-]/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

exports.createPaymentLink = ({
  orderId,            // Mã đơn (duy nhất trong ngày)
  amount,             // Số tiền (VND)
  orderInfo,
  locale    = 'vn',
  bankCode  = '',     // 'VNPAYQR' để ép hiển thị QR
  orderType = 'other',
  expireMin = 15,
}) => {
  const VNP_TMN_CODE   = process.env.VNP_TMNCODE;
  const VNP_HASHSECRET = process.env.VNP_HASH_SECRET.trim();
  const VNP_URL        = process.env.VNP_URL;
  const VNP_RETURN_URL = process.env.VNP_RETURN_URL;

  const now = moment().tz('Asia/Ho_Chi_Minh');

  const params = {
    vnp_Version   : '2.1.0',
    vnp_Command   : 'pay',
    vnp_TmnCode   : VNP_TMN_CODE,
    vnp_Amount    : Math.round(+amount) * 100,          // nhân 100
    vnp_CurrCode  : 'VND',
    vnp_TxnRef    : orderId,
    vnp_OrderInfo : toLatin(orderInfo),
    vnp_OrderType : orderType,
    vnp_Locale    : locale,
    vnp_ReturnUrl : VNP_RETURN_URL,
    vnp_IpAddr    : '127.0.0.1',
    vnp_CreateDate: now.format('YYYYMMDDHHmmss'),
    vnp_ExpireDate: now.add(expireMin, 'm').format('YYYYMMDDHHmmss'),
  };
  if (bankCode) params.vnp_BankCode = bankCode;

  /* sort A→Z và encode value */
  const signData = Object.entries(params)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&');

  const secureHash = crypto
    .createHmac('sha512', VNP_HASHSECRET)
    .update(Buffer.from(signData, 'utf8'))
    .digest('hex');

  return (
    VNP_URL +
    '?' +
    signData +
    `&vnp_SecureHashType=SHA512&vnp_SecureHash=${secureHash}`
  );
};
