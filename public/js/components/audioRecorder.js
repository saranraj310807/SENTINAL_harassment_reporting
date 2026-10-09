import { icon } from './icons.js';
import { showToast } from './toast.js';

export class AudioRecorderComponent {
  constructor(options = {}) {
    this.container = options.container || null;
    this.onRecorded = options.onRecorded || (() => {});
    this.mediaRecorder = null;
    this.mediaStream = null;
    this.audioChunks = [];
    this.audioBlob = null;
    this.audioUrl = null;
    this.audioElement = null;
    this.state = 'idle'; // idle | requesting | recording | paused | recorded | error
    this.timerInterval = null;
    this.durationSeconds = 0;
    this.preferredLanguage = options.defaultLanguage || 'Tamil';
    this.audioContext = null;
    this.analyser = null;
    this.animFrame = null;
  }

  getBestMimeType() {
    const types = [
      'audio/mp4',
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus',
      'audio/wav'
    ];
    for (const t of types) {
      if (window.MediaRecorder && MediaRecorder.isTypeSupported(t)) {
        return t;
      }
    }
    return '';
  }

  render() {
    const el = document.createElement('div');
    el.className = 'audio-recorder-card';
    el.innerHTML = `
      <div class="recorder-header">
        <div class="recorder-title">
          ${icon('mic', 'text-teal', 20)}
          <span>Direct Audio Complaint (No Transcription)</span>
        </div>
        <div style="display: flex; align-items: center; gap: 8px;">
          <label for="recorder-lang-select" style="font-size: 0.75rem; color: #94A3B8;">Spoken Language:</label>
          <select id="recorder-lang-select" class="form-control" style="width: auto; padding: 4px 8px; font-size: 0.75rem; background: #141C3D; color: #FFFFFF; border-color: #1E2958; min-height: 32px;">
            <option value="Tamil" ${this.preferredLanguage === 'Tamil' ? 'selected' : ''}>Tamil (தமிழ்)</option>
            <option value="English" ${this.preferredLanguage === 'English' ? 'selected' : ''}>English</option>
            <option value="Hindi" ${this.preferredLanguage === 'Hindi' ? 'selected' : ''}>Hindi (हिंदी)</option>
            <option value="Telugu" ${this.preferredLanguage === 'Telugu' ? 'selected' : ''}>Telugu (తెలుగు)</option>
            <option value="Malayalam" ${this.preferredLanguage === 'Malayalam' ? 'selected' : ''}>Malayalam (മലയാളം)</option>
            <option value="Kannada" ${this.preferredLanguage === 'Kannada' ? 'selected' : ''}>Kannada (ಕನ್ನಡ)</option>
            <option value="Other">Other Language</option>
          </select>
        </div>
      </div>

      <!-- Live Meter & Timer Box -->
      <div class="recorder-meter-container" aria-live="polite">
        <div class="recorder-status-bar">
          <div id="recorder-status-indicator">
            <span style="color: #94A3B8;">Ready to record</span>
          </div>
          <div style="font-size: 1.125rem; font-weight: 700; color: #FFFFFF;" class="tabular-nums" id="recorder-timer">
            00:00
          </div>
        </div>

        <div class="audio-level-visualizer" id="recorder-level-meter" aria-hidden="true">
          ${Array.from({ length: 24 }).map(() => '<div class="audio-bar"></div>').join('')}
        </div>

        <!-- Playback Audio Element -->
        <div id="playback-preview-box" style="display: none; margin-top: 8px;">
          <audio id="recorder-audio-playback" controls style="width: 100%; height: 38px; border-radius: 4px; outline: none;"></audio>
        </div>
      </div>

      <!-- Action Controls -->
      <div class="recorder-controls">
        <button type="button" id="btn-start-record" class="btn btn-primary">
          ${icon('mic', '', 16)} Start Recording
        </button>
        <button type="button" id="btn-pause-record" class="btn btn-secondary" style="display: none;">
          ${icon('pause', '', 16)} Pause
        </button>
        <button type="button" id="btn-resume-record" class="btn btn-secondary" style="display: none;">
          ${icon('play', '', 16)} Resume
        </button>
        <button type="button" id="btn-stop-record" class="btn btn-danger" style="display: none;">
          ${icon('square', '', 16)} Stop Recording
        </button>
        <button type="button" id="btn-rerecord" class="btn btn-ghost" style="display: none; color: #EF4444;">
          ${icon('refresh', '', 16)} Re-record
        </button>

        <span style="font-size: 0.8125rem; color: #64748B; margin: 0 8px;">— or —</span>

        <label class="btn btn-secondary" style="cursor: pointer; margin-bottom: 0;">
          ${icon('file', '', 16)} Upload Audio File
          <input type="file" id="audio-file-input" accept="audio/*,video/webm,video/mp4" style="display: none;">
        </label>
      </div>

      <!-- Plain Confidentiality and Access Notice -->
      <div class="no-transcript-notice">
        ${icon('lock', '', 20)}
        <div>
          <strong>Confidential Audio Guarantee & Access Notice:</strong><br>
          SENTINEL never converts speech to text or runs automated transcription. Your original recording is encrypted and accessible strictly by authorized review authorities (Assigned HOD / Dean / Higher Authority). Every playback access is permanently logged in the audit ledger.
        </div>
      </div>
    `;

    this.bindEvents(el);
    return el;
  }

