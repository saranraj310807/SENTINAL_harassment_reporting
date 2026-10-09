import { api } from '../services/api.js';
import { openModal } from './modal.js';
import { showToast } from './toast.js';
import { icon } from './icons.js';

export async function openWhatsAppNotificationModal(caseId, options = {}) {
  let modalInstance = null;
  // Default to extended level for demo
  const initialLevel = options.level || 'extended';

  try {
    const data = await api.post(`/api/whatsapp/${caseId}/prepare`, {
      level: initialLevel,
      audioLinkUrl: options.audioLinkUrl || null
    });

    const canUseWebShareFiles = typeof navigator !== 'undefined' &&
      !!navigator.canShare &&
      typeof File !== 'undefined';

    const getStatusDisplay = (state) => {
      switch (state) {
        case 'prepared': return 'Message prepared';
        case 'opened': return 'WhatsApp opened';
        case 'awaiting_manual_send': return 'Awaiting manual send';
        case 'audio_share_sheet_opened': return 'Audio share sheet opened';
        case 'audio_link_created': return 'Audio link created';
        default: return 'Message prepared';
      }
    };

    const contentHtml = `
      <div>
        <div style="font-size: 0.8125rem; color: #475569; margin-bottom: 16px;">
          Review the pre-formatted notification before dispatching. SENTINEL dispatches confidential alerts via official WhatsApp click-to-chat and secure device sharing without external data retention.
        </div>

        <!-- Honest Status Tracker (Never claims delivery or sent) -->
        <div class="whatsapp-state-tracker" id="wa-status-box">
          ${icon('whatsapp', 'text-teal', 18)}
          <div style="flex: 1;">
            Status: <strong id="wa-state-label">${getStatusDisplay(data.state)}</strong><br>
            <span style="font-size: 0.6875rem; color: #94A3B8;">
              Configured Dispatch Recipient: +${data.recipient} (Verified E.164)
            </span>
          </div>
        </div>

        <!-- Audio Dispatch Options (When audio is attached to case) -->
        ${data.hasAudio ? `
          <div style="background: #111B21; border: 1px solid #202C33; border-radius: 8px; padding: 14px; margin-bottom: 16px;">
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px;">
              <span style="font-size: 0.8125rem; font-weight: 700; color: #E9EDEF; display: flex; align-items: center; gap: 6px;">
                ${icon('mic', 'text-teal', 16)} WhatsApp Audio Dispatch
              </span>
              <span style="font-size: 0.6875rem; color: #25D366; background: rgba(37,211,102,0.1); padding: 2px 6px; border-radius: 4px;">
                Format: .m4a (Native Chat Audio)
              </span>
            </div>

            <!-- Share Audio Sheet Section (Mobile / Web Share Level 2) -->
            <div id="web-share-section" style="margin-bottom: 12px;">
              <div style="font-size: 0.75rem; color: #8696A0; margin-bottom: 8px;">
                Direct Voice Audio: Attaches original recording file directly into WhatsApp so recipient can play it within the chat thread.
              </div>
              <div style="font-size: 0.6875rem; color: #38BDF8; margin-bottom: 8px;">
                Instruction: Select WhatsApp in the share sheet, then pick recipient contact: <strong>+${data.recipient}</strong>
              </div>
              <button type="button" id="btn-share-audio-wa" class="btn btn-primary btn-sm" style="background: #00A884; color: #FFFFFF; width: 100%; justify-content: center;">
                ${icon('share', '', 14)} Share Audio via WhatsApp (Web Share)
              </button>
            </div>

            <!-- Desktop / Unsupported Fallback Notice -->
            <div id="desktop-share-notice" style="display: none; background: #182229; border: 1px solid #2A3942; border-radius: 6px; padding: 10px; margin-bottom: 12px; font-size: 0.75rem; color: #8696A0;">
              Web Share audio attachment is supported on mobile devices (Android / iOS). On desktop browsers, use the expiring link or download audio below.
              <div style="margin-top: 8px;">
                <button type="button" id="btn-download-audio" class="btn btn-secondary btn-sm" style="font-size: 0.6875rem;">
                  ${icon('download', '', 12)} Download Audio for Manual Attachment
                </button>
              </div>
            </div>

            <!-- Method B: Expiring Audio Link Section -->
            <div style="border-top: 1px solid #202C33; padding-top: 10px; margin-top: 10px;">
              <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">
                <span style="font-size: 0.75rem; font-weight: 600; color: #CBD5E1;">Expiring Audio Link (24 Hours)</span>
                <button type="button" id="btn-gen-audio-link" class="btn btn-ghost btn-sm" style="color: #38BDF8; font-size: 0.6875rem; padding: 2px 6px;">
                  ${icon('link', '', 12)} Generate Link
                </button>
              </div>
              <div id="audio-link-display" style="display: none; background: #0C1317; border: 1px dashed #2A3942; border-radius: 6px; padding: 10px; font-size: 0.75rem;">
                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
                  <input type="text" id="wa-audio-link-input" readonly class="form-control" style="font-size: 0.6875rem; background: #111B21; color: #FFFFFF; padding: 4px 8px; height: 28px;">
                  <button type="button" id="btn-copy-audio-link" class="btn btn-secondary btn-sm" style="height: 28px; padding: 0 8px; font-size: 0.6875rem;">Copy</button>
                </div>
                <div style="color: #F59E0B; font-size: 0.6875rem; line-height: 1.4;">
                  Notice: Anyone holding this temporary link can listen until it expires in 24 hours or reaches 5 plays. Case details are strictly isolated.
                </div>
                <div id="audio-link-localhost-warning" style="display: none; color: #EF4444; font-size: 0.6875rem; margin-top: 4px;">
                  Warning: APP_BASE_URL is a local development address. Link is omitted from WhatsApp message text to avoid sending unroutable localhost links.
                </div>
              </div>
            </div>
          </div>
        ` : ''}

        <!-- WhatsApp Preview Card -->
        <div class="whatsapp-card">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
            <span style="font-size: 0.75rem; color: #8696A0; text-transform: uppercase;">Message Preview (${data.level.toUpperCase()})</span>
            <span style="font-size: 0.6875rem; color: #25D366;">UTF-8 Plain Text</span>
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
      <div style="display: flex; align-items: center; justify-content: space-between; width: 100%; gap: 12px; flex-wrap: wrap;">
        <div style="display: flex; gap: 8px;">
          <button type="button" id="btn-copy-wa-message" class="btn btn-secondary btn-sm">
            ${icon('copy', '', 14)} Copy Text
          </button>
          <button type="button" id="btn-copy-wa-link" class="btn btn-secondary btn-sm">
            ${icon('link', '', 14)} Copy wa.me Link
          </button>
        </div>
        <button type="button" id="btn-open-wa" class="btn btn-primary" style="background: #25D366; color: #FFFFFF;">
          ${icon('whatsapp', '', 16)} Open WhatsApp (Text)
        </button>
      </div>
    `;

    modalInstance = openModal({
      title: 'WhatsApp Notification Dispatch',
      content: contentHtml,
      footer: footerHtml,
      maxWidth: '620px'
    });

    const backdrop = modalInstance.backdrop;
    const btnOpen = backdrop.querySelector('#btn-open-wa');
    const btnCopyMessage = backdrop.querySelector('#btn-copy-wa-message');
    const btnCopyLink = backdrop.querySelector('#btn-copy-wa-link');
    const stateLabel = backdrop.querySelector('#wa-state-label');
    const msgBubble = backdrop.querySelector('#wa-message-text');

    // Audio elements
    const btnShareAudio = backdrop.querySelector('#btn-share-audio-wa');
    const webShareSection = backdrop.querySelector('#web-share-section');
    const desktopNotice = backdrop.querySelector('#desktop-share-notice');
    const btnDownloadAudio = backdrop.querySelector('#btn-download-audio');
    const btnGenLink = backdrop.querySelector('#btn-gen-audio-link');
    const linkDisplay = backdrop.querySelector('#audio-link-display');
    const linkInput = backdrop.querySelector('#wa-audio-link-input');
    const btnCopyAudioLink = backdrop.querySelector('#btn-copy-audio-link');
    const localhostWarning = backdrop.querySelector('#audio-link-localhost-warning');

    let currentMessageText = data.messageText;
    let currentClickToChatUrl = data.clickToChatUrl;

    // Check Web Share API Level 2 file sharing capability
    if (btnShareAudio) {
      if (!canUseWebShareFiles) {
        // Hide button, show desktop explanation
        btnShareAudio.style.display = 'none';
        if (desktopNotice) desktopNotice.style.display = 'block';
      }
    }

    // Method A: Share Audio via WhatsApp (Web Share Level 2)
    if (btnShareAudio) {
      btnShareAudio.addEventListener('click', async () => {
        try {
          btnShareAudio.disabled = true;
          btnShareAudio.textContent = 'Preparing audio file...';

          // 1. Fetch audio from authenticated endpoint with share format (.m4a AAC)
          const audioRes = await fetch(`/api/cases/${caseId}/audio?share=1`);
          if (!audioRes.ok) {
            throw new Error(`Failed to load audio (${audioRes.status}).`);
          }

          const blob = await audioRes.blob();
          const cleanFileName = `SENTINEL-${caseId}.m4a`;
          const audioFile = new File([blob], cleanFileName, { type: 'audio/mp4' });

          // 2. Test canShare with file
          if (navigator.canShare && navigator.canShare({ files: [audioFile] })) {
            await navigator.share({
              files: [audioFile],
              text: currentMessageText
            });

            // 3. Record honest state transition: audio_share_sheet_opened
            stateLabel.textContent = 'Audio share sheet opened / Awaiting manual send';
            await api.post(`/api/whatsapp/${data.id}/state`, { state: 'audio_share_sheet_opened' });
            showToast('Audio share sheet opened. Please select WhatsApp and send manually.', 'info');
          } else {
            // Fallback for devices where canShare({ files }) returns false
            btnShareAudio.style.display = 'none';
            if (desktopNotice) desktopNotice.style.display = 'block';
            showToast('Your browser does not support direct audio file sharing. Use Expiring Link or Download.', 'warning');
          }
        } catch (err) {
          if (err.name !== 'AbortError') {
            console.warn('Share error:', err);
            showToast(`Audio share: ${err.message}`, 'warning');
          }
        } finally {
          btnShareAudio.disabled = false;
          btnShareAudio.innerHTML = `${icon('share', '', 14)} Share Audio via WhatsApp (Web Share)`;
        }
      });
    }

    // Download audio button for desktop staff
    if (btnDownloadAudio) {
      btnDownloadAudio.addEventListener('click', () => {
        window.open(`/api/cases/${caseId}/audio?share=1&download=1`, '_blank');
        showToast('Audio download started for manual dispatch.', 'info');
      });
    }

    // Method B: Expiring Audio Link generation
    if (btnGenLink) {
      btnGenLink.addEventListener('click', async () => {
        try {
          btnGenLink.disabled = true;
          btnGenLink.textContent = 'Generating...';

          const linkResult = await api.post(`/api/cases/${caseId}/audio-link`, {});
          linkInput.value = linkResult.listenUrl;
          linkDisplay.style.display = 'block';

          if (!linkResult.isPublicHttps) {
            localhostWarning.style.display = 'block';
          } else {
            localhostWarning.style.display = 'none';
            // Update prepared message to include audio link
            const updatedData = await api.post(`/api/whatsapp/${caseId}/prepare`, {
              level: data.level,
              audioLinkUrl: linkResult.listenUrl
            });
            currentMessageText = updatedData.messageText;
            currentClickToChatUrl = updatedData.clickToChatUrl;
            msgBubble.textContent = currentMessageText;
          }

          stateLabel.textContent = 'Audio link created';
          showToast('Expiring audio link created (24 hours valid, 5 plays maximum).', 'success');
        } catch (err) {
          showToast(`Could not generate audio link: ${err.message}`, 'error');
        } finally {
          btnGenLink.disabled = false;
          btnGenLink.innerHTML = `${icon('link', '', 12)} Re-generate Link`;
        }
      });
    }

    if (btnCopyAudioLink) {
      btnCopyAudioLink.addEventListener('click', async () => {
        try {
          if (navigator.clipboard) {
            await navigator.clipboard.writeText(linkInput.value);
          } else {
            linkInput.select();
            document.execCommand('copy');
          }
          showToast('Expiring audio playback link copied to clipboard.', 'success');
        } catch {
          showToast('Failed to copy audio link', 'error');
        }
      });
    }

    // Click-to-chat open
    btnOpen.addEventListener('click', async () => {
      // 1. Open WhatsApp in new tab
      window.open(currentClickToChatUrl, '_blank', 'noopener,noreferrer');

      // 2. Record state transition to 'opened' then 'awaiting_manual_send'
      try {
        stateLabel.textContent = 'WhatsApp opened / Awaiting manual send';
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
          await navigator.clipboard.writeText(currentMessageText);
        } else {
          const ta = document.createElement('textarea');
          ta.value = currentMessageText;
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
          await navigator.clipboard.writeText(currentClickToChatUrl);
        } else {
          const ta = document.createElement('textarea');
          ta.value = currentClickToChatUrl;
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
