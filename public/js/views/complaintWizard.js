import { api } from '../services/api.js';
import { auth } from '../services/auth.js';
import { showToast } from '../components/toast.js';
import { icon } from '../components/icons.js';
import { AudioRecorderComponent } from '../components/audioRecorder.js';
import { CctvLocatorComponent } from '../components/cctvLocator.js';
import { openWhatsAppNotificationModal } from '../components/whatsappModal.js';

export function renderComplaintWizardView(params = {}) {
  const isAudioFirst = params.mode === 'audio';

  return `
    <div class="page-container" style="max-width: 860px;">
      <!-- Judge Demo Prefill Helper Bar -->
      <div class="demo-helper-bar">
        <div class="demo-helper-title">
          ${icon('shield', '', 16)} DEMO EVALUATION PREFILL HELPER:
        </div>
        <div style="display: flex; gap: 8px; flex-wrap: wrap;">
          <button type="button" class="btn btn-secondary btn-sm prefill-btn" data-preset="caseA">
            Preset A: Hostel Ragging (Urgent)
          </button>
          <button type="button" class="btn btn-secondary btn-sm prefill-btn" data-preset="caseB">
            Preset B: Related Hostel Incident (Links to A)
          </button>
          <button type="button" class="btn btn-secondary btn-sm prefill-btn" data-preset="caseC">
            Preset C: 3rd Related Report (Triggers Higher Auth)
          </button>
          <button type="button" class="btn btn-secondary btn-sm prefill-btn" data-preset="caseD">
            Preset D: Unrelated Library Report
          </button>
        </div>
      </div>

      <!-- Main Complaint Card -->
      <div class="card" id="complaint-card">
        <div class="card-header">
          <div>
            <h2 class="card-title">File Confidential Safety Complaint</h2>
            <p class="card-subtitle">Encrypted submission with optional direct voice recording and evidence preservation</p>
          </div>
          <div>
            <span class="badge" style="background: #E0E7FF; color: #3730A3;">Secure Session</span>
          </div>
        </div>

        <!-- Stepper Navigation -->
        <div class="stepper-nav" id="wizard-stepper">
          <button type="button" class="step-item active" data-step="1">
            <div class="step-circle">1</div>
            <span class="step-label">Incident Details</span>
          </button>
          <button type="button" class="step-item" data-step="2">
            <div class="step-circle">2</div>
            <span class="step-label">Voice & Evidence</span>
          </button>
          <button type="button" class="step-item" data-step="3">
            <div class="step-circle">3</div>
            <span class="step-label">CCTV Coverage</span>
          </button>
          <button type="button" class="step-item" data-step="4">
            <div class="step-circle">4</div>
            <span class="step-label">Review & Submit</span>
          </button>
        </div>

        <!-- STEP 1: Details & Location -->
        <div class="wizard-step" id="step-1-container">
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
            <div class="form-group" style="grid-column: span 2;">
              <label class="form-label" for="comp-category">Incident Category *</label>
              <select id="comp-category" class="form-control" required>
                <option value="Ragging">Ragging</option>
                <option value="Harassment">Harassment</option>
                <option value="Bullying">Bullying</option>
                <option value="Stalking/Unwanted following">Stalking / Unwanted Following</option>
                <option value="Verbal abuse/Intimidation">Verbal Abuse / Intimidation</option>
                <option value="Cyber harassment/Online">Cyber Harassment / Online Bullying</option>
                <option value="Discrimination">Discrimination</option>
                <option value="Other">Other Safety Concern</option>
              </select>
            </div>

            <div class="form-group">
              <label class="form-label" for="comp-datetime">Incident Date & Time *</label>
              <input type="datetime-local" id="comp-datetime" class="form-control" required>
              <div class="form-hint">Captured in Campus Timezone (Asia/Kolkata). Cannot be future date.</div>
            </div>

            <div class="form-group">
              <label class="form-label" for="comp-location">Campus Location *</label>
              <select id="comp-location" class="form-control" required>
                <option value="">Loading locations...</option>
              </select>
            </div>

            <div class="form-group" style="grid-column: span 2;">
              <label class="form-label" for="comp-location-detail">Specific Location Detail</label>
              <input type="text" id="comp-location-detail" class="form-control" placeholder="e.g. 2nd Floor Stairwell, Wing B corridor, Table 4">
            </div>

            <div class="form-group" style="grid-column: span 2;">
              <div style="background: #FFF1F2; border: 1px solid #FECDD3; border-radius: 8px; padding: 14px; display: flex; align-items: flex-start; gap: 12px;">
                <input type="checkbox" id="comp-urgent" style="width: 20px; height: 20px; margin-top: 2px; cursor: pointer;">
                <div>
                  <label for="comp-urgent" style="font-weight: 700; color: #9F1239; font-size: 0.875rem; cursor: pointer;">
                    Immediate Safety Flag: "I feel unsafe right now"
                  </label>
                  <p style="font-size: 0.75rem; color: #881337; margin-top: 2px;">
                    Checking this immediately routes this case into the Dean's urgent response queue without waiting for batch reviews. If you are in physical danger, please contact Campus Security Desk directly: <strong>044-2257-8888</strong>.
                  </p>
                </div>
              </div>
            </div>

            <div class="form-group" style="grid-column: span 2;">
              <label class="form-label">Confidentiality Preference</label>
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                <label class="selection-card selected" id="card-confidential">
                  <input type="radio" name="privacy_mode" value="confidential" checked style="margin-top: 4px;">
                  <div>
                    <div style="font-weight: 600; font-size: 0.875rem;">Standard Confidential</div>
                    <div style="font-size: 0.75rem; color: #64748B;">Visible to assigned reviewing HOD and authorized committee members.</div>
                  </div>
                </label>
                <label class="selection-card" id="card-anonymous">
                  <input type="radio" name="privacy_mode" value="anonymous_to_reviewers_where_permitted" style="margin-top: 4px;">
                  <div>
                    <div style="font-weight: 600; font-size: 0.875rem;">Masked from Reviewers</div>
                    <div style="font-size: 0.75rem; color: #64748B;">Identity masked during preliminary departmental assessment.</div>
                  </div>
                </label>
              </div>
            </div>
          </div>

          <div style="display: flex; justify-content: flex-end; margin-top: 24px;">
            <button type="button" class="btn btn-primary" id="btn-goto-step-2">
              Continue to Voice & Evidence ${icon('arrowRight', '', 16)}
            </button>
          </div>
        </div>

        <!-- STEP 2: Voice & Evidence -->
        <div class="wizard-step" id="step-2-container" style="display: none;">
          <div style="margin-bottom: 20px;">
            <!-- Direct Audio Recorder Card Mount -->
            <div id="audio-recorder-mount"></div>
          </div>

          <div class="form-group">
            <label class="form-label" for="comp-description">
              Written Narrative <span style="font-weight: 400; color: #64748B;">(Optional if voice complaint recorded)</span>
            </label>
            <textarea id="comp-description" class="form-control" placeholder="Describe what occurred, any specific threats, or context. (If submitting without audio, at least 20 characters is required)"></textarea>
            <div style="display: flex; justify-content: space-between; font-size: 0.75rem; color: #64748B; margin-top: 4px;">
              <span>Never forced to type if audio is recorded.</span>
              <span id="desc-char-count" class="tabular-nums">0 chars</span>
            </div>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
            <div class="form-group">
              <label class="form-label" for="comp-suspect">Optional Suspect Identifiers / Descriptors</label>
              <input type="text" id="comp-suspect" class="form-control" placeholder="e.g. 3 senior boys, tall with black leather jacket">
              <div class="form-hint">Used by rule-based engine to suggest potential linked incidents</div>
            </div>

            <div class="form-group">
              <label class="form-label" for="comp-witness">Optional Witness Details</label>
              <input type="text" id="comp-witness" class="form-control" placeholder="e.g. Roommates present, library counter staff">
            </div>
          </div>

          <!-- Evidence Attachments Dropzone -->
          <div class="form-group">
            <label class="form-label">Digital Evidence Files (Screenshots, Photos, Documents)</label>
            <div class="dropzone-box" id="evidence-dropzone">
              <input type="file" id="evidence-file-input" multiple accept="image/*,video/*,application/pdf,audio/*" style="display: none;">
              <div class="dropzone-icon" style="margin: 0 auto 8px;">${icon('file', '', 36)}</div>
              <div style="font-weight: 600; font-size: 0.875rem; color: #0F172A;">Click or drag screenshots, photos or PDFs here</div>
              <div style="font-size: 0.75rem; color: #64748B; margin-top: 4px;">Max 50MB total. Verified by server-side magic bytes.</div>
            </div>
            <div id="selected-files-list" style="margin-top: 10px;"></div>
          </div>

          <div style="display: flex; justify-content: space-between; margin-top: 24px;">
            <button type="button" class="btn btn-secondary" id="btn-back-step-1">
              Back to Details
            </button>
            <button type="button" class="btn btn-primary" id="btn-goto-step-3">
              Continue to CCTV Coverage ${icon('arrowRight', '', 16)}
            </button>
          </div>
        </div>

        <!-- STEP 3: CCTV Coverage Check -->
        <div class="wizard-step" id="step-3-container" style="display: none;">
          <div style="margin-bottom: 20px;">
            <div style="font-size: 0.875rem; color: #475569; margin-bottom: 16px;">
              Based on your selected location and incident date/time, SENTINEL evaluates overlapping fictional campus cameras. You can select cameras to request footage preservation.
            </div>
            <div id="cctv-results-mount"></div>
          </div>

          <div style="display: flex; justify-content: space-between; margin-top: 24px;">
            <button type="button" class="btn btn-secondary" id="btn-back-step-2">
              Back to Voice & Evidence
            </button>
            <button type="button" class="btn btn-primary" id="btn-goto-step-4">
              Review and Confirm ${icon('arrowRight', '', 16)}
            </button>
          </div>
        </div>

        <!-- STEP 4: Review and Submit -->
        <div class="wizard-step" id="step-4-container" style="display: none;">
          <div style="background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
            <h3 style="font-size: 1rem; font-weight: 700; margin-bottom: 16px; color: #0F172A;">Complaint Summary Review</h3>
            
            <div style="display: grid; grid-template-columns: 140px 1fr; row-gap: 12px; font-size: 0.875rem;">
              <span style="color: #64748B;">Category:</span>
              <strong id="rev-category">—</strong>

              <span style="color: #64748B;">Incident Time:</span>
              <strong id="rev-time">—</strong>

              <span style="color: #64748B;">Campus Area:</span>
              <strong id="rev-location">—</strong>

              <span style="color: #64748B;">Urgency:</span>
              <span id="rev-urgency">—</span>

              <span style="color: #64748B;">Audio Attached:</span>
              <span id="rev-audio">—</span>

              <span style="color: #64748B;">Evidence Files:</span>
              <span id="rev-files">—</span>

              <span style="color: #64748B;">CCTV Request:</span>
              <span id="rev-cctv">—</span>
            </div>
          </div>

          <!-- Confirmation Checkbox -->
          <div style="display: flex; align-items: flex-start; gap: 10px; margin-bottom: 24px;">
            <input type="checkbox" id="comp-confirm-check" style="width: 18px; height: 18px; margin-top: 2px; cursor: pointer;">
            <label for="comp-confirm-check" style="font-size: 0.8125rem; color: #475569; cursor: pointer;">
              I certify that this complaint is submitted in good faith regarding campus safety. I understand that my identity is protected under university reporting policies, and that no automated speech-to-text transcription is produced from my voice testimony.
            </label>
          </div>

          <div style="display: flex; justify-content: space-between;">
            <button type="button" class="btn btn-secondary" id="btn-back-step-3">
              Back to CCTV
            </button>
            <button type="button" class="btn btn-primary" id="btn-final-submit" style="padding: 12px 28px;">
              ${icon('shield', '', 18)} Submit Complaint to SENTINEL
            </button>
          </div>
        </div>
      </div>

      <!-- Submission Success Card (Populated after successful submit) -->
      <div class="card" id="success-card" style="display: none; text-align: center; padding: 40px 24px;">
        <div style="width: 56px; height: 56px; border-radius: 50%; background: #ECFDF5; color: #059669; display: inline-flex; align-items: center; justify-content: center; margin-bottom: 16px;">
          ${icon('check', '', 32)}
        </div>
        <h2 style="font-size: 1.5rem; font-weight: 700; color: #0F172A; margin-bottom: 8px;">Complaint Submitted Successfully</h2>
        <p style="font-size: 0.875rem; color: #64748B; max-width: 500px; margin: 0 auto 24px;">
          Your incident report has been securely registered in SENTINEL and routed to authorized campus safety administration.
        </p>

        <!-- Case ID & Timestamps Box -->
        <div style="background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 12px; padding: 20px; max-width: 520px; margin: 0 auto 24px; text-align: left;">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; border-bottom: 1px solid #E2E8F0; padding-bottom: 8px;">
            <span style="font-size: 0.75rem; color: #64748B; text-transform: uppercase; font-weight: 600;">Confidential Case Reference:</span>
            <span id="succ-case-ref" class="tabular-nums" style="font-size: 1.125rem; font-weight: 800; color: #0F172A;">—</span>
          </div>
          <div style="font-size: 0.8125rem; color: #475569; display: flex; flex-direction: column; gap: 6px;">
            <div><strong>Incident Time:</strong> <span id="succ-incident-time" class="tabular-nums">—</span></div>
            <div><strong>Submitted Time:</strong> <span id="succ-submitted-time" class="tabular-nums">—</span></div>
            <div><strong>Initial Review Stage:</strong> <span id="succ-assigned-level">—</span></div>
          </div>
        </div>

        <div style="display: flex; align-items: center; justify-content: center; gap: 14px; flex-wrap: wrap;">
          <button type="button" id="btn-open-wa-demo" class="btn btn-primary" style="background: #25D366; color: #FFFFFF;">
            ${icon('whatsapp', '', 18)} Open WhatsApp Notification
          </button>
          <a href="#/dashboard" class="btn btn-secondary" id="btn-goto-tracking">
            Go to My Cases Dashboard
          </a>
        </div>
      </div>
    </div>
  `;
}

