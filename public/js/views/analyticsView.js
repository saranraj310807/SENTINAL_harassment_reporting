import { api } from '../services/api.js';
import { renderBarChart, renderDonutChart } from '../components/charts.js';
import { icon } from '../components/icons.js';

export function renderAnalyticsView() {
  return `
    <div class="page-container">
      <!-- Header -->
      <div class="card" style="margin-bottom: 24px;">
        <div class="card-header">
          <div>
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
              <span class="badge" style="background: #E0E7FF; color: #3730A3;">Institutional Intelligence</span>
              <span style="font-size: 0.75rem; color: #64748B;">Anonymized Aggregate Reporting</span>
            </div>
            <h2 class="card-title" style="font-size: 1.5rem;">Campus Safety & Incident Analytics</h2>
            <p class="card-subtitle">Aggregated trends, response distribution, and safety zone hotspots</p>
          </div>

          <!-- Filters -->
          <div style="display: flex; gap: 10px; flex-wrap: wrap;">
            <select id="analytics-filter-days" class="form-control" style="width: auto; min-height: 34px; font-size: 0.8125rem;">
              <option value="30">Past 30 Days</option>
              <option value="60" selected>Past 60 Days</option>
              <option value="90">Past 90 Days</option>
            </select>
            <select id="analytics-filter-cat" class="form-control" style="width: auto; min-height: 34px; font-size: 0.8125rem;">
              <option value="all">All Categories</option>
              <option value="Ragging">Ragging</option>
              <option value="Harassment">Harassment</option>
              <option value="Bullying">Bullying</option>
              <option value="Stalking/Unwanted following">Stalking</option>
              <option value="Verbal abuse/Intimidation">Verbal Abuse</option>
            </select>
          </div>
        </div>

        <div style="background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px; padding: 12px; font-size: 0.75rem; color: #475569; display: flex; align-items: center; gap: 8px;">
          ${icon('shield', '', 16)}
          <span><strong>Privacy Guarantee:</strong> All analytics compute strictly from aggregate counts. Student names, SIF numbers, and individual identities are strictly excluded from all charts.</span>
        </div>
      </div>

      <!-- Main Analytics Mount -->
      <div id="analytics-mount">
        <div style="padding: 40px; text-align: center; color: #64748B;">Computing campus analytics...</div>
      </div>
    </div>
  `;
}

