import { api } from '../services/api.js';
import { auth } from '../services/auth.js';
import { showToast } from '../components/toast.js';
import { icon } from '../components/icons.js';

export function renderLinkReviewView() {
  return `
    <div class="page-container">
      <div class="card" style="margin-bottom: 24px;">
        <div class="card-header">
          <div>
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
              <span class="badge badge-potential">Human-in-the-Loop Review</span>
              <span style="font-size: 0.75rem; color: #64748B;">Transparent Rule-Based Engine</span>
            </div>
            <h2 class="card-title" style="font-size: 1.5rem;">Related-Incident Pattern Review Queue</h2>
            <p class="card-subtitle">
              Review flagged potential relationships across campus reports. No pattern automatically alters escalation until confirmed by an authorized official.
            </p>
          </div>
        </div>

        <div style="background: #EFF6FF; border: 1px solid #BFDBFE; border-radius: 8px; padding: 14px; font-size: 0.8125rem; color: #1E40AF; display: flex; align-items: flex-start; gap: 10px;">
          ${icon('shield', '', 18)}
          <div>
            <strong>Institutional Integrity Guarantee:</strong><br>
            SENTINEL uses transparent weighted heuristics (threshold >= 50). Similarity scores serve solely as prompts for administrative human review and do NOT constitute proof of wrongdoing.
          </div>
        </div>
      </div>

      <div id="candidates-queue-mount">
        <div style="padding: 32px; text-align: center; color: #64748B;">Loading pending pattern candidates...</div>
      </div>
    </div>
  `;
}

export async function bindLinkReviewEvents(container, router) {
  const mount = container.querySelector('#candidates-queue-mount');

  try {
    const res = await api.get('/api/escalation/candidates');
    const candidates = res.candidates || [];

    if (candidates.length === 0) {
      mount.innerHTML = `
        <div class="card" style="text-align: center; padding: 48px 24px;">
          <div style="color: #059669; margin-bottom: 12px;">${icon('check', '', 40)}</div>
          <h3 style="font-size: 1.125rem; font-weight: 700; margin-bottom: 6px;">No Pending Relationships Awaiting Review</h3>
          <p style="font-size: 0.875rem; color: #64748B;">All incoming safety complaints have been processed.</p>
        </div>
      `;
      return;
    }

    mount.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 20px;">
        ${candidates.map(c => `
          <div class="card" style="border: 1px solid #E2E8F0; margin-bottom: 0;">
            <div style="display: flex; align-items: flex-start; justify-content: space-between; flex-wrap: wrap; gap: 12px; margin-bottom: 16px; border-bottom: 1px solid #E2E8F0; padding-bottom: 12px;">
              <div>
                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                  <span style="font-size: 1.125rem; font-weight: 800; color: #0F172A;" class="tabular-nums">
                    Incoming Case #${c.caseRef}
                  </span>
                  <span class="badge" style="background: #E2E8F0; color: #334155;">${c.category}</span>
                  ${c.urgent ? '<span class="badge badge-urgent">URGENT</span>' : ''}
                </div>
                <div style="font-size: 0.8125rem; color: #64748B;">
                  Location: ${c.locationName || 'Campus'} • Occurred: <span class="tabular-nums">${new Date(c.incidentAt).toLocaleDateString('en-GB')}</span>
                </div>
              </div>

              <div style="text-align: right;">
                <div style="font-size: 0.75rem; color: #64748B; text-transform: uppercase;">Similarity Confidence</div>
                <div class="tabular-nums" style="font-size: 1.75rem; font-weight: 800; color: #0D9488; line-height: 1;">
                  ${c.score} <span style="font-size: 0.875rem; font-weight: 600; color: #64748B;">/ 100</span>
                </div>
              </div>
            </div>

            <!-- Matched Factors Breakdown -->
            <div style="margin-bottom: 16px;">
              <div style="font-size: 0.8125rem; font-weight: 700; color: #1E293B; margin-bottom: 8px;">
                Identified Correlation Factors:
              </div>
              <div class="factor-list">
                ${c.matchedFactors.map(f => `
                  <div class="factor-pill matched">
                    <span><strong>${f.factor}:</strong> ${f.detail}</span>
                    <span class="factor-points">+${f.points} pts</span>
                  </div>
                `).join('')}
              </div>
            </div>

            <!-- Target Case Group Context -->
            <div style="background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px; padding: 14px; margin-bottom: 20px;">
              <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
                <span style="font-weight: 700; font-size: 0.8125rem; color: #0F172A;">
                  Candidate Group #${c.targetGroupId} (Currently ${c.currentGroupCount} Confirmed Incidents)
                </span>
                <span class="badge badge-${c.targetGroupLevel === 'HOD' ? 'hod' : (c.targetGroupLevel === 'Dean' ? 'dean' : 'higher')}">
                  Current Level: ${c.targetGroupLevel}
                </span>
              </div>
              <div style="font-size: 0.75rem; color: #64748B;">
                Confirming will merge this incident into Group #${c.targetGroupId}. If confirmed distinct incidents reach 2, group escalates to Dean; at 3+, group escalates to Higher Authority.
              </div>
            </div>

            <!-- Action Controls -->
            <div style="display: flex; align-items: center; justify-content: flex-end; gap: 12px;">
              <button type="button" class="btn btn-secondary reject-queue-btn" data-candidate-id="${c.id}">
                ${icon('x', '', 14)} Mark as Unrelated
              </button>
              <button type="button" class="btn btn-primary confirm-queue-btn" data-candidate-id="${c.id}">
                ${icon('check', '', 14)} Confirm Relationship & Merge Group
              </button>
            </div>
          </div>
        `).join('')}
      </div>
    `;

    // Bind Confirm & Reject buttons
    mount.querySelectorAll('.confirm-queue-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const candidateId = btn.dataset.candidateId;
        const note = prompt('Please provide administrative justification for confirming this link:', 'Verified overlapping suspect description and campus zone proximity.');
        if (note === null) return;
        btn.disabled = true;
        try {
          const res = await api.post(`/api/escalation/candidates/${candidateId}/confirm`, { review_note: note });
          showToast(`Incidents merged! Resulting level: ${res.finalLevel}`, 'success');
          bindLinkReviewEvents(container, router);
        } catch (err) {
          showToast(err.message, 'error');
          btn.disabled = false;
        }
      });
    });

    mount.querySelectorAll('.reject-queue-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const candidateId = btn.dataset.candidateId;
        const note = prompt('Reason for marking incidents as unrelated:', 'Independent, isolated incident upon committee review.');
        if (note === null) return;
        btn.disabled = true;
        try {
          await api.post(`/api/escalation/candidates/${candidateId}/reject`, { review_note: note });
          showToast('Candidate marked unrelated.', 'info');
          bindLinkReviewEvents(container, router);
        } catch (err) {
          showToast(err.message, 'error');
          btn.disabled = false;
        }
      });
    });

  } catch (err) {
    mount.innerHTML = `<div style="padding: 24px; color: #EF4444;">Failed to load candidates: ${err.message}</div>`;
  }
}
