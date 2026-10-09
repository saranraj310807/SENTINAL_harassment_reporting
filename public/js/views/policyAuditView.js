import { api } from '../services/api.js';
import { auth } from '../services/auth.js';
import { showToast } from '../components/toast.js';
import { icon } from '../components/icons.js';

export function renderPolicyAuditView() {
  const user = auth.user;
  const isHigher = user.role === 'higher';

  return `
    <div class="page-container">
      <!-- Header -->
      <div class="card" style="margin-bottom: 24px;">
        <div class="card-header">
          <div>
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
              <span class="badge" style="background: #E0E7FF; color: #3730A3;">Governance & Oversight</span>
              <span style="font-size: 0.75rem; color: #64748B;">Institutional Escalation Policy</span>
            </div>
            <h2 class="card-title" style="font-size: 1.5rem;">Escalation Policy & Audit Ledger</h2>
            <p class="card-subtitle">
              Inspect algorithm thresholds, audit group structures, and review tamper-evident logs.
            </p>
          </div>

          ${isHigher ? `
            <div>
              <button type="button" id="btn-reset-demo-data" class="btn btn-danger btn-sm">
                ${icon('refresh', '', 14)} Reset Demo Data
              </button>
            </div>
          ` : ''}
        </div>
      </div>

      <!-- Tab Navigation -->
      <div style="display: flex; gap: 8px; margin-bottom: 20px; border-bottom: 1px solid #E2E8F0; padding-bottom: 12px;">
        <button type="button" class="btn btn-secondary tab-btn active" data-tab="policy">
          ${icon('settings', '', 16)} Escalation Policy
        </button>
        <button type="button" class="btn btn-secondary tab-btn" data-tab="inspector">
          ${icon('link', '', 16)} Case Group Inspector
        </button>
        <button type="button" class="btn btn-secondary tab-btn" data-tab="audit">
          ${icon('shield', '', 16)} Audit Log Ledger
        </button>
      </div>

      <!-- TAB 1: Policy Configuration -->
      <div id="tab-policy" class="tab-pane">
        <div class="card">
          <div class="card-header">
            <div>
              <h3 class="card-title">Transparent Heuristic Weights & Thresholds</h3>
              <p class="card-subtitle">
                ${isHigher ? 'Higher Authority policy configuration (Real-time updates)' : 'Read-only review of institutional parameters'}
              </p>
            </div>
          </div>

          <form id="policy-form">
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 20px; margin-bottom: 24px;">
              <div class="form-group">
                <label class="form-label" for="pol-threshold">Relationship Review Threshold (Points)</label>
                <input type="number" id="pol-threshold" class="form-control tabular-nums" min="20" max="90" required ${!isHigher ? 'disabled' : ''}>
                <div class="form-hint">Pairs scoring at or above this threshold trigger human review. Default: 50</div>
              </div>

              <div class="form-group">
                <label class="form-label" for="pol-same-cat">Same Category Points</label>
                <input type="number" id="pol-same-cat" class="form-control tabular-nums" min="0" max="50" required ${!isHigher ? 'disabled' : ''}>
                <div class="form-hint">Points for identical category (e.g. Ragging). Default: +30</div>
              </div>

              <div class="form-group">
                <label class="form-label" for="pol-same-loc">Same Location / Zone Points</label>
                <input type="number" id="pol-same-loc" class="form-control tabular-nums" min="0" max="50" required ${!isHigher ? 'disabled' : ''}>
                <div class="form-hint">Points for shared building or campus security zone. Default: +25</div>
              </div>

              <div class="form-group">
                <label class="form-label" for="pol-time-14">Recency: Within 14 Days Points</label>
                <input type="number" id="pol-time-14" class="form-control tabular-nums" min="0" max="30" required ${!isHigher ? 'disabled' : ''}>
                <div class="form-hint">Default: +15</div>
              </div>

              <div class="form-group">
                <label class="form-label" for="pol-time-30">Recency: Within 30 Days Points</label>
                <input type="number" id="pol-time-30" class="form-control tabular-nums" min="0" max="20" required ${!isHigher ? 'disabled' : ''}>
                <div class="form-hint">Default: +8</div>
              </div>

              <div class="form-group">
                <label class="form-label" for="pol-tod">Same Time-of-Day Band Points</label>
                <input type="number" id="pol-tod" class="form-control tabular-nums" min="0" max="25" required ${!isHigher ? 'disabled' : ''}>
                <div class="form-hint">Morning / Afternoon / Evening / Night windows. Default: +10</div>
              </div>

              <div class="form-group">
                <label class="form-label" for="pol-suspect">Suspect Descriptor Overlap (Jaccard >= 0.3)</label>
                <input type="number" id="pol-suspect" class="form-control tabular-nums" min="0" max="40" required ${!isHigher ? 'disabled' : ''}>
                <div class="form-hint">Keyword similarity after stop-word removal. Default: +20</div>
              </div>

              <div class="form-group">
                <label class="form-label" for="pol-dept-cap">Suspect Name/Dept Score Maximum Cap</label>
                <input type="number" id="pol-dept-cap" class="form-control tabular-nums" min="0" max="10" required ${!isHigher ? 'disabled' : ''}>
                <div class="form-hint">Strict safeguard: Name alone can NEVER reach threshold. Default: +5 Max</div>
              </div>
            </div>

            <div class="form-group" style="background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px; padding: 14px;">
              <div style="display: flex; align-items: flex-start; gap: 10px;">
                <input type="checkbox" id="pol-approval-required" ${!isHigher ? 'disabled' : ''} style="margin-top: 2px;">
                <div>
                  <label for="pol-approval-required" style="font-weight: 600; font-size: 0.875rem;">
                    Require Explicit Leadership Approval Before Escalation Level Promotion
                  </label>
                  <p style="font-size: 0.75rem; color: #64748B; margin-top: 2px;">
                    When unchecked (default), escalation level advances automatically upon confirmed repeat count (1=HOD, 2=Dean, 3+=Higher Authority) as specified in problem statement.
                  </p>
                </div>
              </div>
            </div>

            ${isHigher ? `
              <div style="display: flex; justify-content: flex-end;">
                <button type="submit" class="btn btn-primary" id="btn-save-policy">
                  ${icon('check', '', 16)} Save Policy Changes
                </button>
              </div>
            ` : ''}
          </form>
        </div>
      </div>

      <!-- TAB 2: Group Inspector -->
      <div id="tab-inspector" class="tab-pane" style="display: none;">
        <div class="card">
          <div class="card-header">
            <div>
              <h3 class="card-title">Case Group Inspector</h3>
              <p class="card-subtitle">Examine confirmed groupings, member cases, and historical escalation promotions</p>
            </div>
            <div style="display: flex; gap: 8px;">
              <input type="number" id="inspect-group-id" class="form-control" placeholder="Group ID" value="1" style="width: 120px; min-height: 34px;">
              <button type="button" id="btn-inspect-group" class="btn btn-primary btn-sm">Inspect</button>
            </div>
          </div>

          <div id="inspector-results-mount">
            <div style="padding: 24px; text-align: center; color: #64748B;">Enter a Group ID to inspect membership and escalation history.</div>
          </div>
        </div>
      </div>

      <!-- TAB 3: Audit Log -->
      <div id="tab-audit" class="tab-pane" style="display: none;">
        <div class="card">
          <div class="card-header">
            <div>
              <h3 class="card-title">Immutable Audit Log Ledger</h3>
              <p class="card-subtitle">Append-only institutional record of all access, plays, status changes, and logins</p>
            </div>
            <button type="button" id="btn-refresh-audit" class="btn btn-secondary btn-sm">
              ${icon('refresh', '', 14)} Refresh Ledger
            </button>
          </div>

          <div id="audit-log-mount">
            <div style="padding: 24px; text-align: center; color: #64748B;">Loading audit log records...</div>
          </div>
        </div>
      </div>
    </div>
  `;
}

