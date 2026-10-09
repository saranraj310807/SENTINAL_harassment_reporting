-- SENTINEL Schema Migration 001
-- Tables are created with Foreign Keys enabled and UTC ISO timestamp strings

-- Migrations tracking table
CREATE TABLE IF NOT EXISTS schema_migrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  applied_at TEXT NOT NULL
);

-- Users
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  role TEXT NOT NULL CHECK(role IN ('student', 'hod', 'dean', 'higher')),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  department_id INTEGER,
  is_active INTEGER NOT NULL DEFAULT 1,
  failed_logins INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  created_at TEXT NOT NULL
);

-- Students extension table
CREATE TABLE IF NOT EXISTS students (
  user_id INTEGER PRIMARY KEY,
  sif_number TEXT UNIQUE NOT NULL,
  department_id INTEGER,
  programme TEXT NOT NULL,
  year_of_study INTEGER NOT NULL,
  section TEXT NOT NULL,
  phone TEXT NOT NULL,
  student_account_id TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (department_id) REFERENCES departments(id)
);

-- Departments
CREATE TABLE IF NOT EXISTS departments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  hod_user_id INTEGER,
  FOREIGN KEY (hod_user_id) REFERENCES users(id)
);

-- Campus Locations
CREATE TABLE IF NOT EXISTS campus_locations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  building TEXT NOT NULL,
  zone TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1
);

-- Case Groups (for grouping linked cases and tracking collective escalation level)
CREATE TABLE IF NOT EXISTS case_groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  level TEXT NOT NULL DEFAULT 'HOD' CHECK(level IN ('HOD', 'Dean', 'Higher Authority')),
  created_at TEXT NOT NULL
);

-- Cases
CREATE TABLE IF NOT EXISTS cases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  case_ref TEXT UNIQUE NOT NULL,
  student_user_id INTEGER NOT NULL,
  department_id INTEGER,
  category TEXT NOT NULL CHECK(category IN (
    'Ragging',
    'Harassment',
    'Bullying',
    'Stalking/Unwanted following',
    'Verbal abuse/Intimidation',
    'Cyber harassment/Online',
    'Discrimination',
    'Other'
  )),
  incident_at TEXT NOT NULL,
  submitted_at TEXT NOT NULL,
  campus_location_id INTEGER,
  location_detail TEXT,
  description TEXT,
  suspect_details TEXT,
  witness_details TEXT,
  urgent INTEGER NOT NULL DEFAULT 0,
  privacy_mode TEXT NOT NULL DEFAULT 'confidential' CHECK(privacy_mode IN ('confidential', 'anonymous_to_reviewers_where_permitted')),
  preferred_language TEXT NOT NULL DEFAULT 'English',
  status TEXT NOT NULL DEFAULT 'Submitted' CHECK(status IN (
    'Submitted',
    'Awaiting Review',
    'Under Investigation',
    'Additional Information Requested',
    'Referred to Another Authority',
    'Resolved',
    'Closed'
  )),
  assigned_level TEXT NOT NULL DEFAULT 'HOD' CHECK(assigned_level IN ('HOD', 'Dean', 'Higher Authority')),
  assigned_user_id INTEGER,
  group_id INTEGER,
  link_state TEXT NOT NULL DEFAULT 'new' CHECK(link_state IN ('new', 'potential', 'confirmed', 'rejected')),
  fingerprint TEXT NOT NULL,
  submission_token TEXT UNIQUE NOT NULL,
  counts_toward_escalation INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (student_user_id) REFERENCES users(id),
  FOREIGN KEY (department_id) REFERENCES departments(id),
  FOREIGN KEY (campus_location_id) REFERENCES campus_locations(id),
  FOREIGN KEY (assigned_user_id) REFERENCES users(id),
  FOREIGN KEY (group_id) REFERENCES case_groups(id)
);

-- Audio complaints (Mandatory constraint: NO transcript, translation or text-derived columns)
CREATE TABLE IF NOT EXISTS audio_complaints (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  case_id INTEGER NOT NULL,
  storage_key TEXT NOT NULL,
  original_mime TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  duration_seconds INTEGER,
  preferred_language TEXT NOT NULL DEFAULT 'English',
  recorded_or_uploaded TEXT NOT NULL CHECK(recorded_or_uploaded IN ('recorded', 'uploaded')),
  sha256 TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE
);

-- Evidence attachments
CREATE TABLE IF NOT EXISTS evidence (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  case_id INTEGER NOT NULL,
  storage_key TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  mime TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  kind TEXT NOT NULL,
  review_status TEXT NOT NULL DEFAULT 'pending' CHECK(review_status IN ('pending', 'reviewed', 'rejected')),
  reviewed_by INTEGER,
  reviewed_at TEXT,
  uploaded_at TEXT NOT NULL,
  FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE,
  FOREIGN KEY (reviewed_by) REFERENCES users(id)
);

-- Cameras
CREATE TABLE IF NOT EXISTS cameras (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  camera_code TEXT UNIQUE NOT NULL,
  label TEXT NOT NULL,
  location_id INTEGER,
  coverage_zones TEXT NOT NULL,
  coverage_description TEXT NOT NULL,
  operating_from TEXT NOT NULL,
  operating_to TEXT NOT NULL,
  retention_hours INTEGER NOT NULL,
  verification_status TEXT NOT NULL DEFAULT 'verified' CHECK(verification_status IN ('unverified', 'verified', 'offline')),
  is_fictional INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY (location_id) REFERENCES campus_locations(id)
);

