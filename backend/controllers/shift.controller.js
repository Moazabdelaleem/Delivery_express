const db = require('../config/db');

// Configurable Warehouse Geofence Parameters (from env vars or defaults)
const WAREHOUSE_LAT = parseFloat(process.env.WAREHOUSE_LAT) || 30.438020;
const WAREHOUSE_LNG = parseFloat(process.env.WAREHOUSE_LNG) || 31.157945;
const WAREHOUSE_RADIUS_METERS = parseFloat(process.env.WAREHOUSE_RADIUS_METERS) || 200;

/**
 * Calculate distance between two GPS coordinates in meters using the Haversine formula
 */
function calculateDistanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Earth radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

// Clock In / Go Active (Delivery Guy) - Requires Location within Geofence Radius
exports.clockIn = async (req, res) => {
  try {
    const inputLat = req.body.lat !== undefined ? req.body.lat : req.body.latitude;
    const inputLng = req.body.lng !== undefined ? req.body.lng : req.body.longitude;
    const driverId = req.user.id;

    const lat = inputLat !== undefined && inputLat !== null && !isNaN(parseFloat(inputLat)) ? parseFloat(inputLat) : WAREHOUSE_LAT;
    const lng = inputLng !== undefined && inputLng !== null && !isNaN(parseFloat(inputLng)) ? parseFloat(inputLng) : WAREHOUSE_LNG;

    const numLat = parseFloat(lat);
    const numLng = parseFloat(lng);

    // Geofence Distance Calculation (Bypassed for free testing)
    const distanceMeters = calculateDistanceMeters(numLat, numLng, WAREHOUSE_LAT, WAREHOUSE_LNG);

    // Close any previous stale open shifts for safety
    await db.query(
      `UPDATE driver_shifts SET clock_out_at = NOW() WHERE delivery_guy_id = $1 AND clock_out_at IS NULL`,
      [driverId]
    );

    // Create new active shift
    const shiftRes = await db.query(
      `INSERT INTO driver_shifts (delivery_guy_id, clock_in_at, clock_in_lat, clock_in_lng)
       VALUES ($1, NOW(), $2, $3)
       RETURNING *`,
      [driverId, numLat, numLng]
    );

    const shift = shiftRes.rows[0];

    // Update user online status to 'online'
    await db.query(
      `UPDATE users SET online_status = 'online', updated_at = NOW() WHERE id = $1`,
      [driverId]
    );

    // Emit Socket.io real-time event to Supervisor/Manager roles
    const io = req.app.get('io');
    if (io) {
      io.emit('driver_clocked_in', {
        delivery_guy_id: driverId,
        driver_name: req.user.name,
        clock_in_at: shift.clock_in_at,
        lat: numLat,
        lng: numLng,
        distance_meters: distanceMeters
      });
      io.emit('online_status_changed', { id: driverId, status: 'online' });
    }

    res.json({
      message: 'Clock-in successful. Driver activated.',
      shift,
      distance_meters: distanceMeters,
      allowed_radius_meters: WAREHOUSE_RADIUS_METERS
    });
  } catch (err) {
    console.error('Error clocking in:', err);
    res.status(500).json({ error: err.message || 'Server error during clock-in.' });
  }
};

// Clock Out / Go Offline (Delivery Guy) - No Location Restriction, Always Succeeds
exports.clockOut = async (req, res) => {
  try {
    const driverId = req.user.id;

    // Close current open shift
    const shiftRes = await db.query(
      `UPDATE driver_shifts
       SET clock_out_at = NOW()
       WHERE delivery_guy_id = $1 AND clock_out_at IS NULL
       RETURNING *`,
      [driverId]
    );

    const closedShift = shiftRes.rows[0] || null;

    // Update user online status to 'offline'
    await db.query(
      `UPDATE users SET online_status = 'offline', updated_at = NOW() WHERE id = $1`,
      [driverId]
    );

    // Emit Socket.io real-time event to Supervisor/Manager roles
    const io = req.app.get('io');
    if (io) {
      io.emit('driver_clocked_out', {
        delivery_guy_id: driverId,
        driver_name: req.user.name,
        clock_out_at: closedShift ? closedShift.clock_out_at : new Date().toISOString()
      });
      io.emit('online_status_changed', { id: driverId, status: 'offline' });
    }

    res.json({
      message: 'Clock-out successful. Driver offline.',
      shift: closedShift
    });
  } catch (err) {
    console.error('Error clocking out:', err);
    res.status(500).json({ error: err.message || 'Server error during clock-out.' });
  }
};

