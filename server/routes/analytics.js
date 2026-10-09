import express from 'express';
import { db } from '../db/index.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = express.Router();

router.get('/', requireAuth, requireRole(['hod', 'dean', 'higher']), (req, res) => {
  const { departmentId, category, days } = req.query;
  const daysNum = parseInt(days || '60', 10);
  const cutoffDate = new Date(Date.now() - daysNum * 24 * 3600 * 1000).toISOString();

  let baseWhere = 'WHERE c.created_at >= ?';
  const params = [cutoffDate];

  if (departmentId && departmentId !== 'all') {
    baseWhere += ' AND c.department_id = ?';
    params.push(departmentId);
  }

  if (category && category !== 'all') {
    baseWhere += ' AND c.category = ?';
    params.push(category);
  }

  // 1. Core Summary Metrics
  const summary = db.prepare(`
    SELECT
      COUNT(*) as total_cases,
      SUM(CASE WHEN c.status IN ('Resolved', 'Closed') THEN 1 ELSE 0 END) as resolved_cases,
      SUM(CASE WHEN c.status NOT IN ('Resolved', 'Closed') THEN 1 ELSE 0 END) as open_cases,
      SUM(CASE WHEN c.status = 'Awaiting Review' THEN 1 ELSE 0 END) as awaiting_review,
      SUM(CASE WHEN c.urgent = 1 THEN 1 ELSE 0 END) as urgent_cases
    FROM cases c
    ${baseWhere}
  `).get(...params);

  // 2. Department Breakdown
  const departmentBreakdown = db.prepare(`
    SELECT d.id, d.code, d.name, COUNT(c.id) as count
    FROM departments d
    LEFT JOIN cases c ON c.department_id = d.id AND c.created_at >= ?
    GROUP BY d.id
    ORDER BY count DESC
  `).all(cutoffDate);

  // 3. Category Distribution
  const categoryBreakdown = db.prepare(`
    SELECT c.category, COUNT(*) as count
    FROM cases c
    ${baseWhere}
    GROUP BY c.category
    ORDER BY count DESC
  `).all(...params);

  // 4. Escalation Levels
  const escalationBreakdown = db.prepare(`
    SELECT c.assigned_level, COUNT(*) as count
    FROM cases c
    ${baseWhere}
    GROUP BY c.assigned_level
  `).all(...params);

  // 5. Zone Hotspots (Zone names only, strictly no student details)
  const zoneBreakdown = db.prepare(`
    SELECT l.zone, COUNT(*) as count
    FROM cases c
    JOIN campus_locations l ON c.campus_location_id = l.id
    ${baseWhere}
    GROUP BY l.zone
    ORDER BY count DESC
  `).all(...params);

  // 6. CCTV Request Status Distribution
  const cctvStatus = db.prepare(`
    SELECT status, COUNT(*) as count
    FROM cctv_requests
    GROUP BY status
  `).all();

  // 7. Weekly Trends (Last 8 weeks)
  const weeklyTrends = db.prepare(`
    SELECT 
      strftime('%Y-W%W', c.incident_at) as week,
      COUNT(*) as total,
      SUM(CASE WHEN c.urgent = 1 THEN 1 ELSE 0 END) as urgent_count
    FROM cases c
    ${baseWhere}
    GROUP BY week
    ORDER BY week ASC
  `).all(...params);

  // 8. Privacy Notice & Small-count suppression flag
  res.json({
    disclaimer: 'Campus Analytics Aggregation: Seeded with realistic demonstration prototype data. Student identities are strictly excluded from aggregates.',
    summary: {
      total: summary?.total_cases || 0,
      resolved: summary?.resolved_cases || 0,
      open: summary?.open_cases || 0,
      awaitingReview: summary?.awaiting_review || 0,
      urgent: summary?.urgent_cases || 0,
      resolutionRate: summary?.total_cases > 0
        ? Math.round(((summary.resolved_cases || 0) / summary.total_cases) * 100)
        : 0
    },
    departmentBreakdown,
    categoryBreakdown,
    escalationBreakdown,
    zoneBreakdown,
    cctvStatus,
    weeklyTrends
  });
});

export default router;