-- CCTV Preservation & Review Requests
CREATE TABLE IF NOT EXISTS cctv_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  case_id INTEGER NOT NULL,
  camera_ids TEXT NOT NULL,
  requested_by INTEGER NOT NULL,
  requested_at TEXT NOT NULL,
  preservation_deadline TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'requested' CHECK(status IN (
    'requested',
    'preservation_confirmed',
    'under_review',
    'reviewed',
    'footage_unavailable',
    'closed'
  )),
  outcome_note TEXT,
  updated_by INTEGER,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE,
  FOREIGN KEY (requested_by) REFERENCES users(id),
  FOREIGN KEY (updated_by) REFERENCES users(id)
);

-- Link Candidates (Human review queue for incident relationships)
CREATE TABLE IF NOT EXISTS link_candidates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  case_id INTEGER NOT NULL,
  candidate_group_id INTEGER NOT NULL,
  score REAL NOT NULL,
  matched_factors TEXT NOT NULL,
  unmatched_factors TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending', 'confirmed', 'rejected')),
  reviewed_by INTEGER,
  reviewed_at TEXT,
  review_note TEXT,
  FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE,
  FOREIGN KEY (candidate_group_id) REFERENCES case_groups(id) ON DELETE CASCADE,
  FOREIGN KEY (reviewed_by) REFERENCES users(id)
);

-- Escalation Policy configuration
CREATE TABLE IF NOT EXISTS escalation_policy (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT UNIQUE NOT NULL,
  value TEXT NOT NULL,
  updated_by INTEGER,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (updated_by) REFERENCES users(id)
);

-- Escalation History
CREATE TABLE IF NOT EXISTS escalation_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id INTEGER NOT NULL,
  from_level TEXT NOT NULL,
  to_level TEXT NOT NULL,
  reason TEXT NOT NULL,
  triggered_by_case_id INTEGER,
  approved_by INTEGER,
  created_at TEXT NOT NULL,
  FOREIGN KEY (group_id) REFERENCES case_groups(id) ON DELETE CASCADE,
  FOREIGN KEY (triggered_by_case_id) REFERENCES cases(id),
  FOREIGN KEY (approved_by) REFERENCES users(id)
);

-- Investigations
CREATE TABLE IF NOT EXISTS investigations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  case_id INTEGER UNIQUE NOT NULL,
  assigned_investigator_id INTEGER,
  status TEXT NOT NULL DEFAULT 'active',
  due_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE,
  FOREIGN KEY (assigned_investigator_id) REFERENCES users(id)
);

-- Investigation Tasks
CREATE TABLE IF NOT EXISTS investigation_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  investigation_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  due_at TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'in_progress', 'completed')),
  assigned_to INTEGER,
  created_by INTEGER NOT NULL,
  FOREIGN KEY (investigation_id) REFERENCES investigations(id) ON DELETE CASCADE,
  FOREIGN KEY (assigned_to) REFERENCES users(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);

-- Internal Notes (Confidential: Strictly never visible to students)
CREATE TABLE IF NOT EXISTS internal_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  case_id INTEGER NOT NULL,
  author_id INTEGER NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE,
  FOREIGN KEY (author_id) REFERENCES users(id)
);

-- Information Requests (Exchange between authority and student)
CREATE TABLE IF NOT EXISTS info_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  case_id INTEGER NOT NULL,
  requested_by INTEGER NOT NULL,
  message TEXT NOT NULL,
  response TEXT,
  requested_at TEXT NOT NULL,
  responded_at TEXT,
  FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE,
  FOREIGN KEY (requested_by) REFERENCES users(id)
);

-- Status History (Audit trail of state transitions)
CREATE TABLE IF NOT EXISTS status_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  case_id INTEGER NOT NULL,
  from_status TEXT,
  to_status TEXT NOT NULL,
  actor_id INTEGER NOT NULL,
  note TEXT,
  student_visible INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE,
  FOREIGN KEY (actor_id) REFERENCES users(id)
);

-- Notifications (In-app notifications)
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  case_id INTEGER,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  read_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE
);

-- WhatsApp Notification Tracker (No fake delivery; honest states only)
CREATE TABLE IF NOT EXISTS whatsapp_notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  case_id INTEGER NOT NULL,
  recipient_e164 TEXT NOT NULL,
  message_hash TEXT NOT NULL,
  level TEXT NOT NULL CHECK(level IN ('minimal', 'extended')),
  state TEXT NOT NULL CHECK(state IN ('prepared', 'opened', 'awaiting_manual_send', 'delivery_confirmed')),
  prepared_at TEXT NOT NULL,
  opened_at TEXT,
  created_by INTEGER NOT NULL,
  FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id)
);

-- Audit Log (Append-only)
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL,
  actor_user_id INTEGER,
  actor_role TEXT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  ip_hash TEXT,
  details TEXT
);

-- Sessions
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  user_agent TEXT,
  ip_hash TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Indexes for performance & integrity
CREATE INDEX IF NOT EXISTS idx_cases_case_ref ON cases(case_ref);
CREATE INDEX IF NOT EXISTS idx_cases_student_user_id ON cases(student_user_id);
CREATE INDEX IF NOT EXISTS idx_cases_department_id ON cases(department_id);
CREATE INDEX IF NOT EXISTS idx_cases_group_id ON cases(group_id);
CREATE INDEX IF NOT EXISTS idx_cases_fingerprint ON cases(fingerprint);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_log(actor_user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read_at);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