export async function bindAnalyticsEvents(container, router) {
  const mount = container.querySelector('#analytics-mount');
  const daysSelect = container.querySelector('#analytics-filter-days');
  const catSelect = container.querySelector('#analytics-filter-cat');

  async function loadData() {
    mount.innerHTML = '<div style="padding: 40px; text-align: center; color: #64748B;">Computing metrics...</div>';
    const days = daysSelect.value;
    const cat = catSelect.value;

    try {
      const data = await api.get(`/api/analytics?days=${days}&category=${encodeURIComponent(cat)}`);
      renderDashboard(data);
    } catch (err) {
      mount.innerHTML = `<div style="padding: 24px; color: #EF4444;">Failed to load analytics: ${err.message}</div>`;
    }
  }

  function renderDashboard(data) {
    const s = data.summary;

    const deptChartItems = (data.departmentBreakdown || []).map(d => ({
      label: d.code,
      value: d.count,
      color: '#14B8A6'
    }));

    const catChartItems = (data.categoryBreakdown || []).map(c => ({
      label: c.category,
      value: c.count
    }));

    const zoneItems = (data.zoneBreakdown || []).map(z => ({
      label: `Zone ${z.zone}`,
      value: z.count,
      color: '#8B7CFF'
    }));

    mount.innerHTML = `
      <!-- Metric Highlights -->
      <div class="stats-grid">
        <div class="stat-card">
          <div>
            <div class="stat-value tabular-nums">${s.total}</div>
            <div class="stat-label">Total Incidents</div>
          </div>
          <div class="stat-icon">${icon('shield', '', 20)}</div>
        </div>
        <div class="stat-card">
          <div>
            <div class="stat-value tabular-nums" style="color: #059669;">${s.resolved}</div>
            <div class="stat-label">Resolved (${s.resolutionRate}%)</div>
          </div>
          <div class="stat-icon" style="color: #059669;">${icon('check', '', 20)}</div>
        </div>
        <div class="stat-card">
          <div>
            <div class="stat-value tabular-nums" style="color: #D97706;">${s.open}</div>
            <div class="stat-label">Active / In Progress</div>
          </div>
          <div class="stat-icon" style="color: #D97706;">${icon('file', '', 20)}</div>
        </div>
        <div class="stat-card">
          <div>
            <div class="stat-value tabular-nums" style="color: #DC2626;">${s.urgent}</div>
            <div class="stat-label">Urgent Pathway</div>
          </div>
          <div class="stat-icon" style="color: #DC2626;">${icon('triangleAlert', '', 20)}</div>
        </div>
      </div>

      <!-- Charts Grid -->
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(420px, 1fr)); gap: 20px; margin-bottom: 24px;">
        <!-- Department Bar Chart -->
        <div class="card" style="margin-bottom: 0;">
          <h3 class="card-title" style="margin-bottom: 4px;">Complaints by Academic Department</h3>
          <p class="card-subtitle" style="margin-bottom: 16px;">Distribution of incidents across departments</p>
          ${renderBarChart(deptChartItems, { height: 220 })}
        </div>

        <!-- Category Donut Chart -->
        <div class="card" style="margin-bottom: 0;">
          <h3 class="card-title" style="margin-bottom: 4px;">Incident Category Proportions</h3>
          <p class="card-subtitle" style="margin-bottom: 16px;">Breakdown by safety violation classification</p>
          ${renderDonutChart(catChartItems, { size: 190 })}
        </div>
      </div>

      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(420px, 1fr)); gap: 20px;">
        <!-- Security Zones Bar Chart -->
        <div class="card" style="margin-bottom: 0;">
          <h3 class="card-title" style="margin-bottom: 4px;">Campus Zone Hotspot Frequency</h3>
          <p class="card-subtitle" style="margin-bottom: 16px;">Location zones with recurring incident reports</p>
          ${renderBarChart(zoneItems, { height: 200, color: '#8B7CFF' })}
        </div>

        <!-- CCTV Request Status & Escalations -->
        <div class="card" style="margin-bottom: 0;">
          <h3 class="card-title" style="margin-bottom: 12px;">CCTV Requests & Escalation Levels</h3>
          
          <div style="margin-bottom: 16px;">
            <div style="font-size: 0.8125rem; font-weight: 600; color: #1E293B; margin-bottom: 8px;">CCTV Requests by Status:</div>
            <div style="display: flex; gap: 8px; flex-wrap: wrap;">
              ${(data.cctvStatus || []).map(cs => `
                <div style="padding: 6px 12px; background: #F1F5F9; border-radius: 6px; font-size: 0.8125rem;">
                  <strong class="tabular-nums">${cs.count}</strong> <span style="color: #64748B;">${cs.status}</span>
                </div>
              `).join('')}
            </div>
          </div>

          <div>
            <div style="font-size: 0.8125rem; font-weight: 600; color: #1E293B; margin-bottom: 8px;">Cases by Active Review Level:</div>
            <div style="display: flex; gap: 8px; flex-wrap: wrap;">
              ${(data.escalationBreakdown || []).map(eb => `
                <div style="padding: 6px 12px; background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 6px; font-size: 0.8125rem;">
                  <span class="badge badge-${eb.assigned_level === 'HOD' ? 'hod' : (eb.assigned_level === 'Dean' ? 'dean' : 'higher')}">${eb.assigned_level}</span>
                  <strong class="tabular-nums" style="margin-left: 6px;">${eb.count}</strong>
                </div>
              `).join('')}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  daysSelect.addEventListener('change', loadData);
  catSelect.addEventListener('change', loadData);
  loadData();
}
