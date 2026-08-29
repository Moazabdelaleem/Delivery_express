const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/db');

// Check Username Availability (Real-Time API)
exports.checkUsernameAvailability = async (req, res) => {
  try {
    const { username } = req.params;
    if (!username || username.trim().length < 3) {
      return res.json({ available: false, reason: 'Username must be at least 3 characters.' });
    }

    const cleanUsername = String(username).toLowerCase().trim();
    const result = await db.query('SELECT id FROM users WHERE LOWER(username) = $1', [cleanUsername]);

    if (result.rows.length > 0) {
      return res.json({ available: false, reason: 'Username is taken.' });
    }

    return res.json({ available: true, reason: 'Username is available.' });
  } catch (err) {
    console.error('Check username error:', err);
    res.status(500).json({ error: 'Server error checking username.' });
  }
};

// Registration (Username + Name + Password + Role + Phone)
exports.register = async (req, res) => {
  try {
    const { username, name, password, role, phone } = req.body;

    if (!username || !name || !password || !role) {
      return res.status(400).json({ error: 'Username, full name, password, and role are required.' });
    }

    const cleanUsername = String(username).toLowerCase().trim();
    if (cleanUsername.length < 3 || !/^[a-zA-Z0-9._-]+$/.test(cleanUsername)) {
      return res.status(400).json({ error: 'Username must be at least 3 characters and contain only letters, numbers, underscores, or dashes.' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
    }

    const validRoles = ['delivery_guy', 'supervisor', 'inventory', 'finance', 'manager'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ error: `Invalid role. Must be one of: ${validRoles.join(', ')}` });
    }

    const cleanEmail = (req.body.email && req.body.email.trim())
      ? req.body.email.trim().toLowerCase()
      : `${cleanUsername}@delivery.com`;

    const existingUser = await db.query('SELECT id FROM users WHERE LOWER(username) = $1', [cleanUsername]);
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'Username is already taken. Please choose a unique username.' });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // Every new account starts unapproved (requires manager approval)
    const isApproved = false;

    const result = await db.query(
      `INSERT INTO users (username, name, email, password_hash, role, phone, is_approved)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, username, name, email, role, online_status, phone, is_approved, created_at`,
      [cleanUsername, name.trim(), cleanEmail, passwordHash, role, phone || null, isApproved]
    );

    const newUser = result.rows[0];

    // Auto-create wallets for Delivery Guys (starts at 0.00 allowance)
    if (role === 'delivery_guy') {
      await db.query(`INSERT INTO collection_wallets (delivery_guy_id) VALUES ($1) ON CONFLICT DO NOTHING`, [newUser.id]);
      await db.query(`INSERT INTO pocket_wallets (delivery_guy_id) VALUES ($1) ON CONFLICT DO NOTHING`, [newUser.id]);
      await db.query(
        `UPDATE pocket_wallets SET current_balance = 0.00, total_topped_up = 0.00, total_spent = 0.00 WHERE delivery_guy_id = $1`,
        [newUser.id]
      );
    }

    return res.status(201).json({
      message: 'Account registration submitted! Pending approval from an Executive Manager.',
      requiresApproval: true,
      user: { id: newUser.id, username: newUser.username, name: newUser.name, role: newUser.role }
    });

  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ error: 'Server error during registration.' });
  }
};

// Login strictly by Username
exports.login = async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required.' });
    }

    const cleanUsername = String(username).toLowerCase().trim();
    const result = await db.query('SELECT * FROM users WHERE LOWER(username) = $1', [cleanUsername]);

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    const user = result.rows[0];
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    // Block unapproved accounts for any role
    const isUserApproved = user.is_approved === true || user.is_approved === 't' || user.is_approved === 'true' || user.is_approved == 1;
    if (!isUserApproved) {
      return res.status(403).json({
        error: 'Account is pending approval. Access will be granted once approved by an Executive Manager.',
        requiresApproval: true
      });
    }

    const secret = process.env.JWT_SECRET;
    const tokenExpiry = user.role === 'delivery_guy' ? '7d' : '12h';
    const token = jwt.sign(
      { id: user.id, username: user.username, name: user.name, role: user.role },
      secret,
      { expiresIn: tokenExpiry }
    );


    res.json({
      message: 'Login successful.',
      token,
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        role: user.role,
        online_status: user.online_status,
        phone: user.phone
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error during login.' });
  }
};

