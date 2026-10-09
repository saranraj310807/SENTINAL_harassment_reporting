import { api } from '../services/api.js';
import { openModal } from './modal.js';
import { showToast } from './toast.js';
import { icon } from './icons.js';

export async function openWhatsAppNotificationModal(caseId, options = {}) {
  let modalInstance = null;
  const initialLevel = options.level || 'minimal';

  try {
    const data = await api.post(`/api/whatsapp/${caseId}/prepare`, { level: initialLevel });

    const contentHtml = `
      <div>
        <div style="font-size: 0.8125rem; color: #475569; margin-bottom: 16px;">
          Review the pre-formatted notification before dispatching. SENTINEL integrates via standard WhatsApp click-to-chat without storing sensitive messages externally.
        </div>

        <!-- Honest Status Tracker -->
        <div class="whatsapp-state-tracker" id="wa-status-box">
          ${icon('whatsapp', 'text-teal', 18)}
          <div>
            Status: <strong id="wa-state-label">Message Prepared</strong><br>
            <span style="font-size: 0.6875rem; color: #94A3B8;">Recipient: +${data.recipient} (Authorized Campus Dispatch)</span>
          </div>
        </div>

        <!-- WhatsApp Preview Card -->
        <div class="whatsapp-card">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
            <span style="font-size: 0.75rem; color: #8696A0; text-transform: uppercase;">Message Preview (${data.level.toUpperCase()})</span>
            <span style="font-size: 0.6875rem; color: #25D366;">E.164 Verified</span>
          </div>
          <div class="whatsapp-bubble" id="wa-message-text">${data.messageText}</div>
        </div>

        <!-- Honest Disclaimer Notice -->
        <div style="background: #FFFBEB; border: 1px solid #FCD34D; border-radius: 8px; padding: 12px; margin-top: 16px; font-size: 0.75rem; color: #92400E; display: flex; align-items: flex-start; gap: 8px;">
          ${icon('alert', '', 16)}
          <div>
            <strong>Delivery Verification Limit:</strong><br>
            ${data.statusNotice}
          </div>
        </div>
      </div>
    `;

    const footerHtml = `
      <div style="display: flex; align-items: center; justify-content: space-between; width: 100%; gap: 12px;">
        <div style="display: flex; gap: 8px;">
          <button type="button" id="btn-copy-wa-message" class="btn btn-secondary btn-sm">
            ${icon('copy', '', 14)} Copy Text
          </button>
          <button type="button" id="btn-copy-wa-link" class="btn btn-secondary btn-sm">
            ${icon('link', '', 14)} Copy Link
          </button>
        </div>
        <button type="button" id="btn-open-wa" class="btn btn-primary" style="background: #25D366; color: #FFFFFF;">
          ${icon('whatsapp', '', 16)} Open WhatsApp Notification
        </button>
      </div>
    `;

    modalInstance = openModal({
      title: 'WhatsApp Notification Dispatch',
      content: contentHtml,
      footer: footerHtml,
      maxWidth: '580px'
    });

    const backdrop = modalInstance.backdrop;
    const btnOpen = backdrop.querySelector('#btn-open-wa');
    const btnCopyMessage = backdrop.querySelector('#btn-copy-wa-message');
    const btnCopyLink = backdrop.querySelector('#btn-copy-wa-link');
    const stateLabel = backdrop.querySelector('#wa-state-label');

    btnOpen.addEventListener('click', async () => {
      // 1. Open WhatsApp in new tab
      window.open(data.clickToChatUrl, '_blank', 'noopener,noreferrer');

      // 2. Record state transition to 'opened' then 'awaiting_manual_send'
      try {
        stateLabel.textContent = 'WhatsApp Opened / Awaiting Manual Send';
        await api.post(`/api/whatsapp/${data.id}/state`, { state: 'opened' });
        await api.post(`/api/whatsapp/${data.id}/state`, { state: 'awaiting_manual_send' });
        showToast('WhatsApp opened in new tab. Awaiting manual send by sender.', 'info');
      } catch (err) {
        console.warn('State track notice:', err.message);
      }
    });

    btnCopyMessage.addEventListener('click', async () => {
      try {
        if (navigator.clipboard) {
          await navigator.clipboard.writeText(data.messageText);
        } else {
          // Fallback
          const ta = document.createElement('textarea');
          ta.value = data.messageText;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          ta.remove();
        }
        showToast('Notification message copied to clipboard', 'success');
      } catch {
        showToast('Failed to copy to clipboard', 'error');
      }
    });

    btnCopyLink.addEventListener('click', async () => {
      try {
        if (navigator.clipboard) {
          await navigator.clipboard.writeText(data.clickToChatUrl);
        } else {
          const ta = document.createElement('textarea');
          ta.value = data.clickToChatUrl;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          ta.remove();
        }
        showToast('Click-to-chat URL copied to clipboard', 'success');
      } catch {
        showToast('Failed to copy link', 'error');
      }
    });

  } catch (err) {
    showToast(`WhatsApp notification error: ${err.message}`, 'error');
  }
}
