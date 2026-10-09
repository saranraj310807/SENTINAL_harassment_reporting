import { db } from '../db/index.js';
import { logAudit } from '../utils/audit.js';

export const LEVEL_RANK = {
  'HOD': 1,
  'Dean': 2,
  'Higher Authority': 3
};

export const DEFAULT_POLICY = {
  threshold: 50,
  weights: {
    same_category: 30,
    same_location_or_zone: 25,
    within_14_days: 15,
    within_30_days: 8,
    same_time_of_day: 10,
    suspect_descriptors: 20,
    same_suspect_name_or_dept_cap: 5
  },
  approval_required: false // default false: automatic escalation upon confirmed counts
};

const STOP_WORDS = new Set([
  'the', 'is', 'at', 'which', 'on', 'a', 'an', 'and', 'or', 'in', 'to', 'for', 'of',
  'with', 'by', 'from', 'about', 'was', 'were', 'he', 'she', 'they', 'it', 'his',
  'her', 'their', 'wearing', 'shirt', 'pants', 'student', 'boy', 'girl', 'near',
  'around', 'seen', 'saw', 'that', 'this', 'there', 'who', 'tall', 'short'
]);

export function getTimeOfDayBand(dateStr) {
  if (!dateStr) return 'unknown';
  const d = new Date(dateStr);
  const hour = d.getHours();
  if (hour >= 6 && hour < 12) return 'Morning (06:00-12:00)';
  if (hour >= 12 && hour < 17) return 'Afternoon (12:00-17:00)';
  if (hour >= 17 && hour < 22) return 'Evening (17:00-22:00)';
  return 'Night (22:00-06:00)';
}

export function extractTokens(text) {
  if (!text) return new Set();
  const words = text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOP_WORDS.has(w));
  return new Set(words);
}

export function computeJaccardSimilarity(setA, setB) {
  if (!setA.size || !setB.size) return 0;
  let intersectionCount = 0;
  for (const item of setA) {
    if (setB.has(item)) intersectionCount++;
  }
  const unionCount = setA.size + setB.size - intersectionCount;
  return unionCount === 0 ? 0 : intersectionCount / unionCount;
}

/**
 * Pure function: calculates relationship score between two cases
 */
