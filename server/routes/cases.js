import express from 'express';
import { db } from '../db/index.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { submissionLimiter } from '../middleware/security.js';
import {
  complaintSchema,
  statusUpdateSchema,
  infoRequestSchema,
  infoResponseSchema,
  investigationTaskSchema,
  internalNoteSchema
} from '../utils/validation.js';
import { generateUniqueCaseRef } from '../utils/caseId.js';
import { computeFingerprint, checkDuplicateCase } from '../utils/fingerprint.js';
import { evaluateNewCaseLinks, markCaseUrgent } from '../engine/escalation.js';
import { whatsAppService } from '../notifications/whatsapp.js';
import { logAudit } from '../utils/audit.js';

const router = express.Router();

// Allowed case status transitions
export const ALLOWED_STATUS_TRANSITIONS = {
  'Submitted': ['Awaiting Review', 'Under Investigation', 'Closed'],
  'Awaiting Review': ['Under Investigation', 'Additional Information Requested', 'Referred to Another Authority', 'Resolved', 'Closed'],
  'Under Investigation': ['Additional Information Requested', 'Referred to Another Authority', 'Resolved', 'Closed'],
  'Additional Information Requested': ['Under Investigation', 'Awaiting Review', 'Resolved', 'Closed'],
  'Referred to Another Authority': ['Under Investigation', 'Resolved', 'Closed'],
  'Resolved': ['Closed', 'Under Investigation'],
  'Closed': ['Under Investigation'] // Higher authority only
};