// Get Pending Users across all roles for Executive Approval
exports.getPendingUsers = async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, username, name, role, phone, is_approved, created_at
       FROM users
       ORDER BY created_at DESC`
    );
    const pendingList = result.rows.filter(
      u => u.username !== 'tarek_manager' &&
           (u.is_approved === false || u.is_approved === 'f' || u.is_approved === 'false' || u.is_approved == 0 || !u.is_approved)
    );
    res.json(pendingList);
  } catch (err) {
    console.error('Error fetching pending users:', err);
    res.status(500).json({ error: 'Failed to fetch pending user accounts.' });
  }
};

// Approve User Account
exports.approveUser = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query(
      `UPDATE users SET is_approved = true WHERE id = $1 RETURNING id, username, name, role`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Pending user account not found.' });
    }

    res.json({ message: 'User account approved successfully!', user: result.rows[0] });
  } catch (err) {
    console.error('Error approving user:', err);
    res.status(500).json({ error: 'Failed to approve user account.' });
  }
};

// Reject User Account
exports.rejectUser = async (req, res) => {
  try {
    const { id } = req.params;
    const cleanId = parseInt(id, 10) || id;
    await db.query(`DELETE FROM users WHERE id = $1`, [cleanId]);
    res.json({ message: 'Pending user account rejected and removed.' });
  } catch (err) {
    console.error('Error rejecting user:', err);
    res.status(500).json({ error: 'Failed to reject user account.' });
  }
};

// Toggle Online Status
exports.updateOnlineStatus = async (req, res) => {
  try {
    const status = req.body.status || req.body.online_status;
    if (!['online', 'offline'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status. Must be online or offline.' });
    }

    const result = await db.query(
      `UPDATE users SET online_status = $1, updated_at = NOW() WHERE id = $2 RETURNING id, name, online_status`,
      [status, req.user.id]
    );

    const io = req.app.get('io');
    if (io) {
      io.emit('online_status_changed', { id: req.user.id, status });
    }

    res.json({ message: 'Online status updated.', user: result.rows[0] });
  } catch (err) {
    console.error('Error updating status:', err);
    res.status(500).json({ error: 'Failed to update online status.' });
  }
};

// Get Users by Role
exports.getUsersByRole = async (req, res) => {
  try {
    const { role } = req.params;
    const cleanRole = String(role).toLowerCase().trim();
    const result = await db.query(
      `SELECT id, username, name, role, online_status, phone FROM users WHERE LOWER(TRIM(role)) = $1 AND is_approved = true ORDER BY name ASC`,
      [cleanRole]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching users by role:', err);
    res.status(500).json({ error: 'Failed to fetch users.' });
  }
};

// Seed Default Demo Accounts (Disabled in Production)
exports.seedDemoAccounts = async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    if (res) {
      return res.status(403).json({ error: 'Access Forbidden: Seeding demo accounts is disabled in production.' });
    }
    console.warn('⚠️ Seeding demo accounts skipped in production mode.');
    return;
  }

  try {

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash('Admin123!', salt);

    const demoUsers = [
      { username: 'sami_delivery', name: 'Sami Delivery', role: 'delivery_guy', email: 'sami@delivery.com', phone: '01012345678' },
      { username: 'kareem_supervisor', name: 'Kareem Supervisor', role: 'supervisor', email: 'kareem@delivery.com', phone: '01023456789' },
      { username: 'hassan_inventory', name: 'Hassan Inventory', role: 'inventory', email: 'hassan@delivery.com', phone: '01034567890' },
      { username: 'mona_finance', name: 'Mona Finance', role: 'finance', email: 'mona@delivery.com', phone: '01045678901' },
      { username: 'tarek_manager', name: 'Tarek Manager', role: 'manager', email: 'tarek@delivery.com', phone: '01056789012' },
      { username: 'omar_executive', name: 'Omar Executive', role: 'manager', email: 'omar@delivery.com', phone: '01067890123' },
    ];

    const seededUsers = [];

    for (const u of demoUsers) {
      const existing = await db.query('SELECT id FROM users WHERE LOWER(username) = $1', [u.username]);
      let userId;
      if (existing.rows.length > 0) {
        userId = existing.rows[0].id;
        await db.query(
          `UPDATE users SET name = $1, password_hash = $2, role = $3, is_approved = true, phone = $5, email = $6 WHERE id = $4`,
          [u.name, passwordHash, u.role, userId, u.phone, u.email]
        );
      } else {
        const ins = await db.query(
          `INSERT INTO users (username, name, email, password_hash, role, phone, is_approved)
           VALUES ($1, $2, $3, $4, $5, $6, true)
           RETURNING id`,
          [u.username, u.name, u.email, passwordHash, u.role, u.phone]
        );
        userId = ins.rows[0].id;
      }


      if (u.role === 'delivery_guy') {
        await db.query(`INSERT INTO collection_wallets (delivery_guy_id) VALUES ($1) ON CONFLICT DO NOTHING`, [userId]);
        await db.query(`INSERT INTO pocket_wallets (delivery_guy_id, current_balance, total_topped_up, total_spent) VALUES ($1, 50.00, 50.00, 0.00) ON CONFLICT DO NOTHING`, [userId]);
      }

      seededUsers.push(u.username);
    }

    const message = `Demo accounts seeded & approved successfully: ${seededUsers.join(', ')}`;
    if (res) {
      return res.status(200).json({ message, seededUsers });
    }
    console.log(`✅ ${message}`);
  } catch (err) {
    console.error('Seed demo accounts error:', err);
    if (res) {
      return res.status(500).json({ error: 'Failed to seed demo accounts.' });
    }
  }
};

// Register or Update User Expo Push Token (POST /api/users/push-token)
exports.savePushToken = async (req, res) => {
  try {
    const { push_token } = req.body;
    if (!push_token || typeof push_token !== 'string') {
      return res.status(400).json({ error: 'Valid push_token string is required.' });
    }

    await db.query(
      'UPDATE users SET push_token = $1, updated_at = NOW() WHERE id = $2',
      [push_token.trim(), req.user.id]
    );

    res.json({ message: 'Push token saved successfully.', push_token: push_token.trim() });
  } catch (err) {
    console.error('Error saving push token:', err);
    res.status(500).json({ error: err.message || 'Server error saving push token.' });
  }
};

