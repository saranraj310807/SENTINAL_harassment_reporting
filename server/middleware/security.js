import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { config } from '../config/index.js';
import { logAudit } from '../utils/audit.js';

// Helmet CSP configuration: strictly no inline scripts, allow blob: and media for local audio playback
export const helmetMiddleware = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"], // needed for component style updates and tokens
      imgSrc: ["'self'", 'data:', 'blob:'],
      mediaSrc: ["'self'", 'blob:'], // for local audio recording and playback
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
      upgradeInsecureRequests: config.NODE_ENV === 'production' ? [] : null
    }
  },
  crossOriginEmbedderPolicy: false
});

// Global API rate limiter
export const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: config.NODE_ENV === 'test' ? 2000 : 180,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please slow down and try again later.' }
});

// Sensitive login rate limiter
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: config.NODE_ENV === 'test' ? 1000 : 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts from this network. Please wait 15 minutes.' }
});

// Complaint submission rate limiter
export const submissionLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: config.NODE_ENV === 'test' ? 1000 : 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Submission limit reached. Please wait before submitting another report.' }
});

// Centralized error handler
export function errorHandler(err, req, res, next) {
  const isProd = config.NODE_ENV === 'production';
  const statusCode = err.statusCode || (err.name === 'ZodError' ? 400 : 500);

  logAudit({
    actorUserId: req.user?.id,
    actorRole: req.user?.role || 'system',
    action: 'SERVER_ERROR',
    entityType: 'error',
    ip: req.ip,
    details: {
      path: req.path,
      statusCode,
      message: err.message,
      name: err.name
    }
  });

  if (err.name === 'ZodError') {
    return res.status(400).json({
      error: 'Validation failed',
      details: err.errors.map(e => ({ field: e.path.join('.'), message: e.message }))
    });
  }

  res.status(statusCode).json({
    error: isProd && statusCode === 500
      ? 'An internal server error occurred. Please contact campus security administration.'
      : err.message
  });
}
