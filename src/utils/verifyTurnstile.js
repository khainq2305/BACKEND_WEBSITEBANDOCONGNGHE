const axios = require('axios'); // Changed from import

async function verifyTurnstile(token, ip) {
  try {
    const secret = process.env.TURNSTILE_SECRET_KEY;
    console.log('USING SECRET:', process.env.TURNSTILE_SECRET_KEY);
    // 💡 Log đầu vào trước khi gửi
    console.log('[DEBUG] Sending verify payload:', {
      secret,
      response: token,
      remoteip: ip
    });

    const res = await axios.post(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      new URLSearchParams({
        secret,
        response: token,
        remoteip: ip
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );

    // 🔍 Log phản hồi để kiểm tra lỗi chi tiết
    console.log('[DEBUG] Cloudflare response:', res.data);

    return res.data.success === true;
  } catch (err) {
    console.error('❌ Error verifying Turnstile:', err.response?.data || err.message);
    return false;
  }
}

// Export the function using CommonJS syntax
module.exports = {
  verifyTurnstile,
};