export function calculateRelationshipScore(caseA, caseB, policy = DEFAULT_POLICY) {
  let score = 0;
  const matchedFactors = [];
  const unmatchedFactors = [];
  const weights = policy.weights || DEFAULT_POLICY.weights;

  // 1. Same category (+30)
  if (caseA.category && caseB.category && caseA.category === caseB.category) {
    score += weights.same_category;
    matchedFactors.push({ factor: 'Same Incident Category', points: weights.same_category, detail: caseA.category });
  } else {
    unmatchedFactors.push({ factor: 'Incident Category', detail: `${caseA.category} vs ${caseB.category}` });
  }

  // 2. Same campus location or zone (+25)
  const sameLocation = caseA.campus_location_id && caseB.campus_location_id && (caseA.campus_location_id === caseB.campus_location_id);
  const sameZone = caseA.zone && caseB.zone && (caseA.zone === caseB.zone);
  if (sameLocation || sameZone) {
    score += weights.same_location_or_zone;
    matchedFactors.push({
      factor: sameLocation ? 'Identical Campus Location' : 'Same Security Zone',
      points: weights.same_location_or_zone,
      detail: sameLocation ? (caseA.location_name || `Location #${caseA.campus_location_id}`) : `Zone ${caseA.zone}`
    });
  } else {
    unmatchedFactors.push({ factor: 'Campus Location / Zone', detail: 'Different locations and zones' });
  }

  // 3. Incident timing recency (within 14 days +15, within 30 days +8)
  const timeA = new Date(caseA.incident_at).getTime();
  const timeB = new Date(caseB.incident_at).getTime();
  const daysDiff = Math.abs(timeA - timeB) / (1000 * 60 * 60 * 24);

  if (daysDiff <= 14) {
    score += weights.within_14_days;
    matchedFactors.push({ factor: 'Recent Incident Closeness (<= 14 days)', points: weights.within_14_days, detail: `${Math.round(daysDiff)} days apart` });
  } else if (daysDiff <= 30) {
    score += weights.within_30_days;
    matchedFactors.push({ factor: 'Moderate Incident Closeness (<= 30 days)', points: weights.within_30_days, detail: `${Math.round(daysDiff)} days apart` });
  } else {
    unmatchedFactors.push({ factor: 'Incident Recency', detail: `${Math.round(daysDiff)} days apart (> 30 days)` });
  }

  // 4. Same time-of-day band (+10)
  const bandA = getTimeOfDayBand(caseA.incident_at);
  const bandB = getTimeOfDayBand(caseB.incident_at);
  if (bandA === bandB && bandA !== 'unknown') {
    score += weights.same_time_of_day;
    matchedFactors.push({ factor: 'Same Time-of-Day Window', points: weights.same_time_of_day, detail: bandA });
  } else {
    unmatchedFactors.push({ factor: 'Time-of-Day Window', detail: `${bandA} vs ${bandB}` });
  }

  // 5. Suspect descriptor keyword overlap (+20)
  const tokensA = extractTokens(caseA.suspect_details || '');
  const tokensB = extractTokens(caseB.suspect_details || '');
  const jaccard = computeJaccardSimilarity(tokensA, tokensB);

  if (jaccard >= 0.3) {
    score += weights.suspect_descriptors;
    matchedFactors.push({ factor: 'Suspect Descriptor Overlap (Jaccard >= 0.3)', points: weights.suspect_descriptors, detail: `Similarity ${(jaccard * 100).toFixed(0)}%` });
  } else {
    unmatchedFactors.push({ factor: 'Suspect Descriptors', detail: `Low keyword overlap (${(jaccard * 100).toFixed(0)}%)` });
  }

  // 6. Same suspect name or department (Capped at at most +5 TOTAL)
  let nameDeptScore = 0;
  if (caseA.suspect_details && caseB.suspect_details) {
    const rawA = caseA.suspect_details.toLowerCase();
    const rawB = caseB.suspect_details.toLowerCase();
    // Check if both mention the same department or name
    if (caseA.department_id && caseB.department_id && caseA.department_id === caseB.department_id) {
      nameDeptScore += 3;
    }
  }
  const finalNameDept = Math.min(nameDeptScore, weights.same_suspect_name_or_dept_cap || 5);
  if (finalNameDept > 0) {
    score += finalNameDept;
    matchedFactors.push({ factor: 'Shared Department / Academic context (Capped)', points: finalNameDept, detail: 'Max +5 cap applied' });
  }

  const threshold = policy.threshold || DEFAULT_POLICY.threshold;
  return {
    score: Math.min(score, 100),
    threshold,
    isPotential: score >= threshold,
    matchedFactors,
    unmatchedFactors,
    disclaimer: 'A match is a prompt for human review, not evidence of wrongdoing.'
  };
}

/**
 * Determine escalation level based on count of confirmed qualifying cases
 */
export function calculateLevelFromCount(qualifyingCount) {
  if (qualifyingCount <= 1) return 'HOD';
  if (qualifyingCount === 2) return 'Dean';
  return 'Higher Authority';
}

/**
 * Compare levels to prevent downgrading
 */
export function ensureNoDowngrade(currentLevel, targetLevel) {
  const currentRank = LEVEL_RANK[currentLevel] || 1;
  const targetRank = LEVEL_RANK[targetLevel] || 1;
  return targetRank >= currentRank ? targetLevel : currentLevel;
}

/**
 * Load policy from database with fallback to defaults
 */
export function getEscalationPolicy() {
  const row = db.prepare('SELECT value FROM escalation_policy WHERE key = ?').get('relationship_escalation');
  if (row && row.value) {
    try {
      return { ...DEFAULT_POLICY, ...JSON.parse(row.value) };
    } catch {
      return DEFAULT_POLICY;
    }
  }
  return DEFAULT_POLICY;
}

/**
 * Evaluate new case for potential links against other groups
 */