// Create a new complaint (Written or Audio-first)
router.post('/', requireAuth, submissionLimiter, async (req, res, next) => {
  try {
    const studentUser = req.user;
    if (studentUser.role !== 'student') {
      return res.status(403).json({ error: 'Only student accounts can file complaints.' });
    }

    const data = complaintSchema.parse(req.body);

    // Compute fingerprint
    const fingerprint = computeFingerprint({
      studentUserId: studentUser.id,
      category: data.category,
      campusLocationId: data.campus_location_id,
      incidentAt: data.incident_at,
      description: data.description
    });

    // Check duplicate
    const dupCheck = checkDuplicateCase({
      studentUserId: studentUser.id,
      submissionToken: data.submission_token,
      fingerprint
    });

    if (dupCheck.isDuplicate) {
      logAudit({
        actorUserId: studentUser.id,
        actorRole: studentUser.role,
        action: 'DUPLICATE_SUBMISSION_BLOCKED',
        entityType: 'case',
        entityId: dupCheck.existingCase.id,
        ip: req.ip,
        details: { type: dupCheck.type, caseRef: dupCheck.existingCase.case_ref }
      });
      return res.status(200).json({
        success: true,
        isDuplicate: true,
        message: 'This report was already received. Returning existing case record.',
        case: dupCheck.existingCase
      });
    }

    // Determine departmental routing
    const studentProfile = db.prepare('SELECT department_id FROM students WHERE user_id = ?').get(studentUser.id);
    const departmentId = studentProfile?.department_id || null;
    let assignedLevel = 'HOD';
    let assignedUserId = null;
    let fallbackToDean = false;

    if (departmentId) {
      const dept = db.prepare('SELECT hod_user_id FROM departments WHERE id = ?').get(departmentId);
      if (dept && dept.hod_user_id) {
        assignedUserId = dept.hod_user_id;
      } else {
        // Fallback to Dean
        fallbackToDean = true;
        assignedLevel = 'Dean';
        const dean = db.prepare("SELECT id FROM users WHERE role = 'dean' AND is_active = 1 LIMIT 1").get();
        if (dean) assignedUserId = dean.id;
      }
    }

    const now = new Date().toISOString();
    const caseRef = generateUniqueCaseRef(new Date());

    // Execute in transaction
    const newCase = db.transaction(() => {
      // 1. Create singleton group
      const groupRes = db.prepare(`
        INSERT INTO case_groups (level, created_at)
        VALUES (?, ?)
      `).run(assignedLevel, now);
      const groupId = groupRes.lastInsertRowid;

      // 2. Insert case record
      const caseRes = db.prepare(`
        INSERT INTO cases (
          case_ref, student_user_id, department_id, category, incident_at, submitted_at,
          campus_location_id, location_detail, description, suspect_details, witness_details,
          urgent, privacy_mode, preferred_language, status, assigned_level, assigned_user_id,
          group_id, link_state, fingerprint, submission_token, counts_toward_escalation,
          created_at, updated_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, ?, 'Submitted', ?, ?,
          ?, 'new', ?, ?, 1,
          ?, ?
        )
      `).run(
        caseRef, studentUser.id, departmentId, data.category, data.incident_at, now,
        data.campus_location_id, data.location_detail || null, data.description || null,
        data.suspect_details || null, data.witness_details || null,
        data.urgent ? 1 : 0, data.privacy_mode, data.preferred_language,
        assignedLevel, assignedUserId, groupId, fingerprint, data.submission_token,
        now, now
      );

      const caseId = caseRes.lastInsertRowid;

      // 3. Initial status history
      const historyNote = fallbackToDean
        ? 'Case submitted. Department HOD unavailable; routed to Dean as departmental fallback.'
        : 'Case submitted and securely registered in SENTINEL.';

      db.prepare(`
        INSERT INTO status_history (case_id, from_status, to_status, actor_id, note, student_visible, created_at)
        VALUES (?, NULL, 'Submitted', ?, ?, 1, ?)
      `).run(caseId, studentUser.id, historyNote, now);

      // 4. In-app student notification
      db.prepare(`
        INSERT INTO notifications (user_id, case_id, type, title, body, created_at)
        VALUES (?, ?, 'case_submitted', 'Complaint Registered Successfully', ?, ?)
      `).run(studentUser.id, caseId, `Your complaint #${caseRef} has been received. Your case reference is confidential.`, now);

      // 5. In-app authority notification
      if (assignedUserId) {
        db.prepare(`
          INSERT INTO notifications (user_id, case_id, type, title, body, created_at)
          VALUES (?, ?, 'case_assigned', 'New Complaint Awaiting Review', ?, ?)
        `).run(assignedUserId, caseId, `New ${data.category} report #${caseRef} assigned for initial review.`, now);
      }

      // 6. Initialize investigation record
      db.prepare(`
        INSERT INTO investigations (case_id, assigned_investigator_id, status, created_at)
        VALUES (?, ?, 'active', ?)
      `).run(caseId, assignedUserId, now);

      return db.prepare('SELECT * FROM cases WHERE id = ?').get(caseId);
    })();

    // Evaluate potential links against other groups
    evaluateNewCaseLinks(newCase.id);

    // Urgent handling
    if (data.urgent) {
      markCaseUrgent(newCase.id, studentUser.id, 'student');
    }

    // Prepare WhatsApp click-to-chat notification
    let waNotification = null;
    try {
      waNotification = whatsAppService.prepareNotification(newCase.id, studentUser.id, {
        level: 'minimal'
      });
    } catch (e) {
      console.warn('[WHATSAPP] Pre-build warning:', e.message);
    }

    logAudit({
      actorUserId: studentUser.id,
      actorRole: studentUser.role,
      action: 'SUBMIT_COMPLAINT',
      entityType: 'case',
      entityId: newCase.id,
      ip: req.ip,
      details: { caseRef, category: data.category, urgent: data.urgent }
    });

    res.status(201).json({
      success: true,
      case: newCase,
      whatsAppNotification: waNotification
    });
  } catch (err) {
    next(err);
  }
});

