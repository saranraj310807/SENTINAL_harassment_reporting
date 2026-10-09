import { api } from '../services/api.js';
import { auth } from '../services/auth.js';
import { showToast } from '../components/toast.js';
import { openModal } from '../components/modal.js';
import { icon } from '../components/icons.js';
import { openWhatsAppNotificationModal } from '../components/whatsappModal.js';

export function renderCaseDetailView(caseRef) {
  return `
    <div class="page-container" id="case-detail-container">
      <div style="padding: 32px; text-align: center; color: #64748B;">
        Loading case details for #${caseRef}...
      </div>
    </div>
  `;
}

export async function bindCaseDetailEvents(container, router, caseRef) {
  const mount = container.querySelector('#case-detail-container');
  const user = auth.user;

  try {
    const res = await api.get(`/api/cases/${caseRef}`);
    const caseData = res.case;
    const isStudent = user.role === 'student';

    if (isStudent) {
      renderStudentView(mount, caseData);
    } else {
      renderAuthorityView(mount, res, user);
    }
  } catch (err) {
    mount.innerHTML = `
      <div class="card" style="text-align: center; padding: 48px 24px;">
        <div style="color: #EF4444; margin-bottom: 16px;">${icon('alert', '', 48)}</div>
        <h2 style="font-size: 1.25rem; font-weight: 700; margin-bottom: 8px;">Access Denied or Case Not Found</h2>
        <p style="font-size: 0.875rem; color: #64748B; margin-bottom: 24px;">
          ${err.message || 'You do not have authorization to view this complaint reference.'}
        </p>
        <a href="#/dashboard" class="btn btn-secondary">
          Return to Dashboard
        </a>
      </div>
    `;
  }
}