export async function bindPolicyAuditEvents(container, router) {
  const user = auth.user;
  const isHigher = user.role === 'higher';

  // Tab switching
  const tabs = container.querySelectorAll('.tab-btn');
  tabs.forEach(btn => {
    btn.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      btn.classList.add('active');
      const target = btn.dataset.tab;
      container.querySelectorAll('.tab-pane').forEach(p => p.style.display = 'none');
      container.querySelector(`#tab-${target}`).style.display = 'block';

      if (target === 'audit') loadAuditLogs();
      if (target === 'inspector') inspectGroup(container.querySelector('#inspect-group-id').value);
    });
  });

  // Load Policy
  try {
    const res = await api.get('/api/escalation/policy');
    const pol = res.policy;
    container.querySelector('#pol-threshold').value = pol.threshold;
    container.querySelector('#pol-same-cat').value = pol.weights.same_category;
    container.querySelector('#pol-same-loc').value = pol.weights.same_location_or_zone;
    container.querySelector('#pol-time-14').value = pol.weights.within_14_days;
    container.querySelector('#pol-time-30').value = pol.weights.within_30_days;
    container.querySelector('#pol-tod').value = pol.weights.same_time_of_day;
    container.querySelector('#pol-suspect').value = pol.weights.suspect_descriptors;
    container.querySelector('#pol-dept-cap').value = pol.weights.same_suspect_name_or_dept_cap;
    container.querySelector('#pol-approval-required').checked = Boolean(pol.approval_required);
  } catch (err) {
    showToast(`Policy load note: ${err.message}`, 'warning');
  }

  // Save Policy Form
  const policyForm = container.querySelector('#policy-form');
  if (policyForm && isHigher) {
    policyForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = {
        threshold: parseInt(container.querySelector('#pol-threshold').value, 10),
        weights: {
          same_category: parseInt(container.querySelector('#pol-same-cat').value, 10),
          same_location_or_zone: parseInt(container.querySelector('#pol-same-loc').value, 10),
          within_14_days: parseInt(container.querySelector('#pol-time-14').value, 10),
          within_30_days: parseInt(container.querySelector('#pol-time-30').value, 10),
          same_time_of_day: parseInt(container.querySelector('#pol-tod').value, 10),
          suspect_descriptors: parseInt(container.querySelector('#pol-suspect').value, 10),
          same_suspect_name_or_dept_cap: parseInt(container.querySelector('#pol-dept-cap').value, 10)
        },
        approval_required: container.querySelector('#pol-approval-required').checked
      };

      try {
        await api.put('/api/escalation/policy', payload);
        showToast('Escalation policy updated successfully.', 'success');
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }

  // Inspector Function
  async function inspectGroup(groupId) {
    const mount = container.querySelector('#inspector-results-mount');
    if (!groupId) return;
    mount.innerHTML = '<div style="padding: 24px; color: #64748B;">Inspecting group...</div>';
    try {
      const data = await api.get(`/api/escalation/groups/${groupId}`);
      mount.innerHTML = `
        <div style="background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px; padding: 16px; margin-bottom: 20px;">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
            <span style="font-weight: 700; font-size: 1rem;">Group #${data.group.id}</span>
            <span class="badge badge-${data.group.level === 'HOD' ? 'hod' : (data.group.level === 'Dean' ? 'dean' : 'higher')}">
              Current Level: ${data.group.level}
            </span>
          </div>
          <div style="font-size: 0.8125rem; color: #475569;">
            Confirmed Distinct Qualifying Incidents: <strong class="tabular-nums">${data.memberCount}</strong>
          </div>
        </div>

        <h4 style="font-size: 0.875rem; font-weight: 700; margin-bottom: 10px;">Member Incidents:</h4>
        <div class="table-responsive" style="margin-bottom: 24px;">
          <table class="data-table">
            <thead>
              <tr><th>Case Ref</th><th>Category</th><th>Location</th><th>Incident Date</th><th>Status</th></tr>
            </thead>
            <tbody>
              ${data.members.map(m => `
                <tr>
                  <td><a href="#/cases/${m.case_ref}" style="font-weight: 700;">${m.case_ref}</a></td>
                  <td>${m.category}</td>
                  <td>${m.location_name || 'Campus'}</td>
                  <td class="tabular-nums">${new Date(m.incident_at).toLocaleDateString('en-GB')}</td>
                  <td><span class="badge badge-info">${m.status}</span></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>

        <h4 style="font-size: 0.875rem; font-weight: 700; margin-bottom: 10px;">Escalation Promotion History:</h4>
        ${data.history.length === 0 ? '<div style="font-size: 0.8125rem; color: #64748B;">No promotions yet (Group remains at initial HOD level).</div>' : `
          <div class="timeline">
            ${data.history.map(h => `
              <div class="timeline-item">
                <div class="timeline-dot"></div>
                <div class="timeline-header">
                  <span class="timeline-title">${h.from_level} → ${h.to_level}</span>
                  <span class="timeline-time tabular-nums">${new Date(h.created_at).toLocaleString('en-GB')}</span>
                </div>
                <div class="timeline-body">${h.reason} (Approved by: ${h.approved_by_name || 'System'})</div>
              </div>
            `).join('')}
          </div>
        `}
      `;
    } catch (err) {
      mount.innerHTML = `<div style="padding: 24px; color: #EF4444;">Group inspection error: ${err.message}</div>`;
    }
  }

  container.querySelector('#btn-inspect-group').addEventListener('click', () => {
    inspectGroup(container.querySelector('#inspect-group-id').value);
  });

  // Load Audit Logs
  async function loadAuditLogs() {
    const mount = container.querySelector('#audit-log-mount');
    mount.innerHTML = '<div style="padding: 24px; color: #64748B;">Fetching append-only audit trail...</div>';
    try {
      const data = await api.get('/api/audit-logs?limit=40');
      const logs = data.logs || [];
      mount.innerHTML = `
        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr><th>Timestamp</th><th>Actor</th><th>Action</th><th>Target</th><th>Details</th></tr>
            </thead>
            <tbody>
              ${logs.map(l => `
                <tr>
                  <td class="tabular-nums" style="font-size: 0.75rem; white-space: nowrap;">
                    ${new Date(l.ts).toLocaleString('en-GB')}
                  </td>
                  <td>
                    <span style="font-weight: 600; font-size: 0.8125rem;">${l.actorName}</span>
                    <span class="badge" style="background: #F1F5F9; font-size: 0.6875rem; margin-left: 4px;">${l.actorRole}</span>
                  </td>
                  <td><span class="badge badge-info" style="font-family: var(--font-mono); font-size: 0.6875rem;">${l.action}</span></td>
                  <td style="font-size: 0.8125rem;">${l.entityType} ${l.entityId ? `#${l.entityId}` : ''}</td>
                  <td style="font-size: 0.75rem; color: #475569; max-width: 280px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                    ${JSON.stringify(l.details)}
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    } catch (err) {
      mount.innerHTML = `<div style="padding: 24px; color: #EF4444;">Failed to load audit logs: ${err.message}</div>`;
    }
  }

  container.querySelector('#btn-refresh-audit').addEventListener('click', loadAuditLogs);

  // Demo Reset Button
  const btnReset = container.querySelector('#btn-reset-demo-data');
  if (btnReset) {
    btnReset.addEventListener('click', async () => {
      const conf = prompt('Type "RESET_SENTINEL_DEMO" to confirm resetting all prototype data:');
      if (conf !== 'RESET_SENTINEL_DEMO') return;
      btnReset.disabled = true;
      try {
        await api.post('/api/admin/reset-demo', { confirm: conf });
        showToast('Prototype data cleanly restored to initial baseline!', 'success');
        router.navigate('/dashboard');
      } catch (err) {
        showToast(err.message, 'error');
        btnReset.disabled = false;
      }
    });
  }
}
