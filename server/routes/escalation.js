import express from 'express';
import { db } from '../db/index.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import {
  confirmLinkCandidate,
  rejectLinkCandidate,
  getEscalationPolicy,
  DEFAULT_POLICY
} from '../engine/escalation.js';
import { linkReviewSchema, policyUpdateSchema } from '../utils/validation.js';
import { logAudit } from '../utils/audit.js';

const router = express.Router();

// List pending link review candidates for authorities
router.get('/candidates', requireAuth, requireRole(['hod', 'dean', 'higher']), (req, res) => {
  const user = req.user;

  let query = `
    SELECT lc.*,
      c.case_ref, c.category, c.incident_at, c.department_id, c.urgent,
      l.name as location_name,
      cg.level as target_group_level,
      (SELECT COUNT(*) FROM cases WHERE group_id = cg.id AND counts_toward_escalation = 1) as current_group_count
    FROM link_candidates lc
    JOIN cases c ON lc.case_id = c.id
    JOIN case_groups cg ON lc.candidate_group_id = cg.id
    LEFT JOIN campus_locations l ON c.campus_location_id = l.id
    WHERE lc.state = 'pending'
  `;

  const params = [];
  if (user.role === 'hod') {
    query += ' AND c.department_id = ?';
    params.push(user.departmentId);
  }

  query += ' ORDER BY lc.score DESC, c.incident_at DESC';

  const candidates = db.prepare(query).all(...params);

  // Format JSON fields
  const formatted = candidates.map(cand => {
    let matched = [];
    let unmatched = [];
    try { matched = JSON.parse(cand.matched_factors); } catch {}
    try { unmatched = JSON.parse(cand.unmatched_factors); } catch {}

    // Fetch sample cases from the candidate group
    const targetGroupCases = db.prepare(`
      SELECT id, case_ref, category, incident_at, urgent, status
      FROM cases
      WHERE group_id = ?
      LIMIT 3
    `).all(cand.candidate_group_id);

    return {
      id: cand.id,
      caseId: cand.case_id,
      caseRef: cand.case_ref,
      category: cand.category,
      incidentAt: cand.incident_at,
      locationName: cand.location_name,
      urgent: Boolean(cand.urgent),
      targetGroupId: cand.candidate_group_id,
      targetGroupLevel: cand.target_group_level,
      currentGroupCount: cand.current_group_count,
      score: cand.score,
      matchedFactors: matched,
      unmatchedFactors: unmatched,
      targetGroupCases,
      disclaimer: 'A match is a prompt for human review, not evidence of wrongdoing.'
    };
  });

  res.json({ candidates: formatted });
});

// Confirm link candidate
router.post('/candidates/:id/confirm', requireAuth, requireRole(['hod', 'dean', 'higher']), (req, res, next) => {
  try {
    const user = req.user;
    const candidateId = req.params.id;
    const data = linkReviewSchema.parse(req.body);

    const result = confirmLinkCandidate(candidateId, user.id, user.role, data.review_note);
    res.json({
      success: true,
      message: 'Incident relationship confirmed and merged into case group.',
      ...result
    });
  } catch (err) {
    next(err);
  }
});

// Reject link candidate
router.post('/candidates/:id/reject', requireAuth, requireRole(['hod', 'dean', 'higher']), (req, res, next) => {
  try {
    const user = req.user;
    const candidateId = req.params.id;
    const data = linkReviewSchema.parse(req.body);

    const result = rejectLinkCandidate(candidateId, user.id, user.role, data.review_note);
    res.json({
      success: true,
      message: 'Link candidate marked as unrelated.',
      ...result
    });
  } catch (err) {
    next(err);
  }
});

// View Escalation Policy
router.get('/policy', requireAuth, requireRole(['hod', 'dean', 'higher']), (req, res) => {
  const policy = getEscalationPolicy();
  res.json({
    policy,
    rulesSummary: {
      singletonStart: 'Every new case starts at Level 1 (HOD) in its own group.',
      countThresholds: '1 Case = HOD, 2 Confirmed Cases = Dean, 3+ Confirmed Cases = Higher Authority.',
      downgradeRule: 'Levels never downgrade even if cases are resolved or closed.',
      humanReviewRequirement: 'Potential links never increment counts until an authorized official confirms with notes.',
      urgentPathway: 'Urgent reports immediately populate Dean immediate queue without altering repeat counts.'
    }
  });
});

// Update Escalation Policy (Higher Authority only)
router.put('/policy', requireAuth, requireRole(['higher']), (req, res, next) => {
  try {
    const user = req.user;
    const data = policyUpdateSchema.parse(req.body);
    const now = new Date().toISOString();

    const existing = db.prepare('SELECT id FROM escalation_policy WHERE key = ?').get('relationship_escalation');
    if (existing) {
      db.prepare('UPDATE escalation_policy SET value = ?, updated_by = ?, updated_at = ? WHERE key = ?')
        .run(JSON.stringify(data), user.id, now, 'relationship_escalation');
    } else {
      db.prepare('INSERT INTO escalation_policy (key, value, updated_by, updated_at) VALUES (?, ?, ?, ?)')
        .run('relationship_escalation', JSON.stringify(data), user.id, now);
    }

    logAudit({
      actorUserId: user.id,
      actorRole: user.role,
      action: 'UPDATE_ESCALATION_POLICY',
      entityType: 'policy',
      entityId: 'relationship_escalation',
      ip: req.ip,
      details: data
    });

    res.json({ success: true, policy: data });
  } catch (err) {
    next(err);
  }
});

// Group Inspector: inspect a case group, member cases, and complete history
router.get('/groups/:id', requireAuth, requireRole(['hod', 'dean', 'higher']), (req, res) => {
  const groupId = req.params.id;

  const group = db.prepare('SELECT * FROM case_groups WHERE id = ?').get(groupId);
  if (!group) return res.status(404).json({ error: 'Case group not found' });

  const members = db.prepare(`
    SELECT c.id, c.case_ref, c.category, c.incident_at, c.submitted_at, c.status,
      c.assigned_level, c.urgent, c.link_state, l.name as location_name
    FROM cases c
    LEFT JOIN campus_locations l ON c.campus_location_id = l.id
    WHERE c.group_id = ?
    ORDER BY c.incident_at ASC
  `).all(groupId);

  const history = db.prepare(`
    SELECT h.*, u.full_name as approved_by_name, u.role as approved_by_role,
      c.case_ref as triggering_case_ref
    FROM escalation_history h
    LEFT JOIN users u ON h.approved_by = u.id
    LEFT JOIN cases c ON h.triggered_by_case_id = c.id
    WHERE h.group_id = ?
    ORDER BY h.created_at ASC
  `).all(groupId);

  res.json({
    group,
    memberCount: members.length,
    members,
    history
  });
});

// Escalation history events campus-wide
router.get('/history', requireAuth, requireRole(['hod', 'dean', 'higher']), (req, res) => {
  const events = db.prepare(`
    SELECT h.*, u.full_name as approved_by_name, u.role as approved_by_role,
      c.case_ref as triggering_case_ref, cg.level as current_group_level
    FROM escalation_history h
    LEFT JOIN users u ON h.approved_by = u.id
    LEFT JOIN cases c ON h.triggered_by_case_id = c.id
    LEFT JOIN case_groups cg ON h.group_id = cg.id
    ORDER BY h.created_at DESC
    LIMIT 50
  `).all();

  res.json({ events });
});

export default router;
