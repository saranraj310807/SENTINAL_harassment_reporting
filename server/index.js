import express from 'express';
import path from 'node:path';
import cookieParser from 'cookie-parser';
import compression from 'compression';
import { config } from './config/index.js';
import { runMigrations } from './migrations/migrator.js';
import { seedDatabase } from './seed/seed.js';
import { sessionMiddleware, csrfProtection } from './middleware/auth.js';
import { helmetMiddleware, globalLimiter, errorHandler } from './middleware/security.js';

// Route imports
import authRoutes from './routes/auth.js';
import metaRoutes from './routes/meta.js';
import casesRoutes from './routes/cases.js';
import audioRoutes from './routes/audio.js';
import evidenceRoutes from './routes/evidence.js';
import cctvRoutes from './routes/cctv.js';
import escalationRoutes from './routes/escalation.js';
import whatsappRoutes from './routes/whatsapp.js';
import analyticsRoutes from './routes/analytics.js';
import auditRoutes from './routes/audit.js';
import notificationsRoutes from './routes/notifications.js';
import adminRoutes from './routes/admin.js';
import listenRoutes from './routes/listen.js';

const app = express();

// Security and compression
app.use(helmetMiddleware);
app.use(compression());
app.use('/api', globalLimiter);

// Body parsers with limits
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(cookieParser(config.SESSION_SECRET));

// Session & CSRF middleware
app.use(sessionMiddleware);

// Static files (from /public only; storage is strictly private)
const publicDir = path.join(config.ROOT_DIR, 'public');
app.use(express.static(publicDir));

// State-changing CSRF protection on API routes (except login/register where session is initialized)
app.use('/api', (req, res, next) => {
  if (
    req.path === '/auth/login' ||
    req.path === '/auth/register' ||
    req.originalUrl.startsWith('/api/auth/login') ||
    req.originalUrl.startsWith('/api/auth/register')
  ) {
    return next();
  }
  return csrfProtection(req, res, next);
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/meta', metaRoutes);
app.use('/api/cases', casesRoutes);
app.use('/api', audioRoutes);
app.use('/api/evidence', evidenceRoutes);
app.use('/api/cctv', cctvRoutes);
app.use('/api/escalation', escalationRoutes);
app.use('/api/whatsapp', whatsappRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/audit-logs', auditRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/admin', adminRoutes);

// Standalone minimal expiring audio link player
app.use('/listen', listenRoutes);

// Fallback for single-page application routing (hash router is in index.html)
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Endpoint not found' });
  }
  res.sendFile(path.join(publicDir, 'index.html'));
});

// Error handling middleware
app.use(errorHandler);

// Server startup
export async function startServer() {
  // 1. Run migrations
  runMigrations();

  // 2. Seed database if configured
  if (config.SEED_DEMO_DATA) {
    await seedDatabase(false);
  }

  // 3. Start listener
  const server = app.listen(config.PORT, '0.0.0.0', () => {
    console.log('=====================================================');
    console.log(`🛡️  SENTINEL Campus Safety System is running!`);
    console.log(`📡 Local URL:  http://localhost:${config.PORT}`);
    console.log(`🌍 Base URL:   ${config.APP_BASE_URL}`);
    console.log(`⏰ Timezone:   ${config.CAMPUS_TIMEZONE}`);
    console.log('=====================================================');
    console.log('🔑 Demo Accounts (Password: SentinelDemo2026!):');
    console.log('   - Student:          priya.sharma@campus.edu');
    console.log('   - HOD (CSE):        hod.cse@campus.edu');
    console.log('   - Dean:             dean.studentaffairs@campus.edu');
    console.log('   - Higher Authority: director.safety@campus.edu');
    console.log('=====================================================');
  });

  return { app, server };
}

// Start immediately if executed directly
import { fileURLToPath } from 'node:url';
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  startServer().catch(err => {
    console.error('Fatal startup error:', err);
    process.exit(1);
  });
}

export default app;
