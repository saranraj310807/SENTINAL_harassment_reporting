import { api } from '../services/api.js';
import { auth } from '../services/auth.js';
import { icon } from '../components/icons.js';
import { openWhatsAppNotificationModal } from '../components/whatsappModal.js';

export function renderAuthorityDashboardView() {
  const user = auth.user;
  const roleTitle = user.role === 'hod' ? 'Department HOD' : (user.role === 'dean' ? 'Dean of Student Affairs' : 'Campus Safety Director / Higher Authority');

  return `
    <div class="page-container">
      <!-- Authority Header -->
      <div class="card" style="background: linear-gradient(135deg, #070B1A 0%, #0E1530 100%); color: #FFFFFF; border-color: #1E2958; margin-bottom: 24px;">
        <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 16px;">
          <div>
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
              <span class="badge badge-${user.role === 'hod' ? 'hod' : (user.role === 'dean' ? 'dean' : 'higher')}">
                ${roleTitle}
              </span>
              <span style="font-size: 0.75rem; color: #94A3B8;">Authority Console</span>
            </div>
            <h2 style="font-size: 1.5rem; font-weight: 700; color: #FFFFFF;">
              ${user.fullName}
            </h2>
            <div style="font-size: 0.8125rem; color: #94A3B8; margin-top: 4px;">
              ${user.departmentName ? `Department: ${user.departmentName} • ` : ''}Jurisdiction: ${user.role.toUpperCase()}
            </div>
          </div>

          <div style="display: flex; gap: 10px; flex-wrap: wrap;">
            <a href="#/review" class="btn btn-secondary btn-sm">
              ${icon('link', '', 14)} Related-Incident Review
            </a>
            <a href="#/analytics" class="btn btn-secondary btn-sm">
              ${icon('chart', '', 14)} Analytics
            </a>
            <a href="#/policy" class="btn btn-secondary btn-sm">
              ${icon('shield', '', 14)} Escalation Policy
            </a>
          </div>
        </div>
      </div>

      <!-- Urgent / Immediate Attention Queue (Mandatory at top) -->
      <div id="urgent-queue-container" style="margin-bottom: 24px;"></div>

      <!-- Stat Summary Cards -->
      <div class="stats-grid" id="authority-stats-grid">
        <div class="stat-card">
          <div>
            <div class="stat-value tabular-nums" id="stat-total">—</div>
            <div class="stat-label">Total Assigned</div>
          </div>
          <div class="stat-icon">${icon('shield', '', 20)}</div>
        </div>
        <div class="stat-card">
          <div>
            <div class="stat-value tabular-nums" id="stat-awaiting" style="color: #0284C7;">—</div>
            <div class="stat-label">Awaiting Review</div>
          </div>
          <div class="stat-icon" style="color: #0284C7;">${icon('bell', '', 20)}</div>
        </div>
        <div class="stat-card">
          <div>
            <div class="stat-value tabular-nums" id="stat-investigating" style="color: #D97706;">—</div>
            <div class="stat-label">Under Investigation</div>
          </div>
          <div class="stat-icon" style="color: #D97706;">${icon('file', '', 20)}</div>
        </div>
        <div class="stat-card">
          <div>
            <div class="stat-value tabular-nums" id="stat-urgent" style="color: #DC2626;">—</div>
            <div class="stat-label">Urgent Queue</div>
          </div>
          <div class="stat-icon" style="color: #DC2626;">${icon('triangleAlert', '', 20)}</div>
        </div>
      </div>

      <!-- Main Filterable Cases Table -->
      <div class="card">
        <div class="card-header">
          <div>
            <h3 class="card-title">Assigned Incident Roster</h3>
            <p class="card-subtitle">Active and escalated complaints under review</p>
          </div>
          <div style="display: flex; gap: 8px;">
            <select id="filter-status" class="form-control" style="width: auto; min-height: 34px; font-size: 0.8125rem; padding: 4px 10px;">
              <option value="all">All Statuses</option>
              <option value="Awaiting Review">Awaiting Review</option>
              <option value="Under Investigation">Under Investigation</option>
              <option value="Additional Information Requested">Info Requested</option>
              <option value="Resolved">Resolved</option>
              <option value="Closed">Closed</option>
            </select>
          </div>
        </div>

        <div id="cases-table-mount">
          <div style="padding: 24px; text-align: center; color: #64748B;">Loading assigned incidents...</div>
        </div>
      </div>
    </div>
  `;
}