// List cases based on role and scope
router.get('/', requireAuth, (req, res) => {
  const user = req.user;

  if (user.role === 'student') {
    // Strictly ONLY student's own cases
    const studentCases = db.prepare(`
      SELECT c.id, c.case_ref, c.category, c.incident_at, c.submitted_at,
        c.status, c.assigned_level, c.urgent, c.link_state, c.privacy_mode,
        l.name as location_name,
        (SELECT COUNT(*) FROM audio_complaints ac WHERE ac.case_id = c.id) as has_audio,
        (SELECT COUNT(*) FROM evidence ev WHERE ev.case_id = c.id) as has_evidence,
        (SELECT COUNT(*) FROM info_requests ir WHERE ir.case_id = c.id AND ir.response IS NULL) as pending_info_requests
      FROM cases c
      LEFT JOIN campus_locations l ON c.campus_location_id = l.id
      WHERE c.student_user_id = ?
      ORDER BY c.created_at DESC
    `).all(user.id);

    return res.json({ cases: studentCases });
  }

  // Authority views
  let query = `
    SELECT c.*, l.name as location_name, d.name as department_name,
      u.full_name as student_name, s.sif_number, s.programme, s.year_of_study, s.section,
      cg.level as group_level,
      (SELECT COUNT(*) FROM audio_complaints ac WHERE ac.case_id = c.id) as has_audio,
      (SELECT COUNT(*) FROM evidence ev WHERE ev.case_id = c.id) as has_evidence,
      (SELECT COUNT(*) FROM link_candidates lc WHERE lc.case_id = c.id AND lc.state = 'pending') as pending_links
    FROM cases c
    LEFT JOIN campus_locations l ON c.campus_location_id = l.id
    LEFT JOIN departments d ON c.department_id = d.id
    LEFT JOIN users u ON c.student_user_id = u.id
    LEFT JOIN students s ON s.user_id = u.id
    LEFT JOIN case_groups cg ON c.group_id = cg.id
  `;

  const params = [];
  if (user.role === 'hod') {
    // Department scope and HOD assigned level
    query += ` WHERE c.department_id = ? AND c.assigned_level = 'HOD'`;
    params.push(user.departmentId);
  } else if (user.role === 'dean') {
    // Dean scope: HOD and Dean level cases, or urgent cases
    query += ` WHERE c.assigned_level IN ('HOD', 'Dean') OR c.urgent = 1`;
  }
  // Higher Authority sees all cases without filter

  query += ` ORDER BY c.urgent DESC, c.created_at DESC`;

  const cases = db.prepare(query).all(...params);

  // Mask identity if anonymous mode
  const sanitizedCases = cases.map(c => {
    if (c.privacy_mode === 'anonymous_to_reviewers_where_permitted' && user.role !== 'higher') {
      return {
        ...c,
        student_name: '[Protected Confidential Identity]',
        sif_number: '[Protected]',
        programme: '[Protected]',
        year_of_study: null,
        section: null
      };
    }
    return c;
  });

  res.json({ cases: sanitizedCases });
});

