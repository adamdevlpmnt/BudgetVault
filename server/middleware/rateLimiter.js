const rateLimit = require('express-rate-limit');

/**
 * Rate limiter for login endpoint — anti brute-force
 * 5 attempts per 15 minutes per IP
 */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  message: {
    error: 'Trop de tentatives de connexion. Réessayez dans 15 minutes.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * General API rate limiter
 * 200 requests per minute per IP
 */
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 200,
  message: {
    error: 'Trop de requêtes. Veuillez patienter.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Upload rate limiter
 * 10 uploads per minute
 */
const uploadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: {
    error: 'Trop d\'uploads. Veuillez patienter.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = { loginLimiter, apiLimiter, uploadLimiter };
