// backend/routes/auth.js

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const supabase = require('../config/database');
const { authMiddleware } = require('../middleware/auth');
const { ROLES } = require('../config/roles');

const router = express.Router();

/**
 * POST /api/auth/login
 * Body: { email, password }
 * Response: { token, user: { id, email, name, role } }
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Look up user by email
    const { data: user, error: dbError } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .single();

    if (dbError) {
      console.error('Supabase error during login:', dbError);
    }

    if (!user) {
      // Intentionally vague message so we don't leak which emails exist
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Check password
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Basic sanity check on role value (optional but helpful)
    if (!Object.values(ROLES).includes(user.role)) {
      console.warn(`User ${user.email} has unknown role: ${user.role}`);
    }

    const payload = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    };

    const secret = process.env.JWT_SECRET;
    if (!secret) {
      console.error('JWT_SECRET is not set in environment variables');
      return res.status(500).json({ error: 'Server auth configuration error' });
    }

    const token = jwt.sign(payload, secret, {
      expiresIn: '8h', // you can adjust this
    });

    return res.json({
      token,
      user: payload,
    });
  } catch (err) {
    console.error('Error in /api/auth/login:', err);
    return res.status(500).json({ error: 'An error occurred during login' });
  }
});

/**
 * GET /api/auth/me
 * Headers: Authorization: Bearer <token>
 * Response: current user info from token
 */
router.get('/me', authMiddleware, async (req, res) => {
  try {
    // req.user is set by authMiddleware
    return res.json({
      user: req.user,
    });
  } catch (err) {
    console.error('Error in /api/auth/me:', err);
    return res.status(500).json({ error: 'Failed to load current user' });
  }
});

module.exports = router;