// Get single case details (Strict RBAC & Privacy enforcement)
router.get('/:id', requireAuth, (req, res) => {
  const user = req.user;
  const caseId = req.params.id;

  const caseRow = db.prepare(`
    SELECT c.*, l.name as location_name, l.zone as location_zone, d.name as department_name,
      u.full_name as student_name, s.sif_number, s.programme, s.year_of_study, s.section, s.phone as student_phone,
      cg.level as group_level
    FROM cases c
    LEFT JOIN campus_locations l ON c.campus_location_id = l.id
    LEFT JOIN departments d ON c.department_id = d.id
    LEFT JOIN users u ON c.student_user_id = u.id
    LEFT JOIN students s ON s.user_id = u.id
    LEFT JOIN case_groups cg ON c.group_id = cg.id
    WHERE c.id = ? OR c.case_ref = ?
  `).get(caseId, caseId);

  if (!caseRow) {
    return res.status(404).json({ error: 'Case not found' });
  }

  // Student ownership check
  if (user.role === 'student') {
    if (caseRow.student_user_id !== user.id) {
      logAudit({
        actorUserId: user.id,
        actorRole: user.role,
        action: 'IDOR_PREVENTED',
        entityType: 'case',
        entityId: caseRow.id,
        ip: req.ip
      });
      return res.status(403).json({ error: 'Access denied: You can only view your own complaints.' });
    }

    // Student view: Strictly sanitized, NO scores, NO internal notes, NO other cases
    const statusHistory = db.prepare(`
      SELECT id, from_status, to_status, note, created_at 
      FROM status_history 
      WHERE case_id = ? AND student_visible = 1 
      ORDER BY created_at ASC
    `).all(caseRow.id);

    const infoRequests = db.prepare(`
      SELECT id, message, response, requested_at, responded_at 
      FROM info_requests 
      WHERE case_id = ? 
      ORDER BY requested_at ASC
    `).all(caseRow.id);

    const hasAudio = db.prepare('SELECT id, duration_seconds, preferred_language, created_at FROM audio_complaints WHERE case_id = ?').get(caseRow.id);
    const evidenceList = db.prepare('SELECT id, original_filename, kind, mime, size_bytes, uploaded_at FROM evidence WHERE case_id = ?').all(caseRow.id);
    const cctvRequests = db.prepare('SELECT id, status, requested_at, outcome_note FROM cctv_requests WHERE case_id = ?').all(caseRow.id);
    const waNotification = db.prepare('SELECT id, state, prepared_at, opened_at FROM whatsapp_notifications WHERE case_id = ? ORDER BY id DESC LIMIT 1').get(caseRow.id);

    return res.json({
      case: {
        id: caseRow.id,
        case_ref: caseRow.case_ref,
        category: caseRow.category,
        incident_at: caseRow.incident_at,
        submitted_at: caseRow.submitted_at,
        location_name: caseRow.location_name,
        location_detail: caseRow.location_detail,
        description: caseRow.description,
        status: caseRow.status,
        assigned_level: caseRow.assigned_level,
        urgent: caseRow.urgent,
        privacy_mode: caseRow.privacy_mode,
        has_audio: Boolean(hasAudio),
        audio_info: hasAudio || null,
        evidence: evidenceList,
        cctv_requests: cctvRequests,
        status_history: statusHistory,
        info_requests: infoRequests,
        whatsapp_notification: waNotification
      }
    });
  }

  // Authority Scope validation
  if (user.role === 'hod' && caseRow.department_id !== user.departmentId) {
    return res.status(403).json({ error: 'Access restricted to departmental scope.' });
  }

  // Log phone viewing by authority
  if (caseRow.student_phone) {
    logAudit({
      actorUserId: user.id,
      actorRole: user.role,
      action: 'VIEW_STUDENT_CONTACT',
      entityType: 'case',
      entityId: caseRow.id,
      ip: req.ip
    });
  }

  // Full authority details
  const audio = db.prepare('SELECT id, duration_seconds, preferred_language, original_mime, size_bytes, recorded_or_uploaded, sha256, created_at FROM audio_complaints WHERE case_id = ?').get(caseRow.id);
  const evidence = db.prepare('SELECT * FROM evidence WHERE case_id = ?').all(caseRow.id);
  const internalNotes = db.prepare(`
    SELECT n.*, u.full_name as author_name, u.role as author_role
    FROM internal_notes n
    JOIN users u ON n.author_id = u.id
    WHERE n.case_id = ?
    ORDER BY n.created_at ASC
  `).all(caseRow.id);

  const statusHistory = db.prepare(`
    SELECT h.*, u.full_name as actor_name, u.role as actor_role
    FROM status_history h
    JOIN users u ON h.actor_id = u.id
    WHERE h.case_id = ?
    ORDER BY h.created_at ASC
  `).all(caseRow.id);

  const infoRequests = db.prepare(`
    SELECT r.*, u.full_name as requested_by_name
    FROM info_requests r
    JOIN users u ON r.requested_by = u.id
    WHERE r.case_id = ?
    ORDER BY r.requested_at ASC
  `).all(caseRow.id);

  const cctvRequests = db.prepare(`
    SELECT cr.*, u.full_name as requester_name
    FROM cctv_requests cr
    JOIN users u ON cr.requested_by = u.id
    WHERE cr.case_id = ?
    ORDER BY cr.requested_at DESC
  `).all(caseRow.id);

  const linkCandidates = db.prepare(`
    SELECT lc.*, cg.level as candidate_group_level
    FROM link_candidates lc
    JOIN case_groups cg ON lc.candidate_group_id = cg.id
    WHERE lc.case_id = ?
    ORDER BY lc.score DESC
  `).all(caseRow.id);

  // Group members if case is in a group
  const groupMembers = db.prepare(`
    SELECT id, case_ref, category, incident_at, status, urgent
    FROM cases
    WHERE group_id = ? AND id != ?
  `).all(caseRow.group_id, caseRow.id);

  const investigation = db.prepare(`
    SELECT i.*, u.full_name as investigator_name
    FROM investigations i
    LEFT JOIN users u ON i.assigned_investigator_id = u.id
    WHERE i.case_id = ?
  `).get(caseRow.id);

  let tasks = [];
  if (investigation) {
    tasks = db.prepare(`
      SELECT t.*, u.full_name as assigned_to_name
      FROM investigation_tasks t
      LEFT JOIN users u ON t.assigned_to = u.id
      WHERE t.investigation_id = ?
      ORDER BY t.status ASC, t.due_at ASC
    `).all(investigation.id);
  }

  const waNotification = db.prepare('SELECT * FROM whatsapp_notifications WHERE case_id = ? ORDER BY id DESC LIMIT 1').get(caseRow.id);

  // Privacy mask for confidential students
  let sanitizedCase = { ...caseRow };
  if (caseRow.privacy_mode === 'anonymous_to_reviewers_where_permitted' && user.role !== 'higher') {
    sanitizedCase.student_name = '[Protected Confidential Identity]';
    sanitizedCase.sif_number = '[Protected]';
    sanitizedCase.student_phone = '[Protected]';
    sanitizedCase.programme = '[Protected]';
    sanitizedCase.section = '[Protected]';
  }

  res.json({
    case: sanitizedCase,
    audio,
    evidence,
    internalNotes,
    statusHistory,
    infoRequests,
    cctvRequests,
    linkCandidates,
    groupMembers,
    investigation,
    tasks,
    whatsappNotification: waNotification
  });
});

