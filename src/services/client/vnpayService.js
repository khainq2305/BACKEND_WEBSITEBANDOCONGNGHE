//--------------------------------------------------
//  VNPay Service – tạo link thanh toán (version 2.1.0)
//--------------------------------------------------
const crypto = require('crypto');
const moment = require('moment-timezone');
const qs = require('qs'); // 👈 cần dùng để stringify đúng cách

/* Bỏ dấu tiếng Việt & ký tự lạ */
function toLatin(str = '') {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s\-]/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Tạo link thanh toán VNPay
 */
function createPaymentLink({
  orderId,
  amount,
  orderInfo,
  locale = 'vn',
  bankCode = '',
  orderType = 'other',
  expireMin = 15,
}) {
  const VNP_TMN_CODE   = process.env.VNP_TMNCODE;
  const VNP_HASHSECRET = process.env.VNP_HASH_SECRET.trim();
  const VNP_URL        = process.env.VNP_URL;
  const VNP_RETURN_URL = process.env.VNP_RETURN_URL;

  const now = moment().tz('Asia/Ho_Chi_Minh');

  const params = {
    vnp_Version   : '2.1.0',
    vnp_Command   : 'pay',
    vnp_TmnCode   : VNP_TMN_CODE,
    vnp_Amount    : Math.round(+amount) * 100,
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
}

/**
 * ✅ Xác thực checksum của VNPay callback (IPN hoặc redirect)
 */
function verifySignature(params, secureHash) {
  const VNP_HASHSECRET = process.env.VNP_HASH_SECRET.trim();

  const filtered = { ...params };
  delete filtered.vnp_SecureHash;
  delete filtered.vnp_SecureHashType;

  const signData = qs.stringify(filtered, {
    encode: false,
    sort: (a, b) => a.localeCompare(b),
  });

  const hash = crypto
    .createHmac('sha512', VNP_HASHSECRET)
    .update(Buffer.from(signData, 'utf-8'))
    .digest('hex');

  return hash === secureHash;
}

module.exports = {
  createPaymentLink,
  verifySignature, // 👈 export đầy đủ
};
