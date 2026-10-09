import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../../');

dotenv.config({ path: path.join(rootDir, '.env') });

export const config = {
  PORT: parseInt(process.env.PORT || '3000', 10),
  NODE_ENV: process.env.NODE_ENV || 'development',
  SESSION_SECRET: process.env.SESSION_SECRET || 'sentinel-dev-secret-key-32-chars-minimum-needed',
  APP_BASE_URL: process.env.APP_BASE_URL || 'http://localhost:3000',
  CAMPUS_TIMEZONE: process.env.CAMPUS_TIMEZONE || 'Asia/Kolkata',
  MAX_AUDIO_MB: parseInt(process.env.MAX_AUDIO_MB || '25', 10),
  MAX_EVIDENCE_MB: parseInt(process.env.MAX_EVIDENCE_MB || '50', 10),
  ALLOWED_EVIDENCE_TYPES: (process.env.ALLOWED_EVIDENCE_TYPES || 
    'image/jpeg,image/png,image/webp,video/mp4,video/webm,audio/mpeg,audio/webm,audio/mp4,audio/wav,application/pdf'
  ).split(','),
  WHATSAPP_RECIPIENT_RAW: process.env.WHATSAPP_RECIPIENT_RAW || '7708704229',
  WHATSAPP_DEFAULT_COUNTRY_CODE: process.env.WHATSAPP_DEFAULT_COUNTRY_CODE || '91',
  WHATSAPP_INCLUDE_DETAILS: (process.env.WHATSAPP_INCLUDE_DETAILS !== 'false'), // default true for demo
  WHATSAPP_INCLUDE_PHONE: (process.env.WHATSAPP_INCLUDE_PHONE === 'true'),
  AUDIO_LINK_ENABLED: (process.env.AUDIO_LINK_ENABLED !== 'false'),
  AUDIO_LINK_TTL_HOURS: parseInt(process.env.AUDIO_LINK_TTL_HOURS || '24', 10),
  AUDIO_LINK_MAX_PLAYS: parseInt(process.env.AUDIO_LINK_MAX_PLAYS || '5', 10),
  SEED_DEMO_DATA: (process.env.SEED_DEMO_DATA !== 'false'),
  DATA_DIR: path.join(rootDir, 'data'),
  STORAGE_DIR: path.join(rootDir, 'storage'),
  ROOT_DIR: rootDir
};