// Update case status
router.patch('/:id/status', requireAuth, requireRole(['hod', 'dean', 'higher']), (req, res, next) => {
  try {
    const user = req.user;
    const caseId = req.params.id;
    const data = statusUpdateSchema.parse(req.body);

    const caseRow = db.prepare('SELECT * FROM cases WHERE id = ?').get(caseId);
    if (!caseRow) return res.status(404).json({ error: 'Case not found' });

    // Validate transition
    const allowed = ALLOWED_STATUS_TRANSITIONS[caseRow.status] || [];
    if (!allowed.includes(data.status)) {
      return res.status(400).json({
        error: `Invalid transition from "${caseRow.status}" to "${data.status}". Allowed: ${allowed.join(', ') || 'None'}`
      });
    }

    const now = new Date().toISOString();

    db.transaction(() => {
      db.prepare('UPDATE cases SET status = ?, updated_at = ? WHERE id = ?')
        .run(data.status, now, caseId);

      db.prepare(`
        INSERT INTO status_history (case_id, from_status, to_status, actor_id, note, student_visible, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(caseId, caseRow.status, data.status, user.id, data.note, data.student_visible ? 1 : 0, now);

      if (data.student_visible) {
        db.prepare(`
          INSERT INTO notifications (user_id, case_id, type, title, body, created_at)
          VALUES (?, ?, 'status_update', 'Status Updated', ?, ?)
        `).run(caseRow.student_user_id, caseId, `Case #${caseRow.case_ref} is now: ${data.status}. Note: ${data.note}`, now);
      }
    })();

    logAudit({
      actorUserId: user.id,
      actorRole: user.role,
      action: 'UPDATE_STATUS',
      entityType: 'case',
      entityId: caseId,
      ip: req.ip,
      details: { from: caseRow.status, to: data.status, note: data.note }
    });

    res.json({ success: true, status: data.status });
  } catch (err) {
    next(err);
  }
});

// Add internal confidential note (Authorities only)
router.post('/:id/notes', requireAuth, requireRole(['hod', 'dean', 'higher']), (req, res, next) => {
  try {
    const user = req.user;
    const caseId = req.params.id;
    const data = internalNoteSchema.parse(req.body);

    const now = new Date().toISOString();
    const result = db.prepare(`
      INSERT INTO internal_notes (case_id, author_id, body, created_at)
      VALUES (?, ?, ?, ?)
    `).run(caseId, user.id, data.body, now);

    logAudit({
      actorUserId: user.id,
      actorRole: user.role,
      action: 'ADD_INTERNAL_NOTE',
      entityType: 'internal_note',
      entityId: result.lastInsertRowid,
      ip: req.ip,
      details: { caseId }
    });

    res.status(201).json({ success: true, id: result.lastInsertRowid });
  } catch (err) {
    next(err);
  }
});

