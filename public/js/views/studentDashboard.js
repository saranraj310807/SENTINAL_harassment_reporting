import { api } from '../services/api.js';
import { auth } from '../services/auth.js';
import { icon } from '../components/icons.js';
import { openWhatsAppNotificationModal } from '../components/whatsappModal.js';

export function renderStudentDashboardView() {
  const user = auth.user;
  const profile = user?.studentProfile || {};

  return `
    <div class="page-container">
      <!-- Student Profile Greeting -->
      <div class="card" style="background: linear-gradient(135deg, #0E1530 0%, #141C3D 100%); color: #FFFFFF; border-color: #1E2958;">
        <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 16px;">
          <div>
            <div style="font-size: 0.75rem; color: #38BDF8; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px;">
              Confidential Student Portal
            </div>
            <h2 style="font-size: 1.5rem; font-weight: 700; color: #FFFFFF;">
              Welcome, ${user.fullName}
            </h2>
            <div style="font-size: 0.8125rem; color: #94A3B8; margin-top: 4px; display: flex; align-items: center; gap: 12px; flex-wrap: wrap;">
              <span><strong>SIF:</strong> <span class="tabular-nums">${profile.sif_number || 'SIF202601'}</span></span>
              <span>•</span>
              <span><strong>Programme:</strong> ${profile.programme || 'B.Tech CSE'}</span>
              <span>•</span>
              <span><strong>Year/Sec:</strong> Year ${profile.year_of_study || 3} - ${profile.section || 'A'}</span>
            </div>
          </div>
          <div>
            <a href="#/complaint/new" class="btn btn-primary" style="padding: 12px 20px;">
              ${icon('file', '', 18)} File New Complaint
            </a>
          </div>
        </div>
      </div>

      <!-- Quick Action Cards -->
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 16px; margin-bottom: 24px;">
        <a href="#/complaint/new" class="card" style="text-decoration: none; display: flex; align-items: center; gap: 16px; margin-bottom: 0; transition: transform 150ms ease;">
          <div style="width: 48px; height: 48px; border-radius: 12px; background: rgba(20, 184, 166, 0.1); color: #0D9488; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
            ${icon('file', '', 24)}
          </div>
          <div>
            <div style="font-weight: 700; color: #0F172A; font-size: 0.9375rem;">Written Complaint</div>
            <div style="font-size: 0.75rem; color: #64748B; margin-top: 2px;">Multi-step wizard with evidence attachments</div>
          </div>
        </a>

        <a href="#/complaint/new?mode=audio" class="card" style="text-decoration: none; display: flex; align-items: center; gap: 16px; margin-bottom: 0;">
          <div style="width: 48px; height: 48px; border-radius: 12px; background: rgba(139, 124, 255, 0.1); color: #6366F1; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
            ${icon('mic', '', 24)}
          </div>
          <div>
            <div style="font-weight: 700; color: #0F172A; font-size: 0.9375rem;">Direct Audio Complaint</div>
            <div style="font-size: 0.75rem; color: #64748B; margin-top: 2px;">Voice testimony (No typing or transcription needed)</div>
          </div>
        </a>

        <a href="#/cctv" class="card" style="text-decoration: none; display: flex; align-items: center; gap: 16px; margin-bottom: 0;">
          <div style="width: 48px; height: 48px; border-radius: 12px; background: rgba(6, 182, 212, 0.1); color: #0891B2; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
            ${icon('camera', '', 24)}
          </div>
          <div>
            <div style="font-weight: 700; color: #0F172A; font-size: 0.9375rem;">CCTV Camera Locator</div>
            <div style="font-size: 0.75rem; color: #64748B; margin-top: 2px;">Check campus coverage & request preservation</div>
          </div>
        </a>
      </div>

      <!-- Cases Section -->
      <div class="card">
        <div class="card-header">
          <div>
            <h3 class="card-title">My Reported Cases</h3>
            <p class="card-subtitle">Confidential tracking timeline for your submitted safety complaints</p>
          </div>
        </div>

        <div id="student-cases-list">
          <div style="padding: 24px; text-align: center; color: #64748B;">Loading your cases...</div>
        </div>
      </div>
    </div>
  `;
}

