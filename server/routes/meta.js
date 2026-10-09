import express from 'express';
import { db } from '../db/index.js';

const router = express.Router();

router.get('/departments', (req, res) => {
  const departments = db.prepare('SELECT id, code, name FROM departments ORDER BY name ASC').all();
  res.json({ departments });
});

router.get('/locations', (req, res) => {
  const locations = db.prepare('SELECT id, name, building, zone, active FROM campus_locations WHERE active = 1 ORDER BY zone, name ASC').all();
  res.json({ locations });
});

export default router;
