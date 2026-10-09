import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from '../config/index.js';

// Ensure private storage directory exists
if (!fs.existsSync(config.STORAGE_DIR)) {
  fs.mkdirSync(config.STORAGE_DIR, { recursive: true });
}

// Magic bytes definitions for allowed formats
const MAGIC_SIGNATURES = [
  // JPEG
  { mime: 'image/jpeg', bytes: [0xFF, 0xD8, 0xFF] },
  // PNG
  { mime: 'image/png', bytes: [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A] },
  // WebP (RIFF....WEBP)
  {
    mime: 'image/webp',
    check: (buf) => buf.length >= 12 && 
      buf.toString('ascii', 0, 4) === 'RIFF' && 
      buf.toString('ascii', 8, 12) === 'WEBP'
  },
  // PDF
  { mime: 'application/pdf', bytes: [0x25, 0x50, 0x44, 0x46] }, // %PDF
  // WebM / Matroska (0x1A, 0x45, 0xDF, 0xA3)
  { mime: 'video/webm', bytes: [0x1A, 0x45, 0xDF, 0xA3] },
  { mime: 'audio/webm', bytes: [0x1A, 0x45, 0xDF, 0xA3] },
  // WAV (RIFF....WAVE)
  {
    mime: 'audio/wav',
    check: (buf) => buf.length >= 12 && 
      buf.toString('ascii', 0, 4) === 'RIFF' && 
      buf.toString('ascii', 8, 12) === 'WAVE'
  },
  // MP4 / M4A (ftyp....)
  {
    mime: 'video/mp4',
    check: (buf) => buf.length >= 8 && buf.toString('ascii', 4, 8) === 'ftyp'
  },
  {
    mime: 'audio/mp4',
    check: (buf) => buf.length >= 8 && buf.toString('ascii', 4, 8) === 'ftyp'
  },
  // MP3 (ID3 or 0xFF 0xFB/F3/F2)
  {
    mime: 'audio/mpeg',
    check: (buf) => {
      if (buf.length < 3) return false;
      if (buf.toString('ascii', 0, 3) === 'ID3') return true;
      return buf[0] === 0xFF && (buf[1] & 0xE0) === 0xE0;
    }
  },
  // Ogg
  { mime: 'audio/ogg', bytes: [0x4F, 0x67, 0x67, 0x53] } // OggS
];

export function detectMimeFromBuffer(buffer) {
  if (!buffer || buffer.length < 4) return null;

  for (const sig of MAGIC_SIGNATURES) {
    if (sig.check && sig.check(buffer)) {
      return sig.mime;
    }
    if (sig.bytes) {
      let match = true;
      for (let i = 0; i < sig.bytes.length; i++) {
        if (buffer[i] !== sig.bytes[i]) {
          match = false;
          break;
        }
      }
      if (match) return sig.mime;
    }
  }
  return null;
}

// Storage adapter interface
export class StorageAdapter {
  async saveFile(buffer, originalFilename) {
    throw new Error('Not implemented');
  }
  async getFilePath(storageKey) {
    throw new Error('Not implemented');
  }
  async deleteFile(storageKey) {
    throw new Error('Not implemented');
  }
  async getStream(storageKey, range) {
    throw new Error('Not implemented');
  }
}

// Disk implementation
export class LocalDiskStorageAdapter extends StorageAdapter {
  constructor(baseDir) {
    super();
    this.baseDir = baseDir;
  }

  async saveFile(buffer, originalFilename = 'file') {
    const ext = path.extname(originalFilename).toLowerCase();
    const storageKey = `${crypto.randomUUID()}${ext || '.bin'}`;
    const targetPath = path.join(this.baseDir, storageKey);

    // Compute sha256
    const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');

    // Write file atomically
    await fs.promises.writeFile(targetPath, buffer);

    return {
      storageKey,
      sizeBytes: buffer.length,
      sha256,
      targetPath
    };
  }

  getFilePath(storageKey) {
    // Sanitize to prevent path traversal
    const safeKey = path.basename(storageKey);
    const fullPath = path.join(this.baseDir, safeKey);
    if (!fs.existsSync(fullPath)) {
      return null;
    }
    return fullPath;
  }

  async deleteFile(storageKey) {
    const filePath = this.getFilePath(storageKey);
    if (filePath && fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath);
    }
  }

  getFileStats(storageKey) {
    const filePath = this.getFilePath(storageKey);
    if (!filePath) return null;
    return fs.statSync(filePath);
  }

  createReadStream(storageKey, options = {}) {
    const filePath = this.getFilePath(storageKey);
    if (!filePath) return null;
    return fs.createReadStream(filePath, options);
  }
}

export const storageAdapter = new LocalDiskStorageAdapter(config.STORAGE_DIR);