export async function bindStudentDashboardEvents(container, router) {
  const listEl = container.querySelector('#student-cases-list');

  try {
    const res = await api.get('/api/cases');
    const cases = res.cases || [];

    if (cases.length === 0) {
      listEl.innerHTML = `
        <div class="empty-state">
          ${icon('shield', '', 48)}
          <div class="empty-state-title">No safety complaints filed yet</div>
          <p style="font-size: 0.875rem; max-width: 400px; margin: 0 auto 16px;">
            If you experience or witness harassment, ragging, or unsafe behavior, you can report it confidentially.
          </p>
          <a href="#/complaint/new" class="btn btn-primary btn-sm">
            ${icon('file', '', 16)} Submit a Complaint
          </a>
        </div>
      `;
      return;
    }

    listEl.innerHTML = `
      <div class="table-responsive">
        <table class="data-table">
          <thead>
            <tr>
              <th>Case Reference</th>
              <th>Category</th>
              <th>Incident Date</th>
              <th>Status</th>
              <th>Current Stage</th>
              <th>Attachments</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${cases.map(c => `
              <tr>
                <td>
                  <a href="#/cases/${c.case_ref}" style="font-weight: 700; color: #0F172A; text-decoration: none;" class="tabular-nums">
                    ${c.case_ref}
                  </a>
                  ${c.urgent ? '<span class="badge badge-urgent" style="margin-left: 6px;">URGENT</span>' : ''}
                </td>
                <td>
                  <span style="font-weight: 500;">${c.category}</span>
                  <div style="font-size: 0.75rem; color: #64748B;">${c.location_name || 'Designated Campus Area'}</div>
                </td>
                <td class="tabular-nums" style="font-size: 0.8125rem;">
                  ${new Date(c.incident_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                </td>
                <td>
                  <span class="badge badge-${c.status === 'Resolved' ? 'success' : (c.status === 'Under Investigation' ? 'warning' : 'info')}">
                    ${c.status}
                  </span>
                </td>
                <td>
                  <span class="badge badge-${c.assigned_level === 'HOD' ? 'hod' : (c.assigned_level === 'Dean' ? 'dean' : 'higher')}">
                    ${c.assigned_level} Review
                  </span>
                </td>
                <td>
                  <div style="display: flex; gap: 6px;">
                    ${c.has_audio ? `<span title="Direct Audio Available" class="badge" style="background: rgba(20, 184, 166, 0.1); color: #0D9488;">${icon('mic', '', 12)} Audio</span>` : ''}
                    ${c.has_evidence ? `<span title="Evidence Files Attached" class="badge" style="background: rgba(139, 124, 255, 0.1); color: #6366F1;">${icon('file', '', 12)} Files</span>` : ''}
                    ${(!c.has_audio && !c.has_evidence) ? '<span style="color: #94A3B8; font-size: 0.75rem;">None</span>' : ''}
                  </div>
                </td>
                <td>
                  <div style="display: flex; align-items: center; gap: 8px;">
                    <a href="#/cases/${c.case_ref}" class="btn btn-secondary btn-sm">
                      Track Case
                    </a>
                    <button type="button" class="btn btn-ghost btn-sm open-wa-btn" data-case-id="${c.id}" title="Open WhatsApp demo notification">
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
    const waButtons = listEl.querySelectorAll('.open-wa-btn');
    waButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        openWhatsAppNotificationModal(btn.dataset.caseId, { level: 'extended' });
      });
    });

  } catch (err) {
    listEl.innerHTML = `<div style="padding: 24px; color: #EF4444;">Failed to load cases: ${err.message}</div>`;
  }
}
