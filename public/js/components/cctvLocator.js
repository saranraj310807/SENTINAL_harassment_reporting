import { api } from '../services/api.js';
import { icon } from './icons.js';
import { showToast } from './toast.js';

export class CctvLocatorComponent {
  constructor(options = {}) {
    this.onSelectionChange = options.onSelectionChange || (() => {});
    this.selectedCameraIds = new Set();
  }

  async queryCameras(locationId, incidentAt, containerEl) {
    if (!locationId || !incidentAt) {
      containerEl.innerHTML = '<div style="color: #64748B; font-size: 0.8125rem;">Select location and incident date/time to check CCTV coverage.</div>';
      return;
    }

    containerEl.innerHTML = '<div style="padding: 16px; color: #64748B;">Searching fictional camera registry...</div>';

    try {
      const res = await api.get(`/api/cctv/locate?locationId=${encodeURIComponent(locationId)}&incidentAt=${encodeURIComponent(incidentAt)}`);
      this.renderResults(res.cameras, res.disclaimer, containerEl);
    } catch (err) {
      containerEl.innerHTML = `<div style="color: #EF4444; font-size: 0.8125rem;">Failed to load CCTV coverage: ${err.message}</div>`;
    }
  }

  renderResults(cameras, disclaimer, containerEl) {
    if (!cameras || cameras.length === 0) {
      containerEl.innerHTML = `
        <div style="background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px; padding: 16px; font-size: 0.8125rem; color: #64748B;">
          No matching cameras registered for this campus location and time window.
        </div>
      `;
      return;
    }

    let cardsHtml = '';
    for (const cam of cameras) {
      const isSelected = this.selectedCameraIds.has(cam.id);
      let statusBadge = '';

      if (cam.availabilityStatus === 'Likely available') {
        statusBadge = '<span class="badge badge-success">Likely Available</span>';
      } else if (cam.availabilityStatus.includes('overwritten') || cam.availabilityStatus.includes('Outside')) {
        statusBadge = '<span class="badge badge-warning">Overwritten / Unavailable</span>';
      } else {
        statusBadge = '<span class="badge badge-danger">Offline / Unverified</span>';
      }

      cardsHtml += `
        <div class="cctv-camera-item" style="border: 1px solid #E2E8F0; border-radius: 8px; padding: 14px; margin-bottom: 10px; background: #FFFFFF;">
          <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 8px;">
            <div style="display: flex; align-items: center; gap: 10px;">
              <input type="checkbox" id="cam-${cam.id}" value="${cam.id}" ${isSelected ? 'checked' : ''} class="cam-checkbox" style="width: 18px; height: 18px; cursor: pointer;">
              <div>
                <label for="cam-${cam.id}" style="font-weight: 600; font-size: 0.875rem; color: #0F172A; cursor: pointer;">
                  ${cam.cameraCode}: ${cam.label}
                </label>
                <div style="font-size: 0.75rem; color: #64748B;">${cam.coverageDescription}</div>
              </div>
            </div>
            <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 4px;">
              ${statusBadge}
              <span class="badge" style="background: #F1F5F9; color: #475569; font-size: 0.6875rem;">Fictional Camera</span>
            </div>
          </div>

          <div style="font-size: 0.75rem; color: #475569; background: #F8FAFC; padding: 8px 12px; border-radius: 6px; margin-top: 8px;">
            <div><strong>Hours:</strong> ${cam.operatingHours} | <strong>Retention:</strong> ${cam.retentionHours}h</div>
            <div style="color: #64748B; margin-top: 2px;"><strong>Analysis:</strong> ${cam.reasoning}</div>
          </div>
        </div>
      `;
    }

    containerEl.innerHTML = `
      <div style="margin-bottom: 12px;">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
          <div style="font-size: 0.875rem; font-weight: 600; color: #0F172A;">
            ${cameras.length} CCTV Cameras Evaluated in Selected Zone
          </div>
          <span style="font-size: 0.75rem; color: #64748B;">Select cameras for review request</span>
        </div>
        ${cardsHtml}
      </div>

      <div style="background: #EFF6FF; border: 1px solid #BFDBFE; border-radius: 8px; padding: 12px; font-size: 0.75rem; color: #1E40AF; display: flex; align-items: flex-start; gap: 8px;">
        ${icon('shield', '', 16)}
        <div><strong>Ethical CCTV Disclaimer:</strong> ${disclaimer}</div>
      </div>
    `;

    // Bind checkboxes
    const checkboxes = containerEl.querySelectorAll('.cam-checkbox');
    checkboxes.forEach(cb => {
      cb.addEventListener('change', (e) => {
        const id = parseInt(e.target.value, 10);
        if (e.target.checked) {
          this.selectedCameraIds.add(id);
        } else {
          this.selectedCameraIds.delete(id);
        }
        this.onSelectionChange(Array.from(this.selectedCameraIds));
      });
    });
  }

  getSelectedCameraIds() {
    return Array.from(this.selectedCameraIds);
  }
}