  bindEvents(el) {
    const langSelect = el.querySelector('#recorder-lang-select');
    langSelect.addEventListener('change', (e) => {
      this.preferredLanguage = e.target.value;
    });

    const btnStart = el.querySelector('#btn-start-record');
    const btnPause = el.querySelector('#btn-pause-record');
    const btnResume = el.querySelector('#btn-resume-record');
    const btnStop = el.querySelector('#btn-stop-record');
    const btnReRecord = el.querySelector('#btn-rerecord');
    const fileInput = el.querySelector('#audio-file-input');
    const statusText = el.querySelector('#recorder-status-indicator');
    const timerText = el.querySelector('#recorder-timer');
    const previewBox = el.querySelector('#playback-preview-box');
    const playbackAudio = el.querySelector('#recorder-audio-playback');
    const meterBars = el.querySelectorAll('.audio-bar');

    btnStart.addEventListener('click', async () => {
      try {
        statusText.innerHTML = '<span style="color: #38BDF8;">Requesting microphone access...</span>';
        this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        
        const mimeType = this.getBestMimeType();
        this.mediaRecorder = mimeType 
          ? new MediaRecorder(this.mediaStream, { mimeType }) 
          : new MediaRecorder(this.mediaStream);

        this.audioChunks = [];
        this.mediaRecorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) this.audioChunks.push(e.data);
        };

        this.mediaRecorder.onstop = () => {
          this.audioBlob = new Blob(this.audioChunks, { type: this.mediaRecorder.mimeType || 'audio/webm' });
          this.audioUrl = URL.createObjectURL(this.audioBlob);
          playbackAudio.src = this.audioUrl;
          previewBox.style.display = 'block';

          this.state = 'recorded';
          statusText.innerHTML = `<span style="color: #34D399;">✓ Recording complete (${(this.audioBlob.size / (1024 * 1024)).toFixed(2)} MB)</span>`;
          btnStart.style.display = 'none';
          btnPause.style.display = 'none';
          btnResume.style.display = 'none';
          btnStop.style.display = 'none';
          btnReRecord.style.display = 'inline-flex';

          this.stopAudioContext();
          this.stopStreamTracks();
          this.stopTimer();

          this.onRecorded({
            blob: this.audioBlob,
            durationSeconds: this.durationSeconds,
            language: this.preferredLanguage,
            type: 'recorded',
            mime: this.mediaRecorder.mimeType
          });
        };

        this.mediaRecorder.start(250); // slice every 250ms
        this.state = 'recording';
        this.startTimer(timerText);
        this.startAudioContext(this.mediaStream, meterBars);

        statusText.innerHTML = '<span class="recording-indicator"><span class="recording-dot"></span> Recording in progress...</span>';
        btnStart.style.display = 'none';
        btnPause.style.display = 'inline-flex';
        btnStop.style.display = 'inline-flex';
      } catch (err) {
        statusText.innerHTML = '<span style="color: #EF4444;">Microphone access denied or unavailable. Use file upload below.</span>';
        showToast('Microphone access denied or insecure context. You can upload an audio file.', 'warning');
      }
    });

    btnPause.addEventListener('click', () => {
      if (this.mediaRecorder && this.state === 'recording') {
        this.mediaRecorder.pause();
        this.state = 'paused';
        statusText.innerHTML = '<span style="color: #FBBF24;">Recording paused</span>';
        btnPause.style.display = 'none';
        btnResume.style.display = 'inline-flex';
        clearInterval(this.timerInterval);
      }
    });

    btnResume.addEventListener('click', () => {
      if (this.mediaRecorder && this.state === 'paused') {
        this.mediaRecorder.resume();
        this.state = 'recording';
        statusText.innerHTML = '<span class="recording-indicator"><span class="recording-dot"></span> Recording in progress...</span>';
        btnResume.style.display = 'none';
        btnPause.style.display = 'inline-flex';
        this.startTimer(timerText, false);
      }
    });

    btnStop.addEventListener('click', () => {
      if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
        this.mediaRecorder.stop();
      }
    });

    btnReRecord.addEventListener('click', () => {
      if (confirm('Discard current recording and record again?')) {
        this.resetRecorder();
        previewBox.style.display = 'none';
        statusText.innerHTML = '<span style="color: #94A3B8;">Ready to record</span>';
        timerText.textContent = '00:00';
        btnStart.style.display = 'inline-flex';
        btnReRecord.style.display = 'none';
      }
    });

    fileInput.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (!file) return;

      this.audioBlob = file;
      this.audioUrl = URL.createObjectURL(file);
      playbackAudio.src = this.audioUrl;
      previewBox.style.display = 'block';

      statusText.innerHTML = `<span style="color: #34D399;">✓ File uploaded: ${file.name} (${(file.size / (1024 * 1024)).toFixed(2)} MB)</span>`;
      btnStart.style.display = 'none';
      btnPause.style.display = 'none';
      btnResume.style.display = 'none';
      btnStop.style.display = 'none';
      btnReRecord.style.display = 'inline-flex';

      this.onRecorded({
        blob: file,
        durationSeconds: 0,
        language: this.preferredLanguage,
        type: 'uploaded',
        mime: file.type
      });
    });
  }

  startTimer(displayEl, reset = true) {
    if (reset) this.durationSeconds = 0;
    this.timerInterval = setInterval(() => {
      this.durationSeconds++;
      const mins = String(Math.floor(this.durationSeconds / 60)).padStart(2, '0');
      const secs = String(this.durationSeconds % 60).padStart(2, '0');
      displayEl.textContent = `${mins}:${secs}`;
    }, 1000);
  }

  stopTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  startAudioContext(stream, bars) {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      this.audioContext = new AudioCtx();
      const source = this.audioContext.createMediaStreamSource(stream);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 64;
      source.connect(this.analyser);

      const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
      const updateBars = () => {
        if (!this.analyser || this.state !== 'recording') return;
        this.analyser.getByteFrequencyData(dataArray);
        bars.forEach((bar, idx) => {
          const val = dataArray[idx % dataArray.length] || 0;
          const h = Math.max(4, Math.min(22, (val / 255) * 22));
          bar.style.height = `${h}px`;
        });
        this.animFrame = requestAnimationFrame(updateBars);
      };
      updateBars();
    } catch {}
  }

  stopAudioContext() {
    if (this.animFrame) cancelAnimationFrame(this.animFrame);
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close().catch(() => {});
    }
  }

  stopStreamTracks() {
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }
  }

  resetRecorder() {
    this.stopAudioContext();
    this.stopStreamTracks();
    this.stopTimer();
    this.audioChunks = [];
    this.audioBlob = null;
    if (this.audioUrl) URL.revokeObjectURL(this.audioUrl);
    this.audioUrl = null;
    this.state = 'idle';
    this.durationSeconds = 0;
  }
}
