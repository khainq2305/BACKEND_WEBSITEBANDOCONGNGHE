// utils/slug.js
const crypto = require('crypto');

function uniqueSlug(base) {
  const short = crypto.randomBytes(4).toString('hex'); // 8 hex chars
  return `${base}-${Date.now()}-${short}`;
}

module.exports = { uniqueSlug };
