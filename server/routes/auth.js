import express from 'express';
import { db } from '../db/index.js';
import { hashPassword, verifyPassword, createSession, destroySession, requireAuth } from '../middleware/auth.js';
import { loginLimiter } from '../middleware/security.js';
import { loginSchema, registerStudentSchema } from '../utils/validation.js';
import { logAudit } from '../utils/audit.js';

const router = express.Router();

// Login
router.post('/login', loginLimiter, async (req, res, next) => {
  try {
    const data = loginSchema.parse(req.body);
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(data.email.toLowerCase().trim());

    if (!user) {
      logAudit({
        actorRole: 'anonymous',
        action: 'LOGIN_FAILED',
        entityType: 'user',
        ip: req.ip,
        details: { email: data.email, reason: 'User not found' }
      });
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Check account lockout
    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      return res.status(423).json({
        error: `Account temporarily locked due to failed login attempts. Please try again after ${new Date(user.locked_until).toLocaleTimeString()}.`
      });
    }

    const valid = await verifyPassword(data.password, user.password_hash);
    if (!valid) {
      const newFailed = (user.failed_logins || 0) + 1;
      let lockedUntil = null;
      if (newFailed >= 5) {
        // Lock for 15 minutes
        lockedUntil = new Date(Date.now() + 15 * 60 * 1000).toISOString();
      }

      db.prepare('UPDATE users SET failed_logins = ?, locked_until = ? WHERE id = ?')
        .run(newFailed, lockedUntil, user.id);

      logAudit({
        actorUserId: user.id,
        actorRole: user.role,
        action: 'LOGIN_FAILED',
        entityType: 'user',
        ip: req.ip,
        details: { failedCount: newFailed }
      });

      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Reset failed logins
    db.prepare('UPDATE users SET failed_logins = 0, locked_until = NULL WHERE id = ?').run(user.id);

    // Create session (regenerates session token to protect against fixation)
    createSession(user.id, req, res);

    logAudit({
      actorUserId: user.id,
      actorRole: user.role,
      action: 'LOGIN_SUCCESS',
      entityType: 'user',
      entityId: user.id,
      ip: req.ip
    });

    let studentProfile = null;
    if (user.role === 'student') {
      studentProfile = db.prepare('SELECT * FROM students WHERE user_id = ?').get(user.id);
    }

    let department = null;
    if (user.department_id) {
      department = db.prepare('SELECT * FROM departments WHERE id = ?').get(user.department_id);
    }

    res.json({
      success: true,
      user: {
        id: user.id,
        role: user.role,
        email: user.email,
        fullName: user.full_name,
        departmentId: user.department_id,
        departmentName: department ? department.name : null,
        studentProfile
      }
    });
  } catch (err) {
    next(err);
  }
});

// Register new student (demo)
router.post('/register', async (req, res, next) => {
  try {
    const data = registerStudentSchema.parse(req.body);
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(data.email.toLowerCase());
    if (existing) {
      return res.status(409).json({ error: 'An account with this email address already exists.' });
    }

    const existingSif = db.prepare('SELECT user_id FROM students WHERE sif_number = ?').get(data.sif_number.toUpperCase());
    if (existingSif) {
      return res.status(409).json({ error: 'This SIF number is already registered.' });
    }

    const hash = await hashPassword(data.password);
    const now = new Date().toISOString();

    const result = db.transaction(() => {
      const userRes = db.prepare(`
        INSERT INTO users (role, email, password_hash, full_name, department_id, created_at)
        VALUES ('student', ?, ?, ?, ?, ?)
      `).run(data.email.toLowerCase(), hash, data.full_name, data.department_id, now);

      const userId = userRes.lastInsertRowid;
      const accountId = `ACC-${data.sif_number.toUpperCase()}`;

      db.prepare(`
        INSERT INTO students (user_id, sif_number, department_id, programme, year_of_study, section, phone, student_account_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        userId,
        data.sif_number.toUpperCase(),
        data.department_id,
        data.programme,
        data.year_of_study,
        data.section.toUpperCase(),
        data.phone,
        accountId
      );

      return userId;
    })();

    createSession(result, req, res);

    logAudit({
      actorUserId: result,
      actorRole: 'student',
      action: 'REGISTER_STUDENT',
      entityType: 'user',
      entityId: result,
      ip: req.ip
    });

    res.status(201).json({
      success: true,
      message: 'Student account registered successfully'
    });
  } catch (err) {
    next(err);
  }
});

// Get current session
router.get('/me', (req, res) => {
  if (!req.user) {
    return res.json({ authenticated: false, user: null, csrfToken: req.csrfToken });
  }

  let studentProfile = null;
  if (req.user.role === 'student') {
    studentProfile = db.prepare('SELECT * FROM students WHERE user_id = ?').get(req.user.id);
  }

  let department = null;
  if (req.user.departmentId) {
    department = db.prepare('SELECT * FROM departments WHERE id = ?').get(req.user.departmentId);
  }

  res.json({
    authenticated: true,
    csrfToken: req.csrfToken,
    user: {
      id: req.user.id,
      role: req.user.role,
      email: req.user.email,
      fullName: req.user.fullName,
      departmentId: req.user.departmentId,
      departmentName: department ? department.name : null,
      studentProfile
    }
  });
});

// Logout
router.post('/logout', (req, res) => {
  if (req.user) {
    logAudit({
      actorUserId: req.user.id,
      actorRole: req.user.role,
      action: 'LOGOUT',
      entityType: 'user',
      entityId: req.user.id,
      ip: req.ip
    });
  }
  destroySession(req, res);
  res.json({ success: true, message: 'Logged out successfully' });
});

export default router;