export function evaluateNewCaseLinks(caseId) {
  const newCase = db.prepare(`
    SELECT c.*, l.name as location_name, l.zone
    FROM cases c
    LEFT JOIN campus_locations l ON c.campus_location_id = l.id
    WHERE c.id = ?
  `).get(caseId);

  if (!newCase) return [];

  const policy = getEscalationPolicy();

  // Find recent cases from OTHER groups (within 45 days)
  const candidateCases = db.prepare(`
    SELECT c.*, l.name as location_name, l.zone
    FROM cases c
    LEFT JOIN campus_locations l ON c.campus_location_id = l.id
    WHERE c.id != ? 
      AND (c.group_id != ? OR c.group_id IS NULL)
      AND c.counts_toward_escalation = 1
      AND c.status NOT IN ('Closed', 'Resolved')
      AND c.incident_at >= datetime('now', '-45 days')
    ORDER BY c.incident_at DESC
  `).all(caseId, newCase.group_id);

  const pendingCandidates = [];
  const processedGroups = new Set();

  for (const otherCase of candidateCases) {
    if (otherCase.group_id && processedGroups.has(otherCase.group_id)) {
      continue;
    }

    const evaluation = calculateRelationshipScore(newCase, otherCase, policy);

    if (evaluation.isPotential) {
      const candidateGroupId = otherCase.group_id;
      if (!candidateGroupId) continue;
      processedGroups.add(candidateGroupId);

      // Check if already exists in link_candidates
      const existing = db.prepare(`
        SELECT id FROM link_candidates 
        WHERE case_id = ? AND candidate_group_id = ?
      `).get(caseId, candidateGroupId);

      if (!existing) {
        const stmt = db.prepare(`
          INSERT INTO link_candidates (
            case_id, candidate_group_id, score, matched_factors, unmatched_factors, state
          ) VALUES (?, ?, ?, ?, ?, 'pending')
        `);
        const result = stmt.run(
          caseId,
          candidateGroupId,
          evaluation.score,
          JSON.stringify(evaluation.matchedFactors),
          JSON.stringify(evaluation.unmatchedFactors)
        );
        pendingCandidates.push({ id: result.lastInsertRowid, candidateGroupId, score: evaluation.score });
      }
    }
  }

  if (pendingCandidates.length > 0) {
    db.prepare('UPDATE cases SET link_state = ?, updated_at = ? WHERE id = ?')
      .run('potential', new Date().toISOString(), caseId);
  }

  return pendingCandidates;
}

/**
 * Confirm a link candidate: merges case into group, recalculates qualifying count,
 * escalates if threshold met (without downgrades), and records history idempotently.
 */
export function confirmLinkCandidate(candidateId, actorUserId, actorRole, reviewNote = '') {
  const candidate = db.prepare('SELECT * FROM link_candidates WHERE id = ?').get(candidateId);
  if (!candidate) throw new Error('Candidate not found');

  // Idempotency: if already confirmed, return current state
  if (candidate.state === 'confirmed') {
    return { success: true, alreadyConfirmed: true, groupId: candidate.candidate_group_id };
  }

  const thisCase = db.prepare('SELECT * FROM cases WHERE id = ?').get(candidate.case_id);
  const targetGroup = db.prepare('SELECT * FROM case_groups WHERE id = ?').get(candidate.candidate_group_id);
  if (!thisCase || !targetGroup) throw new Error('Case or Target Group not found');

  // Server-side RBAC validation
  const actorRank = LEVEL_RANK[actorRole === 'hod' ? 'HOD' : (actorRole === 'dean' ? 'Dean' : 'Higher Authority')] || 1;
  const groupRank = LEVEL_RANK[targetGroup.level] || 1;
  if (actorRole === 'hod' && groupRank > 1) {
    throw new Error('HOD cannot manage cases escalated above departmental level');
  }

  const now = new Date().toISOString();

  // Run merge and escalation in a transaction
  const executeMerge = db.transaction(() => {
    // 1. Update candidate state
    db.prepare(`
      UPDATE link_candidates 
      SET state = 'confirmed', reviewed_by = ?, reviewed_at = ?, review_note = ?
      WHERE id = ?
    `).run(actorUserId, now, reviewNote || 'Confirmed after administrative review', candidateId);

    // 2. Merge case into group and update link_state
    const oldGroupId = thisCase.group_id;
    db.prepare(`
      UPDATE cases 
      SET group_id = ?, link_state = 'confirmed', updated_at = ?
      WHERE id = ?
    `).run(targetGroup.id, now, thisCase.id);

    // 3. Count distinct qualifying member cases in target group
    const qualifyingMembers = db.prepare(`
      SELECT id, case_ref, urgent FROM cases 
      WHERE group_id = ? 
        AND counts_toward_escalation = 1 
        AND status NOT IN ('Closed', 'Resolved')
    `).all(targetGroup.id);

    const count = qualifyingMembers.length;
    const computedLevel = calculateLevelFromCount(count);
    const finalLevel = ensureNoDowngrade(targetGroup.level, computedLevel);

    let escalated = false;
    if (finalLevel !== targetGroup.level) {
      escalated = true;
      const oldLevel = targetGroup.level;

      // Update group level
      db.prepare('UPDATE case_groups SET level = ? WHERE id = ?').run(finalLevel, targetGroup.id);

      // Update all member cases assigned_level
      db.prepare('UPDATE cases SET assigned_level = ?, updated_at = ? WHERE group_id = ?')
        .run(finalLevel, now, targetGroup.id);

      // Record escalation history
      const reason = `Pattern detected: ${count} confirmed related incidents linked across campus locations. Escalated to ${finalLevel}.`;
      db.prepare(`
        INSERT INTO escalation_history (
          group_id, from_level, to_level, reason, triggered_by_case_id, approved_by, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(targetGroup.id, oldLevel, finalLevel, reason, thisCase.id, actorUserId, now);

      // Add student-visible status history to member cases (with generic privacy-preserving wording)
      for (const member of qualifyingMembers) {
        db.prepare(`
          INSERT INTO status_history (
            case_id, from_status, to_status, actor_id, note, student_visible, created_at
          ) VALUES (?, ?, ?, ?, ?, 1, ?)
        `).run(
          member.id,
          'Awaiting Review',
          'Under Investigation',
          actorUserId,
          `Administrative review: case referred to ${finalLevel} review committee`,
          now
        );

        // Notify member students
        db.prepare(`
          INSERT INTO notifications (user_id, case_id, type, title, body, created_at)
          VALUES ((SELECT student_user_id FROM cases WHERE id = ?), ?, 'status_update', 'Case Review Update', ?, ?)
        `).run(
          member.id,
          member.id,
          `Your report #${member.case_ref} has progressed to the ${finalLevel} review stage.`,
          now
        );
      }
    }

    logAudit({
      actorUserId,
      actorRole,
      action: 'CONFIRM_LINK',
      entityType: 'link_candidate',
      entityId: candidateId,
      details: { caseId: thisCase.id, targetGroupId: targetGroup.id, count, finalLevel, escalated }
    });

    return { escalated, finalLevel, count, groupId: targetGroup.id };
  });

  return executeMerge();
}

