import { db } from '../db/index.js';

export function isTimeInOperatingWindow(dateObj, operatingFrom, operatingTo) {
  // operatingFrom and operatingTo are 'HH:MM' strings e.g. '06:00' and '22:00'
  const timeMinutes = dateObj.getHours() * 60 + dateObj.getMinutes();
  const [fromH, fromM] = operatingFrom.split(':').map(Number);
  const [toH, toM] = operatingTo.split(':').map(Number);
  const startMin = fromH * 60 + fromM;
  const endMin = toH * 60 + toM;

  if (startMin <= endMin) {
    return timeMinutes >= startMin && timeMinutes <= endMin;
  }
  // Overnight window e.g. 20:00 to 06:00
  return timeMinutes >= startMin || timeMinutes <= endMin;
}

export function locateMatchingCameras(locationId, incidentAt) {
  const incidentDate = new Date(incidentAt);
  const now = new Date();

  // Fetch campus location
  const loc = db.prepare('SELECT * FROM campus_locations WHERE id = ?').get(locationId);
  if (!loc) return [];

  // Fetch all cameras
  const cameras = db.prepare(`
    SELECT c.*, l.name as primary_loc_name, l.zone as primary_zone
    FROM cameras c
    LEFT JOIN campus_locations l ON c.location_id = l.id
  `).all();

  const results = [];

  for (const cam of cameras) {
    let zones = [];
    try {
      zones = JSON.parse(cam.coverage_zones);
    } catch {
      zones = [cam.coverage_zones];
    }

    // Check spatial match: camera location matches, or coverage zones include the location zone or name
    const matchesLocationId = cam.location_id === Number(locationId);
    const matchesZone = zones.some(z => 
      z.toLowerCase() === loc.zone.toLowerCase() || 
      z.toLowerCase() === loc.name.toLowerCase()
    );

    if (!matchesLocationId && !matchesZone) {
      continue;
    }

    // Temporal check: retention window
    const retentionHours = cam.retention_hours || 72;
    const expirationDate = new Date(incidentDate.getTime() + retentionHours * 60 * 60 * 1000);
    const withinRetention = expirationDate > now;

    // Temporal check: operating time window
    const inOperatingWindow = isTimeInOperatingWindow(incidentDate, cam.operating_from, cam.operating_to);

    // Determine status & honest reasoning
    let status = 'Likely available';
    let reasoning = [];

    if (cam.verification_status === 'offline') {
      status = 'Camera offline';
      reasoning.push('Camera is currently reported offline for maintenance.');
    } else if (cam.verification_status === 'unverified') {
      status = 'Unverified camera';
      reasoning.push('Camera feed health has not been verified by security administration.');
    } else if (!withinRetention) {
      status = 'Footage may be overwritten';
      reasoning.push(`Retention period of ${retentionHours} hours expired on ${expirationDate.toLocaleString('en-GB')}.`);
    } else if (!inOperatingWindow) {
      status = 'Outside operating window';
      reasoning.push(`Incident occurred outside operating hours (${cam.operating_from} - ${cam.operating_to}).`);
    } else {
      status = 'Likely available';
      reasoning.push(`Within operating window (${cam.operating_from} - ${cam.operating_to}) and active retention period (${retentionHours}h).`);
    }

    results.push({
      id: cam.id,
      cameraCode: cam.camera_code,
      label: cam.label,
      coverageZones: zones,
      coverageDescription: cam.coverage_description,
      operatingHours: `${cam.operating_from} - ${cam.operating_to}`,
      retentionHours: cam.retention_hours,
      verificationStatus: cam.verification_status,
      isFictional: Boolean(cam.is_fictional),
      availabilityStatus: status,
      reasoning: reasoning.join(' '),
      preservationDeadline: expirationDate.toISOString()
    });
  }

  return results;
}
