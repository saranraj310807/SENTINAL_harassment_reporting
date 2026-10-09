import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { db } from '../db/index.js';
import { config } from '../config/index.js';
import { logAudit, hashIp } from '../utils/audit.js';

const SESSION_COOKIE_NAME = 'sentinel_sid';
const CSRF_HEADER_NAME = 'x-csrf-token';
const CSRF_COOKIE_NAME = 'sentinel_csrf';
const SESSION_TTL_HOURS = 24;

export async function hashPassword(plain) {
  return bcrypt.hash(plain, 12);
}

export async function verifyPassword(plain, hashed) {
  return bcrypt.compare(plain, hashed);
}

export function generateToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex');
}

/**
 * Authentication middleware: loads session from SQLite and attaches req.user
 */
export function sessionMiddleware(req, res, next) {
  const sessionId = req.cookies?.[SESSION_COOKIE_NAME];
  req.user = null;
  req.session = null;

  if (sessionId) {
    const now = new Date().toISOString();
    const session = db.prepare(`
      SELECT s.*, u.id as user_id, u.role, u.email, u.full_name, u.department_id, u.is_active
      FROM sessions s
      JOIN users u ON s.user_id = u.id
      WHERE s.id = ? AND s.expires_at > ? AND u.is_active = 1
    `).get(sessionId, now);

    if (session) {
      req.session = { id: session.id, userId: session.user_id };
      req.user = {
        id: session.user_id,
        role: session.role,
        email: session.email,
        fullName: session.full_name,
        departmentId: session.department_id
      };
    }
  }

  // Ensure CSRF cookie exists for double-submit / custom-header validation
  if (!req.cookies?.[CSRF_COOKIE_NAME]) {
    const csrfToken = generateToken(16);
    res.cookie(CSRF_COOKIE_NAME, csrfToken, {
      httpOnly: false, // readable by client JS to include in X-CSRF-Token header
      sameSite: 'lax',
      secure: config.NODE_ENV === 'production',
      path: '/'
    });
    req.csrfToken = csrfToken;
  } else {
    req.csrfToken = req.cookies[CSRF_COOKIE_NAME];
  }

  next();
}

/**
 * CSRF Protection middleware for state-changing requests
 */
export function csrfProtection(req, res, next) {
  const method = req.method.toUpperCase();
  if (['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    return next();
  }

  const expectedToken = req.cookies?.[CSRF_COOKIE_NAME];
  const providedHeader = req.headers[CSRF_HEADER_NAME];

  if (!expectedToken || !providedHeader || expectedToken !== providedHeader) {
    logAudit({
      actorUserId: req.user?.id,
      actorRole: req.user?.role || 'anonymous',
      action: 'CSRF_REJECTED',
      entityType: 'request',
      ip: req.ip,
      details: { path: req.path, method }
    });
    return res.status(403).json({
      error: 'Invalid or missing CSRF token. Please refresh the page and try again.'
    });
  }

  next();
}

/**
 * Require authenticated session
 */
export function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required. Please log in.' });
  }
  next();
}

/**
 * Require specific role(s)
 */
export function requireRole(allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
    if (!roles.includes(req.user.role)) {
      logAudit({
        actorUserId: req.user.id,
        actorRole: req.user.role,
        action: 'UNAUTHORIZED_ACCESS_ATTEMPT',
        entityType: 'endpoint',
        ip: req.ip,
        details: { path: req.path, requiredRoles: roles }
      });
      return res.status(403).json({
        error: 'Access denied: You do not have permission to access this resource.'
      });
    }
    next();
  };
}

/**
 * Helper to create a new session
 */
export function createSession(userId, req, res) {
  const sessionId = generateToken(32);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_HOURS * 60 * 60 * 1000).toISOString();
  const userAgent = req.headers['user-agent'] || 'unknown';
  const ipHashVal = hashIp(req.ip);

  db.prepare(`
    INSERT INTO sessions (id, user_id, expires_at, created_at, user_agent, ip_hash)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(sessionId, userId, expiresAt, now.toISOString(), userAgent, ipHashVal);

  res.cookie(SESSION_COOKIE_NAME, sessionId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.NODE_ENV === 'production',
    maxAge: SESSION_TTL_HOURS * 60 * 60 * 1000,
    path: '/'
  });

  return sessionId;
}

/**
 * Helper to destroy session
 */
export function destroySession(req, res) {
  const sessionId = req.cookies?.[SESSION_COOKIE_NAME];
  if (sessionId) {
    db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
    res.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
  }
}
