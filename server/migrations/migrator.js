import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from '../db/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function runMigrations() {
  console.log('[MIGRATOR] Checking database migrations...');

  // Ensure migrations tracking table exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);

  const appliedRows = db.prepare('SELECT name FROM schema_migrations').all();
  const appliedSet = new Set(appliedRows.map(r => r.name));

  const files = fs.readdirSync(__dirname)
    .filter(f => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    if (!appliedSet.has(file)) {
      console.log(`[MIGRATOR] Applying migration: ${file}...`);
      const filePath = path.join(__dirname, file);
      const sql = fs.readFileSync(filePath, 'utf8');

      // Execute SQL in a transaction
      const runSingleMigration = db.transaction(() => {
        db.exec(sql);
        db.prepare('INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)')
          .run(file, new Date().toISOString());
      });

      runSingleMigration();
      console.log(`[MIGRATOR] Successfully applied: ${file}`);
    }
  }

  console.log('[MIGRATOR] All migrations are up to date.');
}

// Allow direct CLI execution: node server/migrations/migrator.js
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runMigrations();
  process.exit(0);
}