export async function bindComplaintWizardEvents(container, router, params = {}) {
  // 1. Load locations
  const locSelect = container.querySelector('#comp-location');
  let locationsData = [];
  try {
    const res = await api.get('/api/meta/locations');
    locationsData = res.locations || [];
    locSelect.innerHTML = locationsData.map(l => `<option value="${l.id}">${l.name} (${l.building} - Zone ${l.zone})</option>`).join('');
  } catch {
    locSelect.innerHTML = '<option value="1">Main Library Ground Floor (Zone North)</option>';
  }

  // Set default datetime to now in local format
  const dtInput = container.querySelector('#comp-datetime');
  const nowLocal = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  dtInput.value = nowLocal;

  // Initialize submission token
  const submissionToken = `TOKEN-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;

  // State
  let currentStep = 1;
  let recordedAudio = null;
  let attachedFiles = [];
  let selectedCctvIds = [];

  // Mount Audio Recorder
  const audioMount = container.querySelector('#audio-recorder-mount');
  const audioRecorder = new AudioRecorderComponent({
    onRecorded: (data) => {
      recordedAudio = data;
      showToast('Voice complaint recorded and attached to form.', 'info');
    }
  });
  audioMount.appendChild(audioRecorder.render());

  // Mount CCTV Locator
  const cctvMount = container.querySelector('#cctv-results-mount');
  const cctvLocator = new CctvLocatorComponent({
    onSelectionChange: (ids) => {
      selectedCctvIds = ids;
    }
  });

  // Description character counter
  const descInput = container.querySelector('#comp-description');
  const descCounter = container.querySelector('#desc-char-count');
  descInput.addEventListener('input', () => {
    descCounter.textContent = `${descInput.value.length} chars`;
  });

  // File Dropzone
  const dropzone = container.querySelector('#evidence-dropzone');
  const fileInput = container.querySelector('#evidence-file-input');
  const filesListEl = container.querySelector('#selected-files-list');

  dropzone.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', (e) => {
    if (e.target.files) {
      for (const f of e.target.files) {
        attachedFiles.push(f);
      }
      renderFilesList();
    }
  });

  function renderFilesList() {
    if (attachedFiles.length === 0) {
      filesListEl.innerHTML = '';
      return;
    }
    filesListEl.innerHTML = attachedFiles.map((f, i) => `
      <div style="display: flex; align-items: center; justify-content: space-between; padding: 6px 12px; background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 6px; font-size: 0.8125rem; margin-bottom: 4px;">
        <span>${f.name} <span style="color: #64748B;">(${(f.size / (1024 * 1024)).toFixed(2)} MB)</span></span>
        <button type="button" class="btn btn-ghost btn-sm remove-file-btn" data-index="${i}" style="color: #EF4444; padding: 2px 6px;">&times;</button>
      </div>
    `).join('');

    filesListEl.querySelectorAll('.remove-file-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.dataset.index, 10);
        attachedFiles.splice(idx, 1);
        renderFilesList();
      });
    });
  }

  // Stepper navigation
  function setStep(stepNum) {
    currentStep = stepNum;
    for (let i = 1; i <= 4; i++) {
      container.querySelector(`#step-${i}-container`).style.display = (i === stepNum) ? 'block' : 'none';
      const stepItem = container.querySelector(`.step-item[data-step="${i}"]`);
      if (i < stepNum) {
        stepItem.className = 'step-item completed';
      } else if (i === stepNum) {
        stepItem.className = 'step-item active';
      } else {
        stepItem.className = 'step-item';
      }
    }
  }

  // Step 1 -> 2
  container.querySelector('#btn-goto-step-2').addEventListener('click', () => {
    if (!dtInput.value) {
      showToast('Please specify the incident date and time', 'warning');
      dtInput.focus();
      return;
    }
    setStep(2);
  });

  container.querySelector('#btn-back-step-1').addEventListener('click', () => setStep(1));

  // Step 2 -> 3
  container.querySelector('#btn-goto-step-3').addEventListener('click', () => {
    const desc = descInput.value.trim();
    if (!recordedAudio && desc.length < 20) {
      showToast('Please record an audio complaint OR enter a written description (min 20 characters).', 'warning');
      descInput.focus();
      return;
    }
    // Query CCTV for selected location
    const locId = locSelect.value;
    const timeVal = dtInput.value;
    cctvLocator.queryCameras(locId, timeVal, cctvMount);
    setStep(3);
  });

  container.querySelector('#btn-back-step-2').addEventListener('click', () => setStep(2));

  // Step 3 -> 4
  container.querySelector('#btn-goto-step-4').addEventListener('click', () => {
    // Populate review summary
    const selectedLoc = locationsData.find(l => l.id === Number(locSelect.value));
    container.querySelector('#rev-category').textContent = container.querySelector('#comp-category').value;
    container.querySelector('#rev-time').textContent = new Date(dtInput.value).toLocaleString('en-GB');
    container.querySelector('#rev-location').textContent = selectedLoc ? `${selectedLoc.name} (${selectedLoc.building})` : 'Designated Campus Area';
    container.querySelector('#rev-urgency').innerHTML = container.querySelector('#comp-urgent').checked
      ? '<span class="badge badge-urgent">URGENT - Immediate Attention Flag</span>'
      : 'Standard Review Priority';
    container.querySelector('#rev-audio').innerHTML = recordedAudio
      ? `<span class="badge badge-success">✓ Attached (${recordedAudio.language || 'Spoken'} Testimony)</span>`
      : '<span style="color: #64748B;">None (Written description provided)</span>';
    container.querySelector('#rev-files').textContent = attachedFiles.length > 0 ? `${attachedFiles.length} file(s) attached` : 'None';
    container.querySelector('#rev-cctv').textContent = selectedCctvIds.length > 0 ? `${selectedCctvIds.length} camera(s) flagged for preservation` : 'None requested';
    setStep(4);
  });

  container.querySelector('#btn-back-step-3').addEventListener('click', () => setStep(3));

  // DEMO PREFILL PRESETS (Judge helper for instant testing!)
  const prefillBtns = container.querySelectorAll('.prefill-btn');
  prefillBtns.forEach(b => {
    b.addEventListener('click', () => {
      const p = b.dataset.preset;
      const hostelLoc = locationsData.find(l => l.name.includes('Hostel'))?.id || locSelect.value;
      const libLoc = locationsData.find(l => l.name.includes('Library'))?.id || locSelect.value;

      if (p === 'caseA') {
        container.querySelector('#comp-category').value = 'Ragging';
        locSelect.value = hostelLoc;
        container.querySelector('#comp-location-detail').value = 'Hostel Block 3 2nd Floor Corridor Wing B';
        container.querySelector('#comp-urgent').checked = true;
        descInput.value = 'Senior residents surrounded me outside Wing B corridor, blocked exit and demanded forced tasks with severe ragging threats.';
        container.querySelector('#comp-suspect').value = 'Group of 3 seniors in dark hoodies from hostel 3';
        showToast('Demo Preset A loaded: Hostel Ragging incident (Urgent pathway).', 'info');
      } else if (p === 'caseB') {
        container.querySelector('#comp-category').value = 'Ragging';
        locSelect.value = hostelLoc;
        container.querySelector('#comp-location-detail').value = 'Hostel Block 3 Stairwell';
        container.querySelector('#comp-urgent').checked = false;
        descInput.value = 'Same group of senior students confronted me near Hostel Block 3 stairs with intimidation and ragging demands.';
        container.querySelector('#comp-suspect').value = 'Group of 3 seniors in dark hoodies from hostel 3';
        showToast('Demo Preset B loaded: Related report that will trigger relationship score >= 50.', 'info');
      } else if (p === 'caseC') {
        container.querySelector('#comp-category').value = 'Ragging';
        locSelect.value = hostelLoc;
        container.querySelector('#comp-location-detail').value = 'Hostel Block 3 Common Mess Entrance';
        container.querySelector('#comp-urgent').checked = false;
        descInput.value = 'Third ragging intimidation incident near Hostel Block 3 entry by same senior individuals.';
        container.querySelector('#comp-suspect').value = 'Group of 3 seniors in dark hoodies from hostel 3';
        showToast('Demo Preset C loaded: Third related report that triggers Higher Authority escalation.', 'info');
      } else if (p === 'caseD') {
        container.querySelector('#comp-category').value = 'Other';
        locSelect.value = libLoc;
        container.querySelector('#comp-location-detail').value = 'Main Library Ground Floor Cubicles';
        container.querySelector('#comp-urgent').checked = false;
        descInput.value = 'Excessive noise disturbance and dispute over study room reservation near library front desk.';
        container.querySelector('#comp-suspect').value = 'Unknown library patron';
        showToast('Demo Preset D loaded: Unrelated library report.', 'info');
      }
      descCounter.textContent = `${descInput.value.length} chars`;
    });
  });

  // SUBMIT COMPLAINT
  const btnSubmit = container.querySelector('#btn-final-submit');
  btnSubmit.addEventListener('click', async () => {
    const isConfirmed = container.querySelector('#comp-confirm-check').checked;
    if (!isConfirmed) {
      showToast('Please check the confirmation box acknowledging report terms.', 'warning');
      return;
    }

    btnSubmit.disabled = true;
    btnSubmit.textContent = 'Submitting report to SENTINEL...';

    const payload = {
      category: container.querySelector('#comp-category').value,
      incident_at: new Date(dtInput.value).toISOString(),
      campus_location_id: parseInt(locSelect.value, 10),
      location_detail: container.querySelector('#comp-location-detail').value.trim(),
      description: descInput.value.trim(),
      suspect_details: container.querySelector('#comp-suspect').value.trim(),
      witness_details: container.querySelector('#comp-witness').value.trim(),
      urgent: container.querySelector('#comp-urgent').checked,
      privacy_mode: container.querySelector('input[name="privacy_mode"]:checked').value,
      preferred_language: recordedAudio?.language || 'English',
      submission_token: submissionToken
    };

    try {
      // 1. Submit Case
      const caseRes = await api.post('/api/cases', payload);
      const newCase = caseRes.case;

      // 2. Upload Audio if recorded
      if (recordedAudio && recordedAudio.blob) {
        const audioFormData = new FormData();
        audioFormData.append('audio', recordedAudio.blob, 'complaint-recording.webm');
        audioFormData.append('preferred_language', recordedAudio.language || 'English');
        audioFormData.append('recorded_or_uploaded', recordedAudio.type || 'recorded');
        audioFormData.append('duration_seconds', recordedAudio.durationSeconds || 0);

        try {
          await api.upload(`/api/cases/${newCase.id}/audio`, audioFormData);
        } catch (audioErr) {
          console.warn('Audio attach note:', audioErr.message);
        }
      }

      // 3. Upload Evidence files if any
      for (const file of attachedFiles) {
        const evFormData = new FormData();
        evFormData.append('file', file);
        try {
          await api.upload(`/api/cases/${newCase.id}/evidence`, evFormData);
        } catch (evErr) {
          console.warn('Evidence upload note:', evErr.message);
        }
      }

      // 4. Submit CCTV Preservation Request if cameras selected
      if (selectedCctvIds.length > 0) {
        try {
          await api.post('/api/cctv/requests', {
            case_id: newCase.id,
            camera_ids: selectedCctvIds
          });
        } catch (cctvErr) {
          console.warn('CCTV request note:', cctvErr.message);
        }
      }

      // Hide wizard, show success screen
      container.querySelector('#complaint-card').style.display = 'none';
      const successCard = container.querySelector('#success-card');
      successCard.style.display = 'block';

      container.querySelector('#succ-case-ref').textContent = newCase.case_ref;
      container.querySelector('#succ-incident-time').textContent = new Date(newCase.incident_at).toLocaleString('en-GB') + ' (Asia/Kolkata)';
      container.querySelector('#succ-submitted-time').textContent = new Date(newCase.submitted_at || newCase.created_at).toLocaleString('en-GB') + ' (Asia/Kolkata)';
      container.querySelector('#succ-assigned-level').textContent = `${newCase.assigned_level} Review Stage`;

      // Bind WhatsApp button on success card
      const btnWa = container.querySelector('#btn-open-wa-demo');
      btnWa.addEventListener('click', () => {
        openWhatsAppNotificationModal(newCase.id, { level: 'minimal' });
      });

      // Update link for tracking button
      container.querySelector('#btn-goto-tracking').href = `#/cases/${newCase.case_ref}`;

      showToast('Complaint successfully recorded in SENTINEL!', 'success');

    } catch (err) {
      showToast(err.message, 'error');
      btnSubmit.disabled = false;
      btnSubmit.textContent = 'Submit Complaint to SENTINEL';
    }
  });
}
