import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../server/config/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../');

function copyRecursiveSync(src, dest) {
  const exists = fs.existsSync(src);
  const stats = exists && fs.statSync(src);
  const isDirectory = exists && stats.isDirectory();
  if (isDirectory) {
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    fs.readdirSync(src).forEach((childItemName) => {
      copyRecursiveSync(path.join(src, childItemName), path.join(dest, childItemName));
    });
  } else if (exists) {
    fs.copyFileSync(src, dest);
  }
}

export function createBackup() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDirName = `sentinel-backup-${timestamp}`;
  const backupsRoot = path.join(rootDir, 'backups');
  const targetBackupDir = path.join(backupsRoot, backupDirName);

  console.log(`[BACKUP] Creating snapshot in ${targetBackupDir}...`);

  if (!fs.existsSync(targetBackupDir)) {
    fs.mkdirSync(targetBackupDir, { recursive: true });
  }

  // 1. Copy SQLite database file
  const dbSrc = path.join(config.DATA_DIR, 'sentinel.db');
  if (fs.existsSync(dbSrc)) {
    fs.copyFileSync(dbSrc, path.join(targetBackupDir, 'sentinel.db'));
    // If WAL and SHM exist, copy them too
    if (fs.existsSync(`${dbSrc}-wal`)) fs.copyFileSync(`${dbSrc}-wal`, path.join(targetBackupDir, 'sentinel.db-wal'));
    if (fs.existsSync(`${dbSrc}-shm`)) fs.copyFileSync(`${dbSrc}-shm`, path.join(targetBackupDir, 'sentinel.db-shm'));
    console.log('[BACKUP] Database copied successfully.');
  }

  // 2. Copy storage folder
  if (fs.existsSync(config.STORAGE_DIR)) {
    const storageDest = path.join(targetBackupDir, 'storage');
    copyRecursiveSync(config.STORAGE_DIR, storageDest);
    console.log('[BACKUP] Storage files copied successfully.');
  }

  // 3. Write metadata file
  const meta = {
    timestamp: new Date().toISOString(),
    nodeEnv: config.NODE_ENV,
    campusTimezone: config.CAMPUS_TIMEZONE,
    version: '1.0.0'
  };
  fs.writeFileSync(path.join(targetBackupDir, 'backup-meta.json'), JSON.stringify(meta, null, 2));

  console.log(`[BACKUP] Backup completed successfully at: ${targetBackupDir}`);
  return targetBackupDir;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    createBackup();
    process.exit(0);
  } catch (err) {
    console.error('[BACKUP_ERROR] Failed to create backup:', err);
    process.exit(1);
  }
}