// Student View Implementation (Strict Privacy Enforced)
function renderStudentView(mount, c) {
  mount.innerHTML = `
    <!-- Case Header -->
    <div class="card" style="margin-bottom: 20px;">
      <div style="display: flex; align-items: flex-start; justify-content: space-between; flex-wrap: wrap; gap: 16px; margin-bottom: 16px;">
        <div>
          <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 4px;">
            <h2 style="font-size: 1.5rem; font-weight: 800; color: #0F172A;" class="tabular-nums">
              Case #${c.case_ref}
            </h2>
            <span class="badge badge-${c.status === 'Resolved' ? 'success' : (c.status === 'Under Investigation' ? 'warning' : 'info')}">
              ${c.status}
            </span>
            ${c.urgent ? '<span class="badge badge-urgent">URGENT</span>' : ''}
          </div>
          <div style="font-size: 0.8125rem; color: #64748B;">
            ${c.category} • ${c.location_name || 'Designated Campus Area'} (${c.location_detail || 'Campus'})
          </div>
        </div>

        <div style="display: flex; gap: 8px;">
          <button type="button" id="btn-student-wa" class="btn btn-secondary btn-sm" style="color: #059669;">
            ${icon('whatsapp', '', 14)} WhatsApp Demo
          </button>
        </div>
      </div>

      <!-- Separate Timestamps & Level -->
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px; padding: 14px;">
        <div>
          <span style="font-size: 0.6875rem; color: #64748B; text-transform: uppercase;">Incident Date & Time:</span>
          <div style="font-size: 0.8125rem; font-weight: 600;" class="tabular-nums">
            ${new Date(c.incident_at).toLocaleString('en-GB')} (Asia/Kolkata)
          </div>
        </div>
        <div>
          <span style="font-size: 0.6875rem; color: #64748B; text-transform: uppercase;">Submitted Date & Time:</span>
          <div style="font-size: 0.8125rem; font-weight: 600;" class="tabular-nums">
            ${new Date(c.submitted_at).toLocaleString('en-GB')} (Asia/Kolkata)
          </div>
        </div>
        <div>
          <span style="font-size: 0.6875rem; color: #64748B; text-transform: uppercase;">Current Review Stage:</span>
          <div style="font-size: 0.8125rem; font-weight: 600;">
            <span class="badge badge-${c.assigned_level === 'HOD' ? 'hod' : (c.assigned_level === 'Dean' ? 'dean' : 'higher')}">
              ${c.assigned_level} Review Committee
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- Student Audio & Description -->
    <div class="card">
      <h3 class="card-title" style="margin-bottom: 12px;">Submitted Testimony</h3>
      ${c.has_audio ? `
        <div style="background: #0E1530; color: #FFFFFF; border-radius: 8px; padding: 16px; margin-bottom: 16px;">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px;">
            <span style="font-size: 0.8125rem; color: #38BDF8; font-weight: 600;">
              ${icon('mic', '', 14)} Your Recorded Audio Complaint (${c.audio_info?.preferred_language || 'Spoken'} Testimony)
            </span>
            <span style="font-size: 0.6875rem; color: #94A3B8;">Encrypted Storage</span>
          </div>
          <audio controls src="/api/cases/${c.id}/audio" style="width: 100%; height: 36px; outline: none;"></audio>
        </div>
      ` : ''}

      ${c.description ? `
        <div style="background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 8px; padding: 16px; font-size: 0.875rem; color: #334155; line-height: 1.6; white-space: pre-wrap;">${c.description}</div>
      ` : '<div style="color: #64748B; font-size: 0.8125rem;">(Audio testimony submitted without written text)</div>'}
    </div>

    <!-- Information Requests from Authorities -->
    ${c.info_requests && c.info_requests.length > 0 ? `
      <div class="card" style="border-color: #BFDBFE;">
        <div class="card-header" style="background: #EFF6FF; margin: -24px -24px 20px -24px; padding: 16px 24px; border-radius: 12px 12px 0 0;">
          <h3 class="card-title" style="color: #1E40AF; font-size: 0.9375rem;">Information Requested by Review Committee</h3>
        </div>

        ${c.info_requests.map(ir => `
          <div style="border: 1px solid #E2E8F0; border-radius: 8px; padding: 14px; margin-bottom: 12px;">
            <div style="font-size: 0.875rem; color: #1E293B; margin-bottom: 8px;">
              <strong>Reviewer Inquiry:</strong> "${ir.message}"
            </div>
            ${ir.response ? `
              <div style="background: #F8FAFC; border-left: 3px solid #10B981; padding: 8px 12px; font-size: 0.8125rem; color: #334155;">
                <strong>Your Response:</strong> "${ir.response}"
                <div style="font-size: 0.6875rem; color: #64748B; margin-top: 4px;">Responded on ${new Date(ir.responded_at).toLocaleString('en-GB')}</div>
              </div>
            ` : `
              <form class="respond-info-form" data-request-id="${ir.id}" style="margin-top: 10px;">
                <textarea class="form-control" placeholder="Provide requested clarification to the committee..." required style="min-height: 80px; margin-bottom: 8px;"></textarea>
                <button type="submit" class="btn btn-primary btn-sm">Submit Response</button>
              </form>
            `}
          </div>
        `).join('')}
      </div>
    ` : ''}

    <!-- Timeline of Progress -->
    <div class="card">
      <h3 class="card-title" style="margin-bottom: 20px;">Case Timeline</h3>
      <div class="timeline">
        ${(c.status_history || []).map(h => `
          <div class="timeline-item">
            <div class="timeline-dot"></div>
            <div class="timeline-header">
              <span class="timeline-title">${h.to_status}</span>
              <span class="timeline-time tabular-nums">${new Date(h.created_at).toLocaleString('en-GB')}</span>
            </div>
            <div class="timeline-body">${h.note || 'Status updated by administrative review'}</div>
          </div>
        `).join('')}
      </div>
    </div>
  `;

  // Bind student WhatsApp button
  const btnWa = mount.querySelector('#btn-student-wa');
  if (btnWa) {
    btnWa.addEventListener('click', () => {
      openWhatsAppNotificationModal(c.id, { level: 'extended' });
    });
  }

  // Bind info request response forms
  mount.querySelectorAll('.respond-info-form').forEach(form => {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const requestId = form.dataset.requestId;
      const text = form.querySelector('textarea').value.trim();
      try {
        await api.post(`/api/cases/${c.id}/info-response`, {
          request_id: requestId,
          response: text
        });
        showToast('Response submitted to review committee.', 'success');
        bindCaseDetailEvents(mount.parentElement, null, c.case_ref);
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  });
}

// Authority Workspace Implementation
function renderAuthorityView(mount, data, user) {
  const c = data.case;
  const audio = data.audio;
  const evidence = data.evidence || [];
  const internalNotes = data.internalNotes || [];
  const statusHistory = data.statusHistory || [];
  const linkCandidates = data.linkCandidates || [];
  const groupMembers = data.groupMembers || [];
  const cctvRequests = data.cctvRequests || [];
  const tasks = data.tasks || [];

  mount.innerHTML = `
    <!-- Authority Workspace Header -->
    <div class="card" style="margin-bottom: 20px;">
      <div style="display: flex; align-items: flex-start; justify-content: space-between; flex-wrap: wrap; gap: 16px; margin-bottom: 16px;">
        <div>
          <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 4px;">
            <h2 style="font-size: 1.5rem; font-weight: 800; color: #0F172A;" class="tabular-nums">
              Case #${c.case_ref}
            </h2>
            <span class="badge badge-${c.status === 'Resolved' ? 'success' : (c.status === 'Under Investigation' ? 'warning' : 'info')}">
              ${c.status}
            </span>
            <span class="badge badge-${c.assigned_level === 'HOD' ? 'hod' : (c.assigned_level === 'Dean' ? 'dean' : 'higher')}">
              Level: ${c.assigned_level}
            </span>
            ${c.urgent ? '<span class="badge badge-urgent">URGENT</span>' : ''}
            ${c.link_state === 'potential' ? '<span class="badge badge-potential">POTENTIALLY RELATED</span>' : ''}
            ${c.link_state === 'confirmed' ? '<span class="badge badge-confirmed">CONFIRMED RELATED</span>' : ''}
          </div>
          <div style="font-size: 0.8125rem; color: #64748B;">
            ${c.category} • ${c.location_name || 'Campus'} • Dept: ${c.department_name || 'General Campus'}
          </div>
        </div>

        <div style="display: flex; gap: 8px; flex-wrap: wrap;">
          <button type="button" id="btn-open-wa" class="btn btn-secondary btn-sm" style="color: #059669;">
            ${icon('whatsapp', '', 14)} WhatsApp Notification
          </button>
          <button type="button" id="btn-change-status" class="btn btn-primary btn-sm">
            Update Status
          </button>
        </div>
      </div>

      <!-- Student Identity Profile Box (Role & Privacy Aware) -->
      <div style="background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px; padding: 14px; margin-top: 12px;">
        <div style="font-size: 0.75rem; font-weight: 700; color: #1E293B; margin-bottom: 8px; text-transform: uppercase;">
          Reporter Information (${c.privacy_mode === 'confidential' ? 'Confidential' : 'Masked from Preliminary Reviewers'})
        </div>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 10px; font-size: 0.8125rem;">
          <div><span style="color: #64748B;">Student Name:</span> <strong>${c.student_name}</strong></div>
          <div><span style="color: #64748B;">SIF Number:</span> <strong class="tabular-nums">${c.sif_number || 'N/A'}</strong></div>
          <div><span style="color: #64748B;">Programme:</span> ${c.programme || 'N/A'}</div>
          <div><span style="color: #64748B;">Year/Section:</span> Year ${c.year_of_study || 'N/A'} - Sec ${c.section || 'N/A'}</div>
          <div><span style="color: #64748B;">Contact:</span> <strong class="tabular-nums">${c.student_phone || '[Protected]'}</strong></div>
        </div>
      </div>
    </div>

    <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 20px;">
      <!-- Left Column: Audio, Evidence, CCTV, Link Candidates -->
      <div>
        <!-- Audio Complaint Section -->
        <div class="card">
          <h3 class="card-title" style="margin-bottom: 12px; display: flex; align-items: center; justify-content: space-between;">
            <span>Voice Testimony</span>
            ${audio ? '<span class="badge badge-success">Audio Verified</span>' : '<span class="badge" style="background: #F1F5F9;">No Audio</span>'}
          </h3>

          ${audio ? `
            <div style="background: #0E1530; color: #FFFFFF; border-radius: 8px; padding: 16px; margin-bottom: 12px;">
              <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; font-size: 0.8125rem;">
                <span style="color: #38BDF8; font-weight: 600;">
                  ${icon('mic', '', 14)} Original Voice Complaint (${audio.preferred_language} Testimony)
                </span>
                <span class="tabular-nums" style="color: #94A3B8;">${(audio.size_bytes / (1024 * 1024)).toFixed(2)} MB • Range Stream</span>
              </div>
              <audio controls src="/api/cases/${c.id}/audio" style="width: 100%; height: 38px; outline: none; margin-bottom: 8px;"></audio>
              <div style="font-size: 0.6875rem; color: #64748B; display: flex; align-items: center; gap: 6px;">
                ${icon('lock', '', 12)}
                <span>Immutable SHA-256: <code class="tabular-nums">${audio.sha256.substring(0, 24)}…</code> (Playback is audit logged)</span>
              </div>
            </div>
          ` : `
            <div style="color: #64748B; font-size: 0.8125rem; padding: 8px 0;">No voice recording attached to this complaint.</div>
          `}

          <!-- Written Narrative -->
          <div style="margin-top: 16px;">
            <div style="font-size: 0.8125rem; font-weight: 600; color: #1E293B; margin-bottom: 6px;">Written Complaint Description:</div>
            <div style="background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 8px; padding: 14px; font-size: 0.875rem; color: #334155; line-height: 1.6; white-space: pre-wrap;">
              ${c.description || '<em style="color: #94A3B8;">No written description provided (Audio complaint only)</em>'}
            </div>
          </div>

          <!-- Suspect / Witness block -->
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 16px;">
            <div style="background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 6px; padding: 10px;">
              <span style="font-size: 0.75rem; color: #64748B; font-weight: 600;">Suspect Descriptors:</span>
              <div style="font-size: 0.8125rem; color: #1E293B; margin-top: 2px;">${c.suspect_details || 'None provided'}</div>
            </div>
            <div style="background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 6px; padding: 10px;">
              <span style="font-size: 0.75rem; color: #64748B; font-weight: 600;">Witness Details:</span>
              <div style="font-size: 0.8125rem; color: #1E293B; margin-top: 2px;">${c.witness_details || 'None provided'}</div>
            </div>
          </div>
        </div>

        <!-- Evidence Management -->
        <div class="card">
          <h3 class="card-title" style="margin-bottom: 12px;">Attached Evidence Files (${evidence.length})</h3>
          ${evidence.length === 0 ? '<div style="color: #64748B; font-size: 0.8125rem;">No files attached to this report.</div>' : `
            <div style="display: flex; flex-direction: column; gap: 8px;">
              ${evidence.map(ev => `
                <div style="display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; border: 1px solid #E2E8F0; border-radius: 8px; background: #FFFFFF;">
                  <div>
                    <a href="/api/evidence/${ev.id}" target="_blank" style="font-weight: 600; font-size: 0.875rem; color: #0F172A; text-decoration: none;">
                      ${ev.original_filename}
                    </a>
                    <div style="font-size: 0.75rem; color: #64748B;">
                      ${ev.kind.toUpperCase()} • ${(ev.size_bytes / (1024 * 1024)).toFixed(2)} MB • Status: <strong>${ev.review_status}</strong>
                    </div>
                  </div>
                  <div style="display: flex; gap: 6px;">
                    <button type="button" class="btn btn-secondary btn-sm review-ev-btn" data-ev-id="${ev.id}" data-status="reviewed">Accept</button>
                    <button type="button" class="btn btn-ghost btn-sm review-ev-btn" data-ev-id="${ev.id}" data-status="rejected" style="color: #EF4444;">Reject</button>
                  </div>
                </div>
              `).join('')}
            </div>
          `}
        </div>

        <!-- Link Candidates / Pattern Review -->
        ${linkCandidates.length > 0 ? `
          <div class="card" style="border-color: #FCD34D; background: #FFFDF5;">
            <div class="card-header" style="border-color: #FCD34D;">
              <div>
                <h3 class="card-title" style="color: #92400E;">Potential Linked Incident Review</h3>
                <p class="card-subtitle">Transparent Rule-Based Similarity (Threshold >= 50)</p>
              </div>
              <span class="badge badge-potential">Review Required</span>
            </div>

            ${linkCandidates.map(lc => {
              let matched = [];
              try { matched = JSON.parse(lc.matched_factors); } catch {}
              return `
                <div style="border: 1px solid #FCD34D; border-radius: 8px; padding: 14px; background: #FFFFFF; margin-bottom: 12px;">
                  <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
                    <div>
                      <span style="font-size: 0.875rem; font-weight: 700; color: #0F172A;">Candidate Case Group #${lc.candidate_group_id}</span>
                      <span class="badge badge-${lc.candidate_group_level === 'HOD' ? 'hod' : (lc.candidate_group_level === 'Dean' ? 'dean' : 'higher')}" style="margin-left: 6px;">
                        ${lc.candidate_group_level}
                      </span>
                    </div>
                    <div class="tabular-nums" style="font-size: 1.125rem; font-weight: 800; color: #0D9488;">
                      ${lc.score} / 100 pts
                    </div>
                  </div>

                  <div class="factor-list" style="margin: 10px 0;">
                    ${matched.map(f => `
                      <div class="factor-pill matched">
                        <span>✓ ${f.factor} (${f.detail})</span>
                        <span class="factor-points">+${f.points}</span>
                      </div>
                    `).join('')}
                  </div>

                  <div style="font-size: 0.6875rem; color: #92400E; margin-bottom: 12px;">
                    Ethical rule: A match is a prompt for human review, not evidence of wrongdoing. Confirming will merge the incidents and evaluate escalation.
                  </div>

                  ${lc.state === 'pending' ? `
                    <div style="display: flex; gap: 8px; justify-content: flex-end;">
                      <button type="button" class="btn btn-secondary btn-sm reject-link-btn" data-candidate-id="${lc.id}">
                        Reject as Unrelated
                      </button>
                      <button type="button" class="btn btn-primary btn-sm confirm-link-btn" data-candidate-id="${lc.id}">
                        Confirm Link & Merge
                      </button>
                    </div>
                  ` : `
                    <div style="font-size: 0.8125rem; font-weight: 600; color: #10B981;">
                      Candidate State: ${lc.state.toUpperCase()} (Reviewed)
                    </div>
                  `}
                </div>
              `;
            }).join('')}
          </div>
        ` : ''}

        <!-- CCTV Preservation Requests -->
        ${cctvRequests.length > 0 ? `
          <div class="card">
            <h3 class="card-title" style="margin-bottom: 12px;">CCTV Footage Preservation Requests</h3>
            ${cctvRequests.map(cr => `
              <div style="border: 1px solid #E2E8F0; border-radius: 8px; padding: 12px; margin-bottom: 10px; background: #F8FAFC;">
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">
                  <span style="font-weight: 600; font-size: 0.8125rem;">Request #${cr.id}</span>
                  <span class="badge badge-info">${cr.status}</span>
                </div>
                <div style="font-size: 0.75rem; color: #475569;">
                  Preservation Deadline: <strong class="tabular-nums">${new Date(cr.preservation_deadline).toLocaleString('en-GB')}</strong>
                </div>
                ${cr.outcome_note ? `<div style="font-size: 0.75rem; color: #047857; margin-top: 4px;"><strong>Outcome:</strong> ${cr.outcome_note}</div>` : ''}
              </div>
            `).join('')}
          </div>
        ` : ''}
      </div>

      <!-- Right Column: Internal Notes, Investigation Tasks, Status History -->
      <div>
        <!-- Investigation Tasks -->
        <div class="card">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
            <h3 class="card-title" style="font-size: 0.9375rem;">Investigation Tasks</h3>
            <button type="button" id="btn-add-task" class="btn btn-secondary btn-sm">+ Task</button>
          </div>

          <div style="display: flex; flex-direction: column; gap: 8px;">
            ${tasks.length === 0 ? '<div style="font-size: 0.75rem; color: #64748B;">No pending tasks assigned.</div>' : tasks.map(t => `
              <div style="display: flex; align-items: center; justify-content: space-between; padding: 8px 10px; border: 1px solid #E2E8F0; border-radius: 6px; font-size: 0.8125rem;">
                <span style="${t.status === 'completed' ? 'text-decoration: line-through; color: #94A3B8;' : 'font-weight: 500;'}">${t.title}</span>
                <span class="badge badge-${t.status === 'completed' ? 'success' : 'warning'}" style="font-size: 0.6875rem;">${t.status}</span>
              </div>
            `).join('')}
          </div>
        </div>

        <!-- Confidential Internal Notes (Authorities Only) -->
        <div class="card">
          <div class="card-header" style="padding-bottom: 8px; margin-bottom: 12px;">
            <div>
              <h3 class="card-title" style="font-size: 0.9375rem; color: #991B1B;">Internal Confidential Notes</h3>
              <p class="card-subtitle" style="font-size: 0.6875rem;">Never exposed to students or public</p>
            </div>
          </div>

          <div style="display: flex; flex-direction: column; gap: 8px; max-height: 240px; overflow-y: auto; margin-bottom: 12px;">
            ${internalNotes.length === 0 ? '<div style="font-size: 0.75rem; color: #64748B;">No internal notes logged.</div>' : internalNotes.map(n => `
              <div style="background: #FEF2F2; border: 1px solid #FECDD3; border-radius: 6px; padding: 8px 10px; font-size: 0.75rem;">
                <div style="display: flex; justify-content: space-between; font-weight: 600; color: #991B1B; margin-bottom: 2px;">
                  <span>${n.author_name} (${n.author_role.toUpperCase()})</span>
                  <span class="tabular-nums">${new Date(n.created_at).toLocaleTimeString('en-GB')}</span>
                </div>
                <div style="color: #4C0519;">${n.body}</div>
              </div>
            `).join('')}
          </div>

          <form id="add-internal-note-form">
            <textarea class="form-control" id="internal-note-body" placeholder="Log confidential investigative finding..." required style="min-height: 60px; font-size: 0.8125rem; margin-bottom: 6px;"></textarea>
            <button type="submit" class="btn btn-secondary btn-sm" style="width: 100%;">Add Confidential Note</button>
          </form>
        </div>

        <!-- Request Info from Student -->
        <div class="card">
          <h3 class="card-title" style="font-size: 0.9375rem; margin-bottom: 8px;">Request Clarification</h3>
          <form id="request-info-form">
            <textarea class="form-control" id="info-request-msg" placeholder="Ask student for specific clarification..." required style="min-height: 60px; font-size: 0.8125rem; margin-bottom: 6px;"></textarea>
            <button type="submit" class="btn btn-secondary btn-sm" style="width: 100%;">Send Request to Student</button>
          </form>
        </div>

        <!-- Audit Timeline -->
        <div class="card">
          <h3 class="card-title" style="font-size: 0.9375rem; margin-bottom: 12px;">Status History</h3>
          <div class="timeline">
            ${statusHistory.map(h => `
              <div class="timeline-item">
                <div class="timeline-dot"></div>
                <div class="timeline-header">
                  <span class="timeline-title">${h.to_status}</span>
                  <span class="timeline-time tabular-nums">${new Date(h.created_at).toLocaleDateString('en-GB')}</span>
                </div>
                <div class="timeline-body">${h.note || ''}</div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    </div>
  `;

  // Bind WhatsApp button
  mount.querySelector('#btn-open-wa').addEventListener('click', () => {
    openWhatsAppNotificationModal(c.id, { level: 'extended' });
  });

  // Bind Status Change Dialog
  mount.querySelector('#btn-change-status').addEventListener('click', () => {
    const statusModal = openModal({
      title: 'Update Case Status',
      content: `
        <div>
          <div class="form-group">
            <label class="form-label">New Status</label>
            <select id="modal-status-select" class="form-control">
              <option value="Awaiting Review">Awaiting Review</option>
              <option value="Under Investigation">Under Investigation</option>
              <option value="Additional Information Requested">Additional Information Requested</option>
              <option value="Referred to Another Authority">Referred to Another Authority</option>
              <option value="Resolved">Resolved</option>
              <option value="Closed">Closed</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Administrative Transition Note *</label>
            <textarea id="modal-status-note" class="form-control" placeholder="Provide reason for this status change..." required></textarea>
          </div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <input type="checkbox" id="modal-status-visible" checked>
            <label for="modal-status-visible" style="font-size: 0.8125rem;">Make note visible to submitting student</label>
          </div>
        </div>
      `,
      footer: `
        <button type="button" class="btn btn-secondary btn-sm" id="btn-cancel-status">Cancel</button>
        <button type="button" class="btn btn-primary btn-sm" id="btn-save-status">Update Status</button>
      `
    });

    const mBackdrop = statusModal.backdrop;
    mBackdrop.querySelector('#btn-cancel-status').addEventListener('click', () => statusModal.close());
    mBackdrop.querySelector('#btn-save-status').addEventListener('click', async () => {
      const newStatus = mBackdrop.querySelector('#modal-status-select').value;
      const note = mBackdrop.querySelector('#modal-status-note').value.trim();
      const visible = mBackdrop.querySelector('#modal-status-visible').checked;

      if (!note) {
        showToast('Please provide an administrative note.', 'warning');
        return;
      }

      try {
        await api.patch(`/api/cases/${c.id}/status`, {
          status: newStatus,
          note,
          student_visible: visible
        });
        showToast('Status updated successfully.', 'success');
        statusModal.close();
        bindCaseDetailEvents(mount.parentElement, null, c.case_ref);
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  });

  // Bind Internal Note Form
  const noteForm = mount.querySelector('#add-internal-note-form');
  noteForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = mount.querySelector('#internal-note-body').value.trim();
    try {
      await api.post(`/api/cases/${c.id}/notes`, { body });
      showToast('Confidential internal note logged.', 'success');
      mount.querySelector('#internal-note-body').value = '';
      bindCaseDetailEvents(mount.parentElement, null, c.case_ref);
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  // Bind Info Request Form
  const infoForm = mount.querySelector('#request-info-form');
  infoForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const message = mount.querySelector('#info-request-msg').value.trim();
    try {
      await api.post(`/api/cases/${c.id}/info-request`, { message });
      showToast('Inquiry sent to student.', 'success');
      mount.querySelector('#info-request-msg').value = '';
      bindCaseDetailEvents(mount.parentElement, null, c.case_ref);
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  // Bind Link Confirmation & Rejection
  mount.querySelectorAll('.confirm-link-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const candidateId = btn.dataset.candidateId;
      const note = prompt('Enter administrative reason for confirming this incident link:', 'Confirmed correlation in location and suspect description');
      if (note === null) return;
      try {
        const res = await api.post(`/api/escalation/candidates/${candidateId}/confirm`, { review_note: note });
        showToast(`Incidents merged! Escalation stage: ${res.finalLevel}`, 'success');
        bindCaseDetailEvents(mount.parentElement, null, c.case_ref);
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  });

  mount.querySelectorAll('.reject-link-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const candidateId = btn.dataset.candidateId;
      const note = prompt('Reason for marking incidents as unrelated:', 'Reviewed details determine independent incidents');
      if (note === null) return;
      try {
        await api.post(`/api/escalation/candidates/${candidateId}/reject`, { review_note: note });
        showToast('Candidate marked unrelated.', 'info');
        bindCaseDetailEvents(mount.parentElement, null, c.case_ref);
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  });

  // Bind Add Task Button
  mount.querySelector('#btn-add-task').addEventListener('click', () => {
    const taskModal = openModal({
      title: 'Assign Investigation Task',
      content: `
        <div>
          <div class="form-group">
            <label class="form-label">Task Title *</label>
            <input type="text" id="modal-task-title" class="form-control" placeholder="e.g. Interview floor warden / Inspect CCTV footage" required>
          </div>
          <div class="form-group">
            <label class="form-label">Due Date</label>
            <input type="date" id="modal-task-due" class="form-control">
          </div>
        </div>
      `,
      footer: `
        <button type="button" class="btn btn-secondary btn-sm" id="btn-cancel-task">Cancel</button>
        <button type="button" class="btn btn-primary btn-sm" id="btn-save-task">Save Task</button>
      `
    });

    const mBackdrop = taskModal.backdrop;
    mBackdrop.querySelector('#btn-cancel-task').addEventListener('click', () => taskModal.close());
    mBackdrop.querySelector('#btn-save-task').addEventListener('click', async () => {
      const title = mBackdrop.querySelector('#modal-task-title').value.trim();
      const due = mBackdrop.querySelector('#modal-task-due').value;
      if (!title) return showToast('Task title required', 'warning');
      try {
        await api.post(`/api/cases/${c.id}/tasks`, { title, due_at: due ? new Date(due).toISOString() : null });
        showToast('Task assigned.', 'success');
        taskModal.close();
        bindCaseDetailEvents(mount.parentElement, null, c.case_ref);
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  });

  // Bind Evidence Review Buttons
  mount.querySelectorAll('.review-ev-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const evId = btn.dataset.evId;
      const status = btn.dataset.status;
      try {
        await api.patch(`/api/evidence/${evId}/review`, { status, note: 'Reviewed by authority' });
        showToast(`Evidence marked as ${status}.`, 'info');
        bindCaseDetailEvents(mount.parentElement, null, c.case_ref);
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  });
}