// Request additional info from student (Authorities only)
router.post('/:id/info-request', requireAuth, requireRole(['hod', 'dean', 'higher']), (req, res, next) => {
  try {
    const user = req.user;
    const caseId = req.params.id;
    const data = infoRequestSchema.parse(req.body);

    const caseRow = db.prepare('SELECT student_user_id, case_ref FROM cases WHERE id = ?').get(caseId);
    if (!caseRow) return res.status(404).json({ error: 'Case not found' });

    const now = new Date().toISOString();
    const result = db.prepare(`
      INSERT INTO info_requests (case_id, requested_by, message, requested_at)
      VALUES (?, ?, ?, ?)
    `).run(caseId, user.id, data.message, now);

    // Notify student
    db.prepare(`
      INSERT INTO notifications (user_id, case_id, type, title, body, created_at)
      VALUES (?, ?, 'info_requested', 'Additional Information Requested', ?, ?)
    `).run(
      caseRow.student_user_id,
      caseId,
      `The review committee requested additional information regarding case #${caseRow.case_ref}.`,
      now
    );

    res.status(201).json({ success: true, id: result.lastInsertRowid });
  } catch (err) {
    next(err);
  }
});

// Student response to info request (Owner student only)
router.post('/:id/info-response', requireAuth, (req, res, next) => {
  try {
    const user = req.user;
    const caseId = req.params.id;
    const requestId = req.body.request_id;
    const data = infoResponseSchema.parse(req.body);

    const caseRow = db.prepare('SELECT student_user_id FROM cases WHERE id = ?').get(caseId);
    if (!caseRow || caseRow.student_user_id !== user.id) {
      return res.status(403).json({ error: 'Only the submitting student can respond to this inquiry.' });
    }

    const now = new Date().toISOString();
    db.prepare(`
      UPDATE info_requests 
      SET response = ?, responded_at = ? 
      WHERE id = ? AND case_id = ?
    `).run(data.response, now, requestId, caseId);

    logAudit({
      actorUserId: user.id,
      actorRole: user.role,
      action: 'INFO_REQUEST_RESPONDED',
      entityType: 'info_request',
      entityId: requestId,
      ip: req.ip,
      details: { caseId }
    });

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// Flag case urgent
router.post('/:id/urgent', requireAuth, (req, res, next) => {
  try {
    const user = req.user;
    const caseId = req.params.id;
    const result = markCaseUrgent(caseId, user.id, user.role);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Add investigation task
router.post('/:id/tasks', requireAuth, requireRole(['hod', 'dean', 'higher']), (req, res, next) => {
  try {
    const user = req.user;
    const caseId = req.params.id;
    const data = investigationTaskSchema.parse(req.body);

    const investigation = db.prepare('SELECT id FROM investigations WHERE case_id = ?').get(caseId);
    if (!investigation) return res.status(404).json({ error: 'Investigation record not found' });

    const result = db.prepare(`
      INSERT INTO investigation_tasks (investigation_id, title, due_at, status, assigned_to, created_by)
      VALUES (?, ?, ?, 'pending', ?, ?)
    `).run(investigation.id, data.title, data.due_at || null, data.assigned_to || user.id, user.id);

    res.status(201).json({ success: true, taskId: result.lastInsertRowid });
  } catch (err) {
    next(err);
  }
});

// Update investigation task status
router.patch('/tasks/:taskId', requireAuth, requireRole(['hod', 'dean', 'higher']), (req, res) => {
  const { status } = req.body;
  if (!['pending', 'in_progress', 'completed'].includes(status)) {
    return res.status(400).json({ error: 'Invalid task status' });
  }

  db.prepare('UPDATE investigation_tasks SET status = ? WHERE id = ?').run(status, req.params.taskId);
  res.json({ success: true });
});

export default router;
