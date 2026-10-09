import { db } from '../db/index.js';
import { hashPassword } from '../middleware/auth.js';
import { runMigrations } from '../migrations/migrator.js';
import { DEFAULT_POLICY, calculateRelationshipScore } from '../engine/escalation.js';

export async function seedDatabase(forceClean = false) {
  console.log('[SEED] Starting SENTINEL demo database seeding...');
  
  // Ensure migrations are run first
  runMigrations();

  const count = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
  if (count > 0 && !forceClean) {
    console.log('[SEED] Database already contains data. Skipping seed. (Use forceClean=true to reset)');
    return;
  }

  const now = new Date();
  const defaultPassword = 'SentinelDemo2026!';
  const hashedPassword = await hashPassword(defaultPassword);

  const runSeeding = db.transaction(() => {
    // If force clean, clear tables in reverse foreign-key order
    if (forceClean) {
      console.log('[SEED] Clearing existing records for clean reset...');
      const tables = [
        'whatsapp_notifications', 'notifications', 'status_history', 'info_requests',
        'internal_notes', 'investigation_tasks', 'investigations', 'escalation_history',
        'link_candidates', 'cctv_requests', 'evidence', 'audio_complaints', 'cases',
        'case_groups', 'cameras', 'campus_locations', 'students', 'departments',
        'users', 'sessions', 'audit_log', 'escalation_policy'
      ];
      for (const table of tables) {
        db.exec(`DELETE FROM ${table};`);
      }
      try {
        db.exec('DELETE FROM sqlite_sequence;');
      } catch {}
    }

    // 1. Escalation Policy
    db.prepare(`
      INSERT INTO escalation_policy (key, value, updated_by, updated_at)
      VALUES (?, ?, NULL, ?)
    `).run('relationship_escalation', JSON.stringify(DEFAULT_POLICY), now.toISOString());

    // 2. Users (Fictional Authorities & Students)
    const insertUser = db.prepare(`
      INSERT INTO users (role, email, password_hash, full_name, department_id, is_active, created_at)
      VALUES (?, ?, ?, ?, ?, 1, ?)
    `);

    // HODs
    const hodCseId = insertUser.run('hod', 'hod.cse@campus.edu', hashedPassword, 'Dr. K. Ramanathan', null, now.toISOString()).lastInsertRowid;
    const hodEceId = insertUser.run('hod', 'hod.ece@campus.edu', hashedPassword, 'Dr. Meenakshi Sundaram', null, now.toISOString()).lastInsertRowid;

    // Dean
    const deanId = insertUser.run('dean', 'dean.studentaffairs@campus.edu', hashedPassword, 'Dr. Aruna Swaminathan', null, now.toISOString()).lastInsertRowid;

    // Higher Authority
    const higherId = insertUser.run('higher', 'director.safety@campus.edu', hashedPassword, 'Prof. V. Rajagopal', null, now.toISOString()).lastInsertRowid;

    // Students
    const student1Id = insertUser.run('student', 'priya.sharma@campus.edu', hashedPassword, 'Priya Sharma', null, now.toISOString()).lastInsertRowid;
    const student2Id = insertUser.run('student', 'rahul.varma@campus.edu', hashedPassword, 'Rahul Varma', null, now.toISOString()).lastInsertRowid;
    const student3Id = insertUser.run('student', 'ananya.sen@campus.edu', hashedPassword, 'Ananya Sen', null, now.toISOString()).lastInsertRowid;

    // 3. Departments
    const insertDept = db.prepare('INSERT INTO departments (code, name, hod_user_id) VALUES (?, ?, ?)');
    const deptCse = insertDept.run('CSE', 'Computer Science & Engineering', hodCseId).lastInsertRowid;
    const deptEce = insertDept.run('ECE', 'Electronics & Communication', hodEceId).lastInsertRowid;
    const deptMech = insertDept.run('MECH', 'Mechanical Engineering', null).lastInsertRowid;
    const deptBio = insertDept.run('BIOTECH', 'Biotechnology & Bioinformatics', null).lastInsertRowid;

    // Associate department IDs to users
    db.prepare('UPDATE users SET department_id = ? WHERE id = ?').run(deptCse, hodCseId);
    db.prepare('UPDATE users SET department_id = ? WHERE id = ?').run(deptEce, hodEceId);
    db.prepare('UPDATE users SET department_id = ? WHERE id = ?').run(deptCse, student1Id);
    db.prepare('UPDATE users SET department_id = ? WHERE id = ?').run(deptEce, student2Id);
    db.prepare('UPDATE users SET department_id = ? WHERE id = ?').run(deptMech, student3Id);

    // 4. Students Extension Table
    const insertStudent = db.prepare(`
      INSERT INTO students (user_id, sif_number, department_id, programme, year_of_study, section, phone, student_account_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertStudent.run(student1Id, 'SIF202601', deptCse, 'B.Tech Computer Science', 3, 'A', '9840112233', 'ACC-SIF202601');
    insertStudent.run(student2Id, 'SIF202602', deptEce, 'B.Tech ECE', 2, 'B', '9840223344', 'ACC-SIF202602');
    insertStudent.run(student3Id, 'SIF202603', deptMech, 'B.Tech Mechanical', 1, 'C', '9840334455', 'ACC-SIF202603');

    // 5. Campus Locations
    const insertLoc = db.prepare('INSERT INTO campus_locations (name, building, zone, active) VALUES (?, ?, ?, 1)');
    const locLib = insertLoc.run('Main Library Ground Floor', 'Academic Block A', 'North').lastInsertRowid;
    const locCafe = insertLoc.run('Central Cafeteria & Food Court', 'Student Union Building', 'Central').lastInsertRowid;
    const locQuad = insertLoc.run('Science Quadrangle Walkway', 'Science Complex', 'Central').lastInsertRowid;
    const locHostel = insertLoc.run('Hostel Block 3 Entrance & Lobby', 'Hostel Block 3', 'South').lastInsertRowid;
    const locWorkshop = insertLoc.run('Engineering Workshop Alley', 'Mechanical Labs', 'East').lastInsertRowid;
    const locSports = insertLoc.run('Sports Complex Pavilion', 'Athletics Ground', 'West').lastInsertRowid;
    const locBus = insertLoc.run('Gate 2 Bus Terminus & Transit Bay', 'Campus Perimeter', 'Outer').lastInsertRowid;
    const locCompLab = insertLoc.run('Computer Centre Floor 2', 'Academic Block B', 'North').lastInsertRowid;

    // 6. Cameras (12 Fictional demo cameras)
    const insertCam = db.prepare(`
      INSERT INTO cameras (camera_code, label, location_id, coverage_zones, coverage_description, operating_from, operating_to, retention_hours, verification_status, is_fictional)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `);

    insertCam.run('CAM-NO-01', 'Main Library Foyer & Turnstiles', locLib, JSON.stringify(['North', 'Main Library Ground Floor']), 'Covers turnstiles and library circulation desk entrance', '06:00', '23:00', 72, 'verified');
    insertCam.run('CAM-NO-02', 'Academic Block A East Stairs', locLib, JSON.stringify(['North']), 'Stairwell connecting floors 1 and 2 of Block A', '06:00', '22:00', 48, 'verified');
    insertCam.run('CAM-CE-01', 'Central Cafeteria Dining Foyer', locCafe, JSON.stringify(['Central', 'Central Cafeteria & Food Court']), 'Dining seating area, counters and patio', '07:00', '22:00', 96, 'verified');
    insertCam.run('CAM-CE-02', 'Science Quadrangle Walkway West', locQuad, JSON.stringify(['Central', 'Science Quadrangle Walkway']), 'Perimeter walkway between chemistry and physics halls', '00:00', '23:59', 72, 'verified');
    insertCam.run('CAM-SO-01', 'Hostel Block 3 Main Entrance', locHostel, JSON.stringify(['South', 'Hostel Block 3 Entrance & Lobby']), 'Entry porch, biometric turnstiles, visitor desk', '00:00', '23:59', 120, 'verified');
    insertCam.run('CAM-SO-02', 'Hostel Block 3 Rear Walkway', locHostel, JSON.stringify(['South']), 'Rear perimeter path towards dining hall', '18:00', '06:00', 48, 'unverified');
    insertCam.run('CAM-EA-01', 'Workshop Central Pathway', locWorkshop, JSON.stringify(['East', 'Engineering Workshop Alley']), 'Machining lab corridor and foundry gate', '08:00', '20:00', 72, 'verified');
    insertCam.run('CAM-EA-02', 'Foundry Loading Bay', locWorkshop, JSON.stringify(['East']), 'Material delivery bay behind mechanical shed', '08:00', '18:00', 48, 'offline');
    insertCam.run('CAM-WE-01', 'Athletics Ground Pavilion North', locSports, JSON.stringify(['West', 'Sports Complex Pavilion']), 'Bleachers and pavilion exit towards track', '06:00', '21:00', 72, 'verified');
    insertCam.run('CAM-OU-01', 'Gate 2 Transit Plaza & Bus Bay', locBus, JSON.stringify(['Outer', 'Gate 2 Bus Terminus & Transit Bay']), 'Turnaround loop and commuter shelter at main gate', '00:00', '23:59', 168, 'verified');
    insertCam.run('CAM-OU-02', 'Campus Perimeter Boundary North', locBus, JSON.stringify(['Outer']), 'Perimeter fence coverage near gate 2', '00:00', '23:59', 72, 'verified');
    insertCam.run('CAM-NO-03', 'Computer Centre Corridor Floor 2', locCompLab, JSON.stringify(['North', 'Computer Centre Floor 2']), 'Server lab and general workstation floor corridor', '08:00', '21:00', 72, 'verified');

    // 7. Case Groups at different levels (Higher Authority group, Dean group, HOD group)
    const insertGroup = db.prepare('INSERT INTO case_groups (level, created_at) VALUES (?, ?)');
    const groupHigher = insertGroup.run('Higher Authority', new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString()).lastInsertRowid;
    const groupDean = insertGroup.run('Dean', new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString()).lastInsertRowid;
    const groupHod = insertGroup.run('HOD', new Date(Date.now() - 5 * 24 * 3600 * 1000).toISOString()).lastInsertRowid;

    // Escalation history records for seeded groups
    const insertHistory = db.prepare(`
      INSERT INTO escalation_history (group_id, from_level, to_level, reason, triggered_by_case_id, approved_by, created_at)
      VALUES (?, ?, ?, ?, NULL, ?, ?)
    `);
    insertHistory.run(groupHigher, 'HOD', 'Dean', 'Pattern detected: 2 confirmed related incidents linked across campus locations.', deanId, new Date(Date.now() - 25 * 24 * 3600 * 1000).toISOString());
    insertHistory.run(groupHigher, 'Dean', 'Higher Authority', 'Escalation threshold met: 3 confirmed related incidents across departments.', higherId, new Date(Date.now() - 20 * 24 * 3600 * 1000).toISOString());
    insertHistory.run(groupDean, 'HOD', 'Dean', 'Two related reports confirmed by department committee.', deanId, new Date(Date.now() - 10 * 24 * 3600 * 1000).toISOString());

    // 8. Generate 50 historical cases across 6-8 weeks
    const categories = [
      'Ragging', 'Harassment', 'Bullying', 'Stalking/Unwanted following',
      'Verbal abuse/Intimidation', 'Cyber harassment/Online', 'Discrimination', 'Other'
    ];
    const locationIds = [locLib, locCafe, locQuad, locHostel, locWorkshop, locSports, locBus, locCompLab];
    const studentIds = [student1Id, student2Id, student3Id];
    const deptIds = [deptCse, deptEce, deptMech, deptBio];

    const insertCaseStmt = db.prepare(`
      INSERT INTO cases (
        case_ref, student_user_id, department_id, category, incident_at, submitted_at,
        campus_location_id, location_detail, description, suspect_details, witness_details,
        urgent, privacy_mode, preferred_language, status, assigned_level, assigned_user_id,
        group_id, link_state, fingerprint, submission_token, counts_toward_escalation,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    // Pre-populate members of groupHigher (3 cases)
    for (let i = 1; i <= 3; i++) {
      const pastDays = 35 - i * 5;
      const incidentDate = new Date(Date.now() - pastDays * 24 * 3600 * 1000).toISOString();
      const ref = `SNT-2608${String(10 + i).padStart(2, '0')}-HIST000${i}`;
      insertCaseStmt.run(
        ref, studentIds[i - 1], deptCse, 'Bullying', incidentDate, incidentDate,
        locCafe, `Table cluster #${i}`, `Repeated verbal harassment and intimidation outside dining area.`,
        'Group of senior students wearing dark jackets', null, 0, 'confidential', 'English',
        'Under Investigation', 'Higher Authority', higherId, groupHigher, 'confirmed',
        `fp-higher-${i}`, `token-higher-${i}`, 1, incidentDate, incidentDate
      );
    }

    // Pre-populate members of groupDean (2 cases)
    for (let i = 1; i <= 2; i++) {
      const pastDays = 15 - i * 4;
      const incidentDate = new Date(Date.now() - pastDays * 24 * 3600 * 1000).toISOString();
      const ref = `SNT-2609${String(10 + i).padStart(2, '0')}-DEAN000${i}`;
      insertCaseStmt.run(
        ref, studentIds[i - 1], deptEce, 'Stalking/Unwanted following', incidentDate, incidentDate,
        locLib, `East staircase`, `Unwanted following and staring repeatedly over three afternoons.`,
        'Individual in grey hoodie near study cubicles', null, 0, 'confidential', 'English',
        'Under Investigation', 'Dean', deanId, groupDean, 'confirmed',
        `fp-dean-${i}`, `token-dean-${i}`, 1, incidentDate, incidentDate
      );
    }

    // Single active case in groupHod
    const hodRef = 'SNT-260920-HOD00001';
    const hodIncident = new Date(Date.now() - 4 * 24 * 3600 * 1000).toISOString();
    insertCaseStmt.run(
      hodRef, student1Id, deptCse, 'Verbal abuse/Intimidation', hodIncident, hodIncident,
      locCompLab, 'Lab 204 aisle', 'Hostile shouting and verbal abuse during lab project work.',
      'Unknown lab peer', null, 0, 'confidential', 'English',
      'Awaiting Review', 'HOD', hodCseId, groupHod, 'new',
      'fp-hod-1', 'token-hod-1', 1, hodIncident, hodIncident
    );

    // Seed Urgent Case in immediate attention queue
    const urgentRef = 'SNT-261001-URGENT01';
    const urgentIncident = new Date(Date.now() - 1 * 24 * 3600 * 1000).toISOString();
    const urgentCaseId = insertCaseStmt.run(
      urgentRef, student2Id, deptEce, 'Ragging', urgentIncident, urgentIncident,
      locHostel, 'Hostel 3 Corridor Wing B', 'Aggressive confrontation, blocking passage and severe ragging threat.',
      'Three senior residents hostel block 3', 'Two wing roommates', 1, 'confidential', 'Tamil',
      'Awaiting Review', 'Dean', deanId, null, 'new',
      'fp-urgent-1', 'token-urgent-1', 1, urgentIncident, urgentIncident
    ).lastInsertRowid;

    // Remaining background fictional cases (approx 45 cases) spread across 50 days
    const statuses = ['Resolved', 'Closed', 'Under Investigation', 'Awaiting Review', 'Additional Information Requested'];
    for (let c = 1; c <= 44; c++) {
      const dayOffset = Math.floor((c / 44) * 55) + 2;
      const caseTime = new Date(Date.now() - dayOffset * 24 * 3600 * 1000 + (c * 37 % 24) * 3600 * 1000).toISOString();
      const cat = categories[c % categories.length];
      const loc = locationIds[c % locationIds.length];
      const stu = studentIds[c % studentIds.length];
      const dept = deptIds[c % deptIds.length];
      const st = statuses[c % statuses.length];
      const isUrg = (c % 11 === 0) ? 1 : 0;
      const refCode = `SNT-26${String(Math.floor(dayOffset)).padStart(2, '0')}-HIST${String(c).padStart(4, '0')}`;

      // Each past historical case gets its own group
      const grp = insertGroup.run('HOD', caseTime).lastInsertRowid;

      insertCaseStmt.run(
        refCode, stu, dept, cat, caseTime, caseTime,
        loc, `Area marker ${c % 5}`, `Fictional historical campus incident record #${c} for analytical demonstration.`,
        'Fictional suspect notes recorded in report', null, isUrg, 'confidential', 'English',
        st, 'HOD', hodCseId, grp, 'new',
        `fp-hist-${c}`, `token-hist-${c}`, 1, caseTime, caseTime
      );
    }

    // Seed CCTV requests for demo
    db.prepare(`
      INSERT INTO cctv_requests (case_id, camera_ids, requested_by, requested_at, preservation_deadline, status, outcome_note, updated_at)
      VALUES (?, ?, ?, ?, ?, 'preservation_confirmed', 'Preserved 4 hours of footage around timestamp', ?)
    `).run(
      urgentCaseId,
      JSON.stringify([5, 6]),
      student2Id,
      urgentIncident,
      new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
      now.toISOString()
    );

    // Initial audit log entries
    db.prepare(`
      INSERT INTO audit_log (ts, actor_user_id, actor_role, action, entity_type, entity_id, ip_hash, details)
      VALUES (?, ?, 'system', 'DATABASE_INITIALIZED', 'system', 'demo_seed', '127.0.0.1', ?)
    `).run(now.toISOString(), higherId, JSON.stringify({ seeded: true, version: '1.0.0' }));

    console.log('[SEED] Demo database seeding completed successfully!');
  });

  runSeeding();
}

// Allow CLI execution: node server/seed/seed.js
import { fileURLToPath } from 'node:url';
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  seedDatabase(true).then(() => process.exit(0)).catch(err => {
    console.error('[SEED_ERROR]', err);
    process.exit(1);
  });
}
