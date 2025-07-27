const axios = require('axios');

const verifyTurnstile = async (token, ip) => {
  const secretKey = process.env.TURNSTILE_SECRET_KEY; // set key này trong .env
  try {
    const response = await axios.post(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      new URLSearchParams({
        secret: secretKey,
        response: token,
        remoteip: ip || '',
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );
    return response.data.success;
  } catch (err) {
    console.error('Turnstile verify error:', err);
    return false;
  }
};

module.exports = verifyTurnstile;