/**
 * Reject link candidate
 */
export function rejectLinkCandidate(candidateId, actorUserId, actorRole, reviewNote = '') {
  const candidate = db.prepare('SELECT * FROM link_candidates WHERE id = ?').get(candidateId);
  if (!candidate) throw new Error('Candidate not found');

  const now = new Date().toISOString();
  db.prepare(`
    UPDATE link_candidates 
    SET state = 'rejected', reviewed_by = ?, reviewed_at = ?, review_note = ?
    WHERE id = ?
  `).run(actorUserId, now, reviewNote || 'Administrative review determined incidents are unrelated', candidateId);

  // Check if case has any other pending candidates
  const remainingPending = db.prepare(`
    SELECT COUNT(*) as count FROM link_candidates 
    WHERE case_id = ? AND state = 'pending'
  `).get(candidate.case_id);

  if (remainingPending.count === 0) {
    db.prepare('UPDATE cases SET link_state = ?, updated_at = ? WHERE id = ?')
      .run('rejected', now, candidate.case_id);
  }

  logAudit({
    actorUserId,
    actorRole,
    action: 'REJECT_LINK',
    entityType: 'link_candidate',
    entityId: candidateId,
    details: { caseId: candidate.case_id, reviewNote }
  });

  return { success: true };
}

/**
 * Urgent pathway: route immediately to Dean urgent queue without changing repeat counts
 */
export function markCaseUrgent(caseId, actorUserId, actorRole) {
  const caseRow = db.prepare('SELECT * FROM cases WHERE id = ?').get(caseId);
  if (!caseRow) throw new Error('Case not found');

  const now = new Date().toISOString();
  db.prepare(`
    UPDATE cases 
    SET urgent = 1, updated_at = ?
    WHERE id = ?
  `).run(now, caseId);

  // Add notification to Dean & HOD
  const deans = db.prepare("SELECT id FROM users WHERE role = 'dean' AND is_active = 1").all();
  for (const dean of deans) {
    db.prepare(`
      INSERT INTO notifications (user_id, case_id, type, title, body, created_at)
      VALUES (?, ?, 'urgent_alert', 'Immediate Attention: Urgent Complaint', ?, ?)
    `).run(
      dean.id,
      caseId,
      `Case #${caseRow.case_ref} marked urgent for immediate safety review.`,
      now
    );
  }

  logAudit({
    actorUserId,
    actorRole,
    action: 'FLAG_URGENT',
    entityType: 'case',
    entityId: caseId,
    details: { caseRef: caseRow.case_ref }
  });

  return { success: true, caseRef: caseRow.case_ref };
}