export async function bindAuthorityDashboardEvents(container, router) {
  const urgentMount = container.querySelector('#urgent-queue-container');
  const tableMount = container.querySelector('#cases-table-mount');
  const filterSelect = container.querySelector('#filter-status');

  try {
    const res = await api.get('/api/cases');
    const allCases = res.cases || [];

    // Populate stat counters
    container.querySelector('#stat-total').textContent = allCases.length;
    container.querySelector('#stat-awaiting').textContent = allCases.filter(c => c.status === 'Awaiting Review' || c.status === 'Submitted').length;
    container.querySelector('#stat-investigating').textContent = allCases.filter(c => c.status === 'Under Investigation').length;
    container.querySelector('#stat-urgent').textContent = allCases.filter(c => c.urgent).length;

    // Render Urgent Queue
    const urgentCases = allCases.filter(c => c.urgent && c.status !== 'Closed' && c.status !== 'Resolved');
    if (urgentCases.length > 0) {
      urgentMount.innerHTML = `
        <div class="card" style="border: 2px solid #EF4444; background: #FFF5F5;">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
            <div style="display: flex; align-items: center; gap: 8px; color: #991B1B; font-weight: 700; font-size: 0.9375rem;">
              ${icon('triangleAlert', 'text-danger', 20)}
              <span>URGENT / IMMEDIATE ATTENTION QUEUE (${urgentCases.length})</span>
            </div>
            <span class="badge badge-urgent">Priority 0</span>
          </div>
          <div style="display: flex; flex-direction: column; gap: 8px;">
            ${urgentCases.map(uc => `
              <div style="display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; background: #FFFFFF; border: 1px solid #FECDD3; border-radius: 8px;">
                <div>
                  <a href="#/cases/${uc.case_ref}" style="font-weight: 700; color: #991B1B; text-decoration: none;" class="tabular-nums">
                    ${uc.case_ref}
                  </a>
                  <span style="font-weight: 600; margin-left: 8px;">${uc.category}</span>
                  <span style="color: #64748B; font-size: 0.8125rem; margin-left: 6px;">@ ${uc.location_name || 'Campus'}</span>
                </div>
                <div style="display: flex; align-items: center; gap: 8px;">
                  <span class="badge badge-warning">${uc.status}</span>
                  <a href="#/cases/${uc.case_ref}" class="btn btn-danger btn-sm">
                    Open Workspace
                  </a>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    } else {
      urgentMount.innerHTML = '';
    }

    // Function to render table with filter
    function renderTable() {
      const selectedStatus = filterSelect.value;
      const filtered = selectedStatus === 'all'
        ? allCases
        : allCases.filter(c => c.status === selectedStatus);

      if (filtered.length === 0) {
        tableMount.innerHTML = '<div class="empty-state" style="padding: 32px;">No cases match the selected status filter.</div>';
        return;
      }

      tableMount.innerHTML = `
        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th>Case Ref</th>
                <th>Reporter</th>
                <th>Category</th>
                <th>Campus Location</th>
                <th>Incident Date</th>
                <th>Status</th>
                <th>Escalation Stage</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${filtered.map(c => `
                <tr>
                  <td>
                    <a href="#/cases/${c.case_ref}" style="font-weight: 700; color: #0F172A; text-decoration: none;" class="tabular-nums">
                      ${c.case_ref}
                    </a>
                    ${c.urgent ? '<span class="badge badge-urgent" style="margin-left: 4px;">URGENT</span>' : ''}
                    ${c.link_state === 'potential' ? '<span class="badge badge-potential" style="margin-left: 4px;">POTENTIAL</span>' : ''}
                  </td>
                  <td>
                    <span style="font-weight: 500;">${c.student_name}</span>
                    <div style="font-size: 0.75rem; color: #64748B;">${c.sif_number || ''}</div>
                  </td>
                  <td>${c.category}</td>
                  <td>
                    <span style="font-size: 0.8125rem;">${c.location_name || 'Campus'}</span>
                  </td>
                  <td class="tabular-nums" style="font-size: 0.8125rem;">
                    ${new Date(c.incident_at).toLocaleDateString('en-GB')}
                  </td>
                  <td>
                    <span class="badge badge-${c.status === 'Resolved' ? 'success' : (c.status === 'Under Investigation' ? 'warning' : 'info')}">
                      ${c.status}
                    </span>
                  </td>
                  <td>
                    <span class="badge badge-${c.assigned_level === 'HOD' ? 'hod' : (c.assigned_level === 'Dean' ? 'dean' : 'higher')}">
                      ${c.assigned_level}
                    </span>
                  </td>
                  <td>
                    <div style="display: flex; align-items: center; gap: 6px;">
                      <a href="#/cases/${c.case_ref}" class="btn btn-secondary btn-sm">
                        Workspace
                      </a>
                      <button type="button" class="btn btn-ghost btn-sm trigger-wa-btn" data-case-id="${c.id}" title="Dispatch WhatsApp Notification">
                        ${icon('whatsapp', 'text-teal', 14)}
                      </button>
                    </div>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;

      // Bind WhatsApp buttons
      tableMount.querySelectorAll('.trigger-wa-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          openWhatsAppNotificationModal(btn.dataset.caseId, { level: 'extended' });
        });
      });
    }

    renderTable();
    filterSelect.addEventListener('change', renderTable);

  } catch (err) {
    tableMount.innerHTML = `<div style="padding: 24px; color: #EF4444;">Failed to load cases: ${err.message}</div>`;
  }
}
