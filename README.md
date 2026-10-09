# SENTINEL
> **"Your Safety. Your Identity. Your Control."**
> *Official Campus Safety & Harassment Reporting System — HackVerse Web Development Challenge Prototype*

[![Automated Test Suite](https://img.shields.io/badge/Node%20Test%20Suite-20%2F20%20Passing-10b981)](#how-to-run-tests)
[![Zero Build Step](https://img.shields.io/badge/Frontend-Vanilla%20ES%20Modules-06b6d4)](#frontend-architecture)
[![Private Audio](https://img.shields.io/badge/Audio-No%20Transcription%20Guarantee-8b7cff)](#direct-audio-complaint-no-transcription)

---

## 1. Project Overview

**SENTINEL** is a full-stack campus safety and harassment reporting platform engineered for university campuses. It enables students to report online and offline ragging, harassment, bullying, stalking, and intimidation through either **detailed written complaints** OR **direct audio testimony**, complete with digital evidence uploads, CCTV footage review requests, case tracking timelines, role-based dashboards (Student, HOD, Dean, Higher Authority), transparent rule-based related-incident pattern review, and click-to-chat WhatsApp notification dispatch.

> **Demonstration Notice:** Everything displayed in this application uses **synthetic fictional demonstration data** (students, cameras, complaints, and evidence). SENTINEL is clearly labeled as a hackathon prototype. It does not access real CCTV camera feeds or claim automated delivery proof.

---

## 2. Technology Decisions & Architecture

| Layer | Selected Technology | Architecture Rationale |
| :--- | :--- | :--- |
| **Runtime** | Node.js 20+ (Node 24 LTS verified) | High-performance asynchronous runtime with native test runner (`node:test`). |
| **Web Server** | Express 4.x with Helmet & Rate-Limiting | Minimalistic, battle-tested HTTP layer with strict CSP and compression. |
| **Database** | SQLite with Foreign Keys ON & WAL Mode | Universal database layer supporting both `better-sqlite3` and native `node:sqlite` (`DatabaseSync`). |
| **Migrations** | Plain SQL files in `/server/migrations` | Applied automatically on startup with transaction safety and version tracking. |
| **Frontend** | Vanilla JS ES Modules & CSS Tokens | **Zero build step, zero CDN dependencies**. Works 100% offline on a laptop without internet access. |
| **Audio** | Native `MediaRecorder` + HTTP Range streaming | Encrypted private storage. **Strictly NO speech-to-text, translation, or AI transcription**. |
| **Auth** | Server-side sessions in SQLite + `bcrypt` | `httpOnly`, `SameSite=Lax`, fixation regeneration, brute-force lockout, CSRF protection. |
| **Storage** | Abstract `StorageAdapter` to `./storage` | Private UUID filenames outside public web root, magic-byte inspection, SHA-256 integrity. |

### Documented Path to PostgreSQL
For enterprise deployments transitioning to PostgreSQL:
1. Replace `/server/db/index.js` with `pg` pool or `knex`/`slonik`.
2. Schema types map directly: SQLite `TEXT` -> Postgres `VARCHAR`/`TEXT`, `INTEGER` -> `INTEGER`/`BIGINT`, `REAL` -> `NUMERIC`.
3. SQLite WAL mode translates to Postgres standard MVCC with WAL.
4. Replace `sqlite_sequence` with standard Postgres `SERIAL` / `IDENTITY`.

---

## 3. Quick Start & Installation

Install dependencies, run migrations, seed fictional demo data, and launch with one command:

```bash
npm install && npm run migrate && npm run seed && npm start
```

### Development Mode
```bash
npm run dev
```

### Running Automated Tests
```bash
npm test
```

### Creating Snapshot Backups
```bash
npm run backup
```

### Local Network & Phone Access
SENTINEL binds to `0.0.0.0:3000` so mobile phones on the same Wi-Fi can connect directly:
1. Find your laptop's local IP address (e.g., `192.168.1.5` via `ipconfig` or `ifconfig`).
2. On your phone, visit: `http://192.168.1.5:3000/`.
3. **Microphone Access Notice on Mobile:** Mobile browsers require a secure origin (`HTTPS` or `localhost`) to grant microphone access. For mobile testing:
   - Use Android Chrome remote debugging port forwarding (`chrome://inspect`) to forward `localhost:3000` to your mobile phone; OR
   - Run a local TLS tunnel (e.g., `mkcert` or `cloudflared tunnel --url http://localhost:3000`); OR
   - Use the built-in **"Upload Audio File"** fallback button on the recorder which works over any HTTP network.

---

## 4. Fictional Demo Accounts

All fictional demonstration accounts share the demo password:
```
Password: SentinelDemo2026!
```

| Role | Name | Email | Jurisdiction / Scope |
| :--- | :--- | :--- | :--- |
| **Student (CSE)** | Priya Sharma | `priya.sharma@campus.edu` | SIF: `SIF202601`, 3rd Year, Sec A, CSE |
| **Student (ECE)** | Rahul Varma | `rahul.varma@campus.edu` | SIF: `SIF202602`, 2nd Year, Sec B, ECE |
| **Student (Mech)** | Ananya Sen | `ananya.sen@campus.edu` | SIF: `SIF202603`, 1st Year, Sec C, MECH |
| **HOD (CSE)** | Dr. K. Ramanathan | `hod.cse@campus.edu` | Computer Science & Engineering Department |
| **HOD (ECE)** | Dr. Meenakshi Sundaram | `hod.ece@campus.edu` | Electronics & Communication Department |
| **Dean** | Dr. Aruna Swaminathan | `dean.studentaffairs@campus.edu` | Dean of Student Affairs (Campus-wide) |
| **Higher Authority** | Prof. V. Rajagopal | `director.safety@campus.edu` | Director of Campus Safety |

*Quick Evaluation Shortcut:* A **"Quick Demo Switch"** dropdown appears at the top banner of every page for 1-click switching between accounts.

---

## 5. Non-Negotiable Honesty and Safety Rules

1. **Persistent Emergency Disclaimer:** SENTINEL is an administrative reporting system, **not an emergency service**. Prominent banners direct students in imminent physical danger to Campus Security (`044-2257-8888`) or National Emergency (`112`).
2. **Transparent Rule-Based Heuristics (NO AI Claims):** Incident similarity scoring is computed using transparent arithmetic heuristics (Jaccard keyword overlap, location zones, time recency). It is explicitly labelled: *"A match is a prompt for human review, not evidence of wrongdoing."*
3. **No Fake Delivery Confirmations:** Opening WhatsApp click-to-chat transitions states honestly: `prepared` -> `opened` -> `awaiting_manual_send`. The status `delivery_confirmed` is reserved for future genuine Business API webhooks and is **never** fabricated.
4. **No Fake CCTV Feeds:** Camera locator outputs coverage analysis and retention calculations based on synthetic schedule records (`is_fictional=true`). It does not stream live feeds or identify persons.
5. **Enforced Server-Side Authorization:** Every route enforces object-level RBAC and ownership. Hidden UI buttons are never treated as a security control.

---

## 6. Direct Audio Complaint (No Transcription Guarantee)

SENTINEL guarantees complete confidential voice reporting:
- **Zero Speech-to-Text:** No automated transcription, translation, or speech-to-text libraries exist anywhere in the backend or database schema.
- **Table Integrity:** The `audio_complaints` table strictly lacks `transcript` or `translation` columns.
- **MediaRecorder API:** Captures high-fidelity Opus WebM / MP4 audio with live audio level meters and duration timers.
- **File Upload Fallback:** Students can upload existing recordings (`mp3`, `wav`, `m4a`, `ogg`, `webm`) validated via magic bytes.
- **Language Metadata:** Preferred language selector (Tamil, English, Hindi, Telugu, Malayalam, Kannada, Other) serves as reviewer metadata only.
- **Range Request Streaming:** Audio is streamed via `GET /api/cases/:id/audio` supporting HTTP Range headers (`206 Partial Content`) for seeking.
- **Immutable Playback Audit:** Every playback by an authority is permanently logged in the audit ledger.

---

## 7. Transparent Relationship Review & Escalation Engine

SENTINEL implements pure, testable relationship scoring (`/server/engine/escalation.js`):

### Scoring Matrix (Default Threshold: 50 / 100)
- **Same Incident Category:** `+30 points`
- **Same Location / Security Zone:** `+25 points`
- **Recency within 14 Days:** `+15 points` *(within 30 days: `+8 points`)*
- **Same Time-of-Day Window (Morning/Afternoon/Evening/Night):** `+10 points`
- **Suspect Descriptor Overlap (Jaccard >= 0.3 after stop-word removal):** `+20 points`
- **Shared Suspect Name or Department:** Capped at at most `+5 points total` *(safeguard: name alone can never trigger a match)*

### Escalation Level Promotion Rules
- **Count = 1:** Assigned to departmental **HOD**.
- **Count = 2 (Confirmed Related Incidents):** Promoted to **Dean of Student Affairs**.
- **Count >= 3 (Confirmed Related Incidents):** Promoted to **Higher Authority (Director of Campus Safety)**.
- **Invariants:**
  - Potential links never increment repeat counts until an authorized official reviews and confirms with a mandatory note.
  - Escalation **never downgrades** even if cases are later closed.
  - Re-evaluating or re-confirming is **idempotent**.
  - **Urgent Pathway:** Flagging a case urgent bypasses batch review and immediately routes the case to the Dean's priority queue without distorting repeat counts.

---

## 8. WhatsApp Notification Dispatch & Audio Sharing Module

Module located at `/server/notifications/whatsapp.js`:
- **Configured Recipient:** Raw input `WHATSAPP_RECIPIENT_RAW=7708704229`.
- **E.164 Normalization:** Automatically normalized with country code `91` to `917708704229` when confirmed (`WHATSAPP_COUNTRY_CONFIRMED=true`). Strips punctuation, spaces, dashes, brackets, and leading `+` or `00`.
- **URL Generation:** Generates standard `https://wa.me/917708704229?text=...` with line breaks encoded as `%0A` and Unicode Tamil text safely preserved without character corruption.
- **Message Content & Clean Plain Text:**
  - **Extended Level (Default for Demo):** Configured via `WHATSAPP_INCLUDE_DETAILS=true`. Formats Student Name, Department, SIF Number, Programme, Year and Section, Incident Category, short description, Audio Available (Yes/No), Evidence Available (Yes/No), Current Status.
  - **Zero Emojis Guarantee:** All emojis and special symbols have been completely eliminated from notification text. Standard UTF-8 plain text ensures 100% reliable cross-platform rendering across mobile and desktop.
  - **Separated Timestamps:** Explicitly separates *Incident Date/Time* from *Submission Date/Time*, both rendered in `CAMPUS_TIMEZONE` (`Asia/Kolkata`).
  - **Student Contact Phone Privacy:** The reporter's phone number is omitted by default and included ONLY if an explicit server setting `WHATSAPP_INCLUDE_PHONE=true` is activated.
  - **Localhost Link Suppression:** SENTINEL strictly forbids emitting `localhost` or insecure links into WhatsApp messages. Case and expiring audio links are included only when `APP_BASE_URL` is a verified public HTTPS URL.
  - **Audio Notice:** Explicitly informs recipients: *"The original audio is stored in SENTINEL. It is shared separately from the Share sheet or by the expiring link below when available."*

### Audio Playable in WhatsApp (Two Honest Methods)

#### Method A: Direct Voice File Sharing (Web Share API Level 2)
1. **In-Chat Audio Playback:** WhatsApp on Android and iOS supports playing voice files in-chat when shared as native `.m4a` / AAC or `.ogg` Opus files.
2. **Format Conversion Only (`ffmpeg-static`):** When audio is recorded, SENTINEL generates a derived share copy formatted as `.m4a` AAC. The original recording and its SHA-256 remain **100% bit-for-bit untouched**. SENTINEL never alters, trims, transcribes, or translates audio.
3. **Web Share API Workflow:**
   - Client fetches audio blob from authenticated endpoint (`/api/cases/:id/audio?share=1`).
   - Creates a `File` with mime `audio/mp4` and filename `SENTINEL-<caseId>.m4a`.
   - Verifies `navigator.canShare({ files: [file] })` and calls `navigator.share({ files: [file], text: messageText })`.
   - The user picks WhatsApp and the designated recipient contact (`+91 7708704229` displayed in the guidance instructions) and presses Send manually.
4. **Desktop Fallback:** On desktop browsers lacking Web Share file support, the button automatically hides, displays an informative notice, and offers a **"Download Audio for Manual Attachment"** button for staff.

#### Method B: Single-Purpose Expiring Audio Link
1. **Cryptographic Token:** Generates a 256-bit secure random token stored as a SHA-256 hash in `audio_links`. Plaintext tokens are never stored in the database.
2. **Configurable TTL & Playback Limits:** Default 24-hour expiration (`AUDIO_LINK_TTL_HOURS=24`) and maximum 5 plays (`AUDIO_LINK_MAX_PLAYS=5`).
3. **Zero-Knowledge Standalone Player (`/listen/:token`):**
   - Strictly isolated: **NO case details, student names, or categories** are visible on this page.
   - Security headers: `noindex, nofollow`, `Cache-Control: no-store, private`, and strict CSP (`default-src 'self'`).
   - HTTP Range streaming (`/listen/:token/stream`) with seeking support.
   - Every playback increments the play counter and is permanently logged in the audit ledger.
   - Authorities can instantly revoke links (`POST /api/cases/:id/audio-links/:linkId/revoke`), rendering them immediately 410 Gone.

### Honest Status Tracking
SENTINEL strictly tracks only verifiable local interaction states:
- `Message prepared`
- `WhatsApp opened`
- `Awaiting manual send`
- `Audio share sheet opened`
- `Audio link created`

> ⚠️ **Verification Notice:** SENTINEL never claims "delivered" or "sent". The system prominently displays: *"Opening WhatsApp or the share sheet does not prove the message or audio was sent, delivered, or read."*

---

## 9. Security & Role Matrix

| Endpoint / Resource | Student (Owner) | Student (Other) | HOD | Dean | Higher Authority |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **View Case Detail** | ✅ (Sanitized) | ❌ 403 IDOR | ✅ (Dept Scope) | ✅ All HOD/Dean | ✅ Full Access |
| **Listen to Private Audio** | ✅ Own case | ❌ 403 | ✅ (Dept Scope) | ✅ | ✅ |
| **Internal Confidential Notes** | ❌ Strictly Hidden | ❌ Strictly Hidden | ✅ Add / View | ✅ Add / View | ✅ Add / View |
| **Candidate Link Review Queue** | ❌ 403 | ❌ 403 | ✅ (Dept Scope) | ✅ | ✅ |
| **Update Case Status** | ❌ | ❌ | ✅ | ✅ | ✅ |
| **Escalation Policy Editor** | ❌ 403 | ❌ 403 | ❌ Read-Only | ❌ Read-Only | ✅ Edit & Save |
| **Audit Log Ledger** | ❌ 403 | ❌ 403 | ❌ 403 | ✅ | ✅ Full Audit |
| **Reset Demo Prototype Data** | ❌ 403 | ❌ 403 | ❌ 403 | ❌ 403 | ✅ (Requires Confirm) |

---

## 10. The 15-Step Live Demo Script

Follow this step-by-step sequence to demonstrate the entire platform:

1. **Step 1 — Landing Page:** Open `http://localhost:3000/`. Observe the emergency disclaimer banner, demonstration prototype label, and core safety framework.
2. **Step 2 — Student Sign In:** Click **"Student & Staff Login"** (or use the top quick-switcher). Click **"Priya Sharma (CSE 3rd Year)"** to log in as Priya.
3. **Step 3 — Student Profile:** Observe Priya's profile on the student dashboard: SIF `SIF202601`, B.Tech Computer Science, Year 3.
4. **Step 4 — New Complaint & Demo Preset A:** Click **"File New Complaint"**. At the top demo helper bar, click **"Preset A: Hostel Ragging (Urgent)"**. Notice fields populate: Category `Ragging`, Location `Hostel Block 3`, Urgent checked.
5. **Step 5 — Voice Testimony & No-Transcription Notice:** Click **"Continue to Voice & Evidence"**. Observe the Direct Audio Complaint card, language selector (Tamil), audio visualizer, and the plain-language guarantee: *"Zero automated transcription is applied."*
6. **Step 6 — CCTV Coverage Evaluation:** Click **"Continue to CCTV Coverage"**. Notice the locator evaluated fictional cameras `CAM-SO-01` and `CAM-SO-02` with retention windows and availability reasoning. Check camera `CAM-SO-01`.
7. **Step 7 — Review & Submit:** Click **"Review and Confirm"**. Check the terms checkbox and click **"Submit Complaint to SENTINEL"**. Receive unique Case ID (e.g. `SNT-261009-XXXXXXXX`). Notice Incident timestamp and Submission timestamp are recorded separately.
8. **Step 8 — WhatsApp Notification & Audio Sharing Dispatch:** Click **"Open WhatsApp Notification"**. Review the Extended message preview card (zero emojis, clean plain text) with recipient `+917708704229`. Notice the honest status tracker reads *"Message Prepared / Awaiting Manual Send"*, never *"Delivered"*. Test:
   - **Method A (Web Share):** Click **"Share Audio via WhatsApp (Web Share)"** on a mobile browser or view the desktop fallback with **"Download Audio for Manual Attachment"**.
   - **Method B (Expiring Link):** Click **"Generate Link"** to create a 24-hour single-purpose playback link with 5-play max limit.
   - Click **"Open WhatsApp (Text)"** to open `wa.me/917708704229` in a new tab; observe status updating to *"WhatsApp Opened / Awaiting Manual Send"*.
9. **Step 9 — HOD Investigation Workspace:** In the top quick-switcher, switch to **"Dr. Ramanathan (HOD - CSE)"**. Notice the Urgent Queue at the top. Click **"Workspace"** on the case. Review student details, play the audio, and post a confidential internal note: *"Initial committee inquiry begun."*
10. **Step 10 — Submit Related Case B:** Switch to student Priya (or Rahul), go to `#/complaint/new`, and click **"Preset B: Related Hostel Incident"**. Submit the complaint.
11. **Step 11 — Confirm Pattern & Escalate to Dean:** Switch to HOD Dr. Ramanathan, navigate to **"Related-Incident Review"** (`#/review`). Observe the candidate score (>= 50) and matched factor breakdown (`+30 category, +25 location, +15 recency, +20 suspect`). Click **"Confirm Link & Merge"** and enter a note. Observe the case group automatically escalates to **Dean**!
12. **Step 12 — Submit Preset C & Escalate to Higher Authority:** Submit **"Preset C"**. Switch to **Dr. Aruna (Dean)**, go to `#/review`, and confirm Preset C link. Observe the case group reaches 3 distinct confirmed incidents and escalates to **Higher Authority**!
13. **Step 13 — Urgent Queue Verification:** Switch between HOD, Dean, and Higher Authority and verify the persistent red **"URGENT / IMMEDIATE ATTENTION QUEUE"** remains pinned at the very top of each dashboard.
14. **Step 14 — Security & Privacy Verification:** Switch back to Student Priya. Open Case A. Observe that internal notes, link scores, and candidate groups are **completely hidden**. Try navigating to `#/review` or `#/policy` directly — observe **403 Access Denied**.
15. **Step 15 — Analytics & Clean Reset:** Switch to **Prof. Rajagopal (Higher Authority)**. Visit **"Campus Analytics"** (`#/analytics`) to view hand-built SVG department and category charts. Go to **"Escalation Policy"** (`#/policy`), inspect Group `#1` in the Group Inspector, and click **"Reset Demo Data"** to restore clean seed state.

---

## 11. Automated Test Results

Run all 25 automated tests via:
```bash
npm test
```

### Verified Test Output:
```
✔ Setup Test Server (295ms)
✔ API Auth & CSRF Protection: Rejects state-changing POST without CSRF token (105ms)
✔ API RBAC & IDOR: Student cannot view another student case, audio, or authority routes (324ms)
✔ API Audio Complaints: Magic byte verification and Range streaming (289ms)
✔ API Duplicate Protection: Identical token and fingerprint within 10 minutes return existing case (316ms)
✔ API Expiring Audio Links: Create, standalone player, range streaming, audit, and revoke (346ms)
✔ Teardown Test Server (1ms)
✔ SENTINEL 15-Step Live Demo End-to-End Workflow (2107ms)
✔ Audio Share Copy: Format conversion only, original untouched & zero transcription (83ms)
✔ Expiring Audio Link: Token hashing, expiration, max plays, and revocation (5ms)
✔ Case ID Generator: format and uniqueness over 1,000 iterations (26ms)
✔ Escalation Engine: Pure Scoring Function (4ms)
✔ Escalation Safeguard: Name or department alone can NEVER reach threshold (0.4ms)
✔ Escalation Level Rules: 1 -> HOD, 2 -> Dean, 3+ -> Higher Authority (0.2ms)
✔ Escalation Guarantee: Levels NEVER downgrade (0.2ms)
✔ Demo Helper Verification: Presets A, B, C relate with score >= 50, Preset D remains unrelated (0.4ms)
✔ Validation: Rejects future incident timestamp (6ms)
✔ Validation: Accepts current or past incident timestamp (0.7ms)
✔ Validation: Student SIF format and Indian phone number validation (1.8ms)
✔ WhatsApp Normalization: 10-digit Indian standard and international E.164 (1.2ms)
✔ WhatsApp URL & Unicode Encoding: preserves Tamil text and punctuation (0.4ms)
✔ WhatsApp Message: Extended content, zero emojis, separated timestamps, and honest notice (22ms)
✔ WhatsApp Localhost Security: Never emits localhost link in WhatsApp message (0.8ms)
✔ WhatsApp Honest States: Allows only honest states and rejects delivery confirmation (8ms)
✔ Web Share API: Share button hidden when canShare is false / unsupported (0.5ms)

Total: 25 tests passed, 0 failures, 0 skipped.
```

---

## 12. Backup and Restore Guide

### Create Backup
```bash
npm run backup
```
Creates a timestamped snapshot in `./backups/sentinel-backup-YYYY-MM-DD.../` containing `sentinel.db`, `sentinel.db-wal`, `storage/`, and `backup-meta.json`.

### Restore Backup
1. Stop the application server (`Ctrl+C`).
2. Copy `./backups/<backup-folder>/sentinel.db*` to `./data/sentinel.db`.
3. Copy `./backups/<backup-folder>/storage/*` to `./storage/`.
4. Restart the server with `npm start`.

---

## 13. Production Deployment Notes

1. **Reverse Proxy & HTTPS:** Place Node.js behind Nginx or Caddy with automated Let's Encrypt TLS. Set `trust proxy 1` in Express.
2. **Secure Cookies:** In `.env`, set `NODE_ENV=production`. This activates `Secure: true` on session cookies.
3. **Storage Persistence:** Map `./storage` to an encrypted persistent volume or replace `LocalDiskStorageAdapter` with an S3-compatible adapter.
4. **Environment Variables:** Generate a cryptographically secure `SESSION_SECRET` (at least 32 bytes) and set real `APP_BASE_URL`.

---

## 14. Known Limitations & Prototype Boundaries

1. **Synthetic CCTV Data:** Camera registry and coverage matches are synthetic demo records (`is_fictional=true`). There is no live video feed stream or real campus camera hardware integration.
2. **WhatsApp Delivery Confirmation:** Opening WhatsApp click-to-chat does not prove receipt or message delivery. The state is strictly labeled *"Awaiting manual send"*.
3. **Transparent Rule-Based Matching:** Relationship matching uses deterministic heuristic scoring, not machine learning or AI. Matches are prompts for human committee review.
4. **Demonstration Storage:** The prototype stores audio and evidence on local disk (`./storage`) and SQLite database (`./data/sentinel.db`). Enterprise multi-region setups should transition to S3 and PostgreSQL as documented.
