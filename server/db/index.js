import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config/index.js';

// Ensure data directory exists
if (!fs.existsSync(config.DATA_DIR)) {
  fs.mkdirSync(config.DATA_DIR, { recursive: true });
}

const dbFilePath = path.join(config.DATA_DIR, 'sentinel.db');

class SQLiteDatabase {
  constructor(filePath) {
    this.filePath = filePath;
    this.driver = null;
    this.init();
  }

  init() {
    let nativeModule = null;
    try {
      // Try better-sqlite3 first if available
      const betterSqlite = awaitImport('better-sqlite3');
      if (betterSqlite) {
        this.driver = new betterSqlite(this.filePath);
        this.type = 'better-sqlite3';
      }
    } catch {
      // Fallback to Node 22+ native node:sqlite
    }

    if (!this.driver) {
      try {
        const { DatabaseSync } = awaitImport('node:sqlite');
        this.driver = new DatabaseSync(this.filePath);
        this.type = 'node:sqlite';
      } catch (err) {
        throw new Error(`Failed to initialize SQLite driver: ${err.message}`);
      }
    }

    // Set Pragmas
    this.exec('PRAGMA foreign_keys = ON;');
    this.exec('PRAGMA journal_mode = WAL;');
  }

  exec(sql) {
    return this.driver.exec(sql);
  }

  prepare(sql) {
    const stmt = this.driver.prepare(sql);
    const type = this.type;
    return {
      run: (...params) => {
        // Flatten array if first param is array
        const args = (params.length === 1 && Array.isArray(params[0])) ? params[0] : params;
        return stmt.run(...args);
      },
      get: (...params) => {
        const args = (params.length === 1 && Array.isArray(params[0])) ? params[0] : params;
        return stmt.get(...args);
      },
      all: (...params) => {
        const args = (params.length === 1 && Array.isArray(params[0])) ? params[0] : params;
        return stmt.all(...args);
      }
    };
  }

  transaction(fn) {
    if (this.type === 'better-sqlite3' && typeof this.driver.transaction === 'function') {
      return this.driver.transaction(fn);
    }
    // Universal transaction wrapper
    return (...args) => {
      this.exec('BEGIN TRANSACTION;');
      try {
        const result = fn(...args);
        this.exec('COMMIT;');
        return result;
      } catch (err) {
        this.exec('ROLLBACK;');
        throw err;
      }
    };
  }

  close() {
    if (this.driver && typeof this.driver.close === 'function') {
      this.driver.close();
    }
  }
}

// Helper for dynamic imports in ES module
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

function awaitImport(pkg) {
  try {
    return require(pkg);
  } catch {
    return null;
  }
}

export const db = new SQLiteDatabase(dbFilePath);
export { SQLiteDatabase };
