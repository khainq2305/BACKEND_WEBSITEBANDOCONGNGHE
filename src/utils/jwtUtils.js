const jwt = require('jsonwebtoken');
const { secret, expiresIn } = require('../config/jwt');

exports.generateToken = (payload) => {
  return jwt.sign(payload, secret, { expiresIn });
};

exports.verifyToken = (token) => {
  return jwt.verify(token, secret);
};
