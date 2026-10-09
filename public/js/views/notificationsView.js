import { api } from '../services/api.js';
import { showToast } from '../components/toast.js';
import { icon } from '../components/icons.js';

export function renderNotificationsView() {
  return `
    <div class="page-container" style="max-width: 720px;">
      <div class="card">
        <div class="card-header">
          <div>
            <h2 class="card-title">Notification Centre</h2>
            <p class="card-subtitle">Real-time status updates, review assignments, and inquiries</p>
          </div>
          <button type="button" id="btn-mark-all-read" class="btn btn-secondary btn-sm">
            Mark All as Read
          </button>
        </div>

        <div id="notifications-list-mount">
          <div style="padding: 24px; text-align: center; color: #64748B;">Loading notifications...</div>
        </div>
      </div>
    </div>
  `;
}

export async function bindNotificationsEvents(container, router) {
  const mount = container.querySelector('#notifications-list-mount');
  const btnMarkAll = container.querySelector('#btn-mark-all-read');

  async function loadNotifications() {
    try {
      const res = await api.get('/api/notifications');
      const list = res.notifications || [];

      if (list.length === 0) {
        mount.innerHTML = `
          <div class="empty-state">
            ${icon('bell', '', 40)}
            <div class="empty-state-title">No notifications</div>
            <p style="font-size: 0.8125rem;">You are up to date on all case events.</p>
          </div>
        `;
        return;
      }

      mount.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 8px;">
          ${list.map(n => `
            <div style="border: 1px solid #E2E8F0; border-radius: 8px; padding: 12px 14px; background: ${n.read_at ? '#FFFFFF' : '#F0FDFA'}; display: flex; align-items: flex-start; justify-content: space-between; gap: 12px;">
              <div>
                <div style="font-weight: 700; font-size: 0.875rem; color: #0F172A; margin-bottom: 2px;">
                  ${n.title}
                </div>
                <div style="font-size: 0.8125rem; color: #475569; line-height: 1.5;">${n.body}</div>
                <div class="tabular-nums" style="font-size: 0.6875rem; color: #94A3B8; margin-top: 4px;">
                  ${new Date(n.created_at).toLocaleString('en-GB')}
                </div>
              </div>
              ${!n.read_at ? `
                <button type="button" class="btn btn-ghost btn-sm mark-read-btn" data-notif-id="${n.id}" style="color: var(--accent-teal-dark);">
                  Mark Read
                </button>
              ` : ''}
            </div>
          `).join('')}
        </div>
      `;

      mount.querySelectorAll('.mark-read-btn').forEach(b => {
        b.addEventListener('click', async () => {
          await api.patch(`/api/notifications/${b.dataset.notifId}/read`, {});
          loadNotifications();
        });
      });

    } catch (err) {
      mount.innerHTML = `<div style="padding: 24px; color: #EF4444;">Failed to load notifications: ${err.message}</div>`;
    }
  }

  btnMarkAll.addEventListener('click', async () => {
    try {
      await api.post('/api/notifications/mark-all-read', {});
      showToast('All notifications marked as read', 'info');
      loadNotifications();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  loadNotifications();
}
