// backend/routes/users.js

const express = require('express');
const bcrypt = require('bcryptjs');
const supabase = require('../config/database');
const { authMiddleware, requireRole } = require('../middleware/auth');
const { ROLES } = require('../config/roles');

const router = express.Router();

// All routes in here require authentication
router.use(authMiddleware);

// Helper: strip password_hash from user object
function sanitizeUser(user) {
  if (!user) return null;
  const { password_hash, ...rest } = user;
  return rest;
}

/**
 * GET /api/users
 * List all users (Admin / President only)
 */
router.get(
  '/',
  requireRole(ROLES.ADMINISTRATOR, ROLES.PRESIDENT),
  async (req, res) => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, email, name, role, created_at')
        .order('created_at', { ascending: true });

      if (error) {
        console.error('Supabase error loading users:', error);
        return res.status(500).json({ error: 'Failed to load users' });
      }

      return res.json(data || []);
    } catch (err) {
      console.error('Error in GET /api/users:', err);
      return res.status(500).json({ error: 'Failed to load users' });
    }
  }
);

/**
 * POST /api/users
 * Create a new user (Admin / President only)
 * Body: { name, email, password, role }
 */
router.post(
  '/',
  requireRole(ROLES.ADMINISTRATOR, ROLES.PRESIDENT),
  async (req, res) => {
    try {
      const { name, email, password, role } = req.body || {};

      if (!name || !email || !password || !role) {
        return res
          .status(400)
          .json({ error: 'Name, email, password, and role are required' });
      }

      // Validate role matches one of our known roles
      const allowedRoles = Object.values(ROLES);
      if (!allowedRoles.includes(role)) {
        return res.status(400).json({
          error: `Invalid role. Must be one of: ${allowedRoles.join(', ')}`,
        });
      }

      // Check if email already exists
      const { data: existing, error: existingError } = await supabase
        .from('users')
        .select('id')
        .eq('email', email)
        .maybeSingle();

      if (existingError) {
        console.error('Supabase error checking existing user:', existingError);
      }

      if (existing) {
        return res
          .status(409)
          .json({ error: 'A user with this email already exists' });
      }

      // Hash password
      const password_hash = await bcrypt.hash(password, 10);

      // Insert user
      const { data, error } = await supabase
        .from('users')
        .insert([
          {
            name,
            email,
            password_hash,
            role,
          },
        ])
        .select('id, email, name, role, created_at')
        .single();

      if (error) {
        console.error('Supabase error creating user:', error);
        return res.status(500).json({ error: 'Failed to create user' });
      }

      return res.status(201).json(sanitizeUser(data));
    } catch (err) {
      console.error('Error in POST /api/users:', err);
      return res.status(500).json({ error: 'Failed to create user' });
    }
  }
);

/**
 * DELETE /api/users/:id
 * Delete a user (Admin / President only)
 * - Prevent deleting yourself by accident
 */
router.delete(
  '/:id',
  requireRole(ROLES.ADMINISTRATOR, ROLES.PRESIDENT),
  async (req, res) => {
    try {
      const { id } = req.params;

      if (!id) {
        return res.status(400).json({ error: 'User id is required' });
      }

      // Prevent deleting your own account
      if (req.user && req.user.id === id) {
        return res
          .status(400)
          .json({ error: 'You cannot delete your own account' });
      }

      const { error } = await supabase.from('users').delete().eq('id', id);

      if (error) {
        console.error('Supabase error deleting user:', error);
        return res.status(500).json({ error: 'Failed to delete user' });
      }

      return res.json({ success: true });
    } catch (err) {
      console.error('Error in DELETE /api/users/:id:', err);
      return res.status(500).json({ error: 'Failed to delete user' });
    }
  }
);

module.exports = router;