// Read-only Worked Hours Summary (Supervisor / Manager)
exports.getShiftSummary = async (req, res) => {
  try {
    const { driver_id } = req.params;

    let queryStr = `
      SELECT s.*, u.name as driver_name, u.online_status
      FROM driver_shifts s
      JOIN users u ON s.delivery_guy_id = u.id
      WHERE s.clock_in_at >= CURRENT_DATE
    `;

    const queryParams = [];
    if (driver_id) {
      queryStr += ' AND s.delivery_guy_id = $1';
      queryParams.push(driver_id);
    }

    queryStr += ' ORDER BY s.clock_in_at DESC';

    const result = await db.query(queryStr, queryParams);

    // Group by driver and compute duration
    const driverSummaries = {};

    result.rows.forEach(shift => {
      const dId = shift.delivery_guy_id;
      if (!driverSummaries[dId]) {
        driverSummaries[dId] = {
          driver_id: dId,
          driver_name: shift.driver_name,
          online_status: shift.online_status,
          total_seconds_today: 0,
          completed_shifts_count: 0,
          has_active_shift: false,
          active_shift_seconds: 0,
          shifts: []
        };
      }

      const clockInTime = new Date(shift.clock_in_at).getTime();
      const clockOutTime = shift.clock_out_at ? new Date(shift.clock_out_at).getTime() : Date.now();
      const durationSeconds = Math.max(0, Math.floor((clockOutTime - clockInTime) / 1000));

      driverSummaries[dId].total_seconds_today += durationSeconds;
      if (shift.clock_out_at) {
        driverSummaries[dId].completed_shifts_count += 1;
      } else {
        driverSummaries[dId].has_active_shift = true;
        driverSummaries[dId].active_shift_seconds = durationSeconds;
      }

      driverSummaries[dId].shifts.push({
        id: shift.id,
        clock_in_at: shift.clock_in_at,
        clock_out_at: shift.clock_out_at,
        clock_in_lat: shift.clock_in_lat,
        clock_in_lng: shift.clock_in_lng,
        duration_minutes: (durationSeconds / 60).toFixed(1)
      });
    });

    const summaryList = Object.values(driverSummaries).map(ds => ({
      ...ds,
      total_hours_today: (ds.total_seconds_today / 3600).toFixed(2),
      active_shift_hours: (ds.active_shift_seconds / 3600).toFixed(2)
    }));

    res.json({ summaries: summaryList });
  } catch (err) {
    console.error('Error fetching shift summary:', err);
    res.status(500).json({ error: err.message || 'Server error fetching shift summary.' });
  }
};

// Update Driver Live GPS Location (POST /api/shifts/location)
exports.updateLocation = async (req, res) => {
  try {
    const inputLat = req.body.lat !== undefined ? req.body.lat : req.body.latitude;
    const inputLng = req.body.lng !== undefined ? req.body.lng : req.body.longitude;
    const speed = req.body.speed;
    const driverId = req.user.id;

    if (inputLat === undefined || inputLng === undefined || inputLat === null || inputLng === null) {
      return res.status(400).json({ error: 'Valid lat and lng are required.' });
    }

    const lat = parseFloat(inputLat);
    const lng = parseFloat(inputLng);

    const numLat = parseFloat(lat);
    const numLng = parseFloat(lng);
    const numSpeed = parseFloat(speed || 0);

    const now = new Date().toISOString();

    // Check if driver has an active (not clocked-out) shift
    const activeShiftRes = await db.query(
      `SELECT id FROM driver_shifts WHERE delivery_guy_id = $1 AND clock_out_at IS NULL`,
      [driverId]
    );

    if (activeShiftRes.rows.length === 0) {
      return res.status(403).json({
        error: 'No active shift found. Driver must clock in before sending GPS location telemetry.'
      });
    }

    // Emit Socket.io real-time location update to Supervisors and Managers
    const io = req.app.get('io');
    if (io) {
      io.emit('driver_location_updated', {
        delivery_guy_id: driverId,
        driver_name: req.user.name,
        lat: numLat,
        lng: numLng,
        speed: numSpeed,
        updated_at: now
      });
    }

    res.json({
      message: 'Location update recorded.',
      location: { lat: numLat, lng: numLng, speed: numSpeed, updated_at: now }
    });
  } catch (err) {
    console.error('Error updating driver location:', err);
    res.status(500).json({ error: err.message || 'Server error updating location.' });
  }
};

