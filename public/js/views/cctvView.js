import { api } from '../services/api.js';
import { icon } from '../components/icons.js';
import { CctvLocatorComponent } from '../components/cctvLocator.js';

export function renderCctvView() {
  return `
    <div class="page-container">
      <div class="card" style="margin-bottom: 24px;">
        <div class="card-header">
          <div>
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
              <span class="badge" style="background: #E0F2FE; color: #0369A1;">Campus Infrastructure</span>
              <span style="font-size: 0.75rem; color: #64748B;">Footage Retention & Coverage Analysis</span>
            </div>
            <h2 class="card-title" style="font-size: 1.5rem;">Smart CCTV Camera Locator</h2>
            <p class="card-subtitle">
              Verify spatial coverage and operational retention windows before footage is overwritten.
            </p>
          </div>
        </div>

        <div style="background: #EFF6FF; border: 1px solid #BFDBFE; border-radius: 8px; padding: 12px; font-size: 0.75rem; color: #1E40AF; display: flex; align-items: flex-start; gap: 8px; margin-bottom: 20px;">
          ${icon('shield', '', 16)}
          <div>
            <strong>Institutional Integrity Disclaimer:</strong><br>
            All cameras listed are synthetic demonstration records (<code>is_fictional=true</code>). This tool queries coverage zones and retention schedules only. It does not access live video feeds, identify persons, or establish culpability.
          </div>
        </div>

        <!-- Standalone Location & Time Checker -->
        <div style="background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px; padding: 16px; margin-bottom: 20px;">
          <h3 style="font-size: 0.9375rem; font-weight: 700; color: #0F172A; margin-bottom: 12px;">Query Camera Coverage by Zone</h3>
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 12px;">
            <div>
              <label class="form-label" for="cctv-loc-select">Campus Location</label>
              <select id="cctv-loc-select" class="form-control">
                <option value="">Loading locations...</option>
              </select>
            </div>
            <div>
              <label class="form-label" for="cctv-time-input">Incident Date & Time</label>
              <input type="datetime-local" id="cctv-time-input" class="form-control">
            </div>
          </div>
          <div style="display: flex; justify-content: flex-end; margin-top: 12px;">
            <button type="button" id="btn-run-cctv-query" class="btn btn-primary btn-sm">
              ${icon('camera', '', 14)} Evaluate Coverage
            </button>
          </div>
        </div>

        <div id="standalone-cctv-mount"></div>
      </div>

      <!-- Campus Camera Directory -->
      <div class="card">
        <h3 class="card-title" style="margin-bottom: 16px;">Campus Camera Directory (Fictional Demo Data)</h3>
        <div id="cameras-directory-mount">
          <div style="padding: 24px; text-align: center; color: #64748B;">Loading camera directory...</div>
        </div>
      </div>
    </div>
  `;
}

export async function bindCctvEvents(container, router) {
  const locSelect = container.querySelector('#cctv-loc-select');
  const timeInput = container.querySelector('#cctv-time-input');
  const queryMount = container.querySelector('#standalone-cctv-mount');
  const dirMount = container.querySelector('#cameras-directory-mount');

  // Set default time to now
  const nowLocal = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  timeInput.value = nowLocal;

  // Load locations
  try {
    const locRes = await api.get('/api/meta/locations');
    locSelect.innerHTML = locRes.locations.map(l => `<option value="${l.id}">${l.name} (${l.building} - Zone ${l.zone})</option>`).join('');
  } catch {
    locSelect.innerHTML = '<option value="1">Main Library Ground Floor</option>';
  }

  const locator = new CctvLocatorComponent();

  container.querySelector('#btn-run-cctv-query').addEventListener('click', () => {
    locator.queryCameras(locSelect.value, timeInput.value, queryMount);
  });

  // Load complete camera directory
  try {
    const camRes = await api.get('/api/cctv/cameras');
    const cams = camRes.cameras || [];

    dirMount.innerHTML = `
      <div class="table-responsive">
        <table class="data-table">
          <thead>
            <tr><th>Code</th><th>Label</th><th>Building / Zone</th><th>Operating Hours</th><th>Retention</th><th>Status</th></tr>
          </thead>
          <tbody>
            ${cams.map(c => `
              <tr>
                <td><strong class="tabular-nums">${c.cameraCode}</strong></td>
                <td>
                  <div style="font-weight: 500;">${c.label}</div>
                  <div style="font-size: 0.75rem; color: #64748B;">${c.coverageDescription}</div>
                </td>
                <td>${c.building || c.locationName} (Zone ${c.zone})</td>
                <td class="tabular-nums" style="font-size: 0.8125rem;">${c.operatingHours}</td>
                <td class="tabular-nums" style="font-size: 0.8125rem;">${c.retentionHours} Hours</td>
                <td>
                  <span class="badge badge-${c.verificationStatus === 'verified' ? 'success' : (c.verificationStatus === 'offline' ? 'danger' : 'warning')}">
                    ${c.verificationStatus}
                  </span>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  } catch (err) {
    dirMount.innerHTML = `<div style="padding: 24px; color: #EF4444;">Failed to load cameras: ${err.message}</div>`;
  }
}
