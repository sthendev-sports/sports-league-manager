// backend/routes/users.js

const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const supabase = require('../config/database');
const { authMiddleware, requireRole } = require('../middleware/auth');
const { ROLES } = require('../config/roles');
const { sendEmail } = require('../services/emailService');

const router = express.Router();

// All routes in here require authentication
router.use(authMiddleware);


// In-memory OTP store for admin password resets.
// NOTE: This resets on server restart. For multi-instance deployments, store these in DB/Redis.
const passwordResetOtps = new Map(); // key => { hash, expiresAt, attempts }

function otpKey(adminId, userId) {
  return `${adminId}:${userId}`;
}

function generateOtp() {
  return crypto.randomInt(0, 1000000).toString().padStart(6, '0'); // 6-digit code
}

function hashOtp(code) {
  // Bind the code to server secret to make offline guessing harder if memory is leaked
  const secret = process.env.JWT_SECRET || '';
  return crypto.createHash('sha256').update(`${code}:${secret}`).digest('hex');
}

function safeEqualHex(a, b) {
  try {
    const abuf = Buffer.from(a, 'hex');
    const bbuf = Buffer.from(b, 'hex');
    if (abuf.length !== bbuf.length) return false;
    return crypto.timingSafeEqual(abuf, bbuf);
  } catch {
    return false;
  }
}

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

// Update a user's role (Admin only)
router.put('/:id/role', requireRole(ROLES.ADMINISTRATOR), async (req, res) => {
  try {
    const { id } = req.params;
    const { role } = req.body || {};

    if (!role) {
      return res.status(400).json({ error: 'Role is required' });
    }

    // Prevent admins from accidentally locking themselves out
    if (req.user?.id && req.user.id === id) {
      return res.status(400).json({ error: 'You cannot change your own role' });
    }

    const allowedRoles = Object.values(ROLES);
    if (!allowedRoles.includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    const { data, error } = await supabase
      .from('users')
      .update({ role })
      .eq('id', id)
      .select('id, email, name, role, created_at')
      .single();

    if (error) {
      console.error('Supabase error updating user role:', error);
      return res.status(500).json({ error: 'Failed to update user role' });
    }

    return res.json(data);
  } catch (err) {
    console.error('Error updating user role:', err);
    return res.status(500).json({ error: 'Failed to update user role' });
  }
});

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


/**
 * POST /api/users/:id/password-reset/request
 * Admin only: send a one-time code to the currently logged-in admin's email.
 * Body: { }  (no body required)
 */
router.post(
  '/:id/password-reset/request',
  requireRole(ROLES.ADMINISTRATOR),
  async (req, res) => {
    try {
      const { id: userId } = req.params;
      if (!userId) return res.status(400).json({ error: 'User id is required' });

      // Ensure target user exists
      const { data: targetUser, error: targetErr } = await supabase
        .from('users')
        .select('id, email, name, role')
        .eq('id', userId)
        .maybeSingle();

      if (targetErr) {
        console.error('Supabase error loading target user:', targetErr);
        return res.status(500).json({ error: 'Failed to load target user' });
      }
      if (!targetUser) return res.status(404).json({ error: 'User not found' });

      const adminEmail = req.user?.email;
      const adminId = req.user?.id;
      if (!adminEmail || !adminId) return res.status(401).json({ error: 'Not authenticated' });

      const code = generateOtp();
      const key = otpKey(adminId, userId);

      passwordResetOtps.set(key, {
        hash: hashOtp(code),
        expiresAt: Date.now() + 10 * 60 * 1000, // 10 minutes
        attempts: 0,
      });

      await sendEmail({
        to: adminEmail,
        subject: 'Password Reset Verification Code',
        text:
          `You requested a password reset for: ${targetUser.name} (${targetUser.email})\n` +
          `Verification code: ${code}\n\n` +
          `This code expires in 10 minutes. If you did not request this, ignore this email.`,
      });

      return res.json({ success: true, message: 'Verification code sent to administrator email' });
    } catch (err) {
      console.error('Error in POST /api/users/:id/password-reset/request:', err);
      return res.status(500).json({ error: 'Failed to start password reset' });
    }
  }
);

/**
 * POST /api/users/:id/password-reset/confirm
 * Admin only: confirm code + set new password for user.
 * Body: { code, new_password }
 */
router.post(
  '/:id/password-reset/confirm',
  requireRole(ROLES.ADMINISTRATOR),
  async (req, res) => {
    try {
      const { id: userId } = req.params;
      const { code, new_password } = req.body || {};

      if (!userId) return res.status(400).json({ error: 'User id is required' });
      if (!code || !new_password) {
        return res.status(400).json({ error: 'code and new_password are required' });
      }
      if (String(new_password).length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters' });
      }

      const adminId = req.user?.id;
      if (!adminId) return res.status(401).json({ error: 'Not authenticated' });

      const key = otpKey(adminId, userId);
      const record = passwordResetOtps.get(key);

      if (!record) {
        return res.status(400).json({ error: 'No pending password reset request for this user' });
      }

      if (Date.now() > record.expiresAt) {
        passwordResetOtps.delete(key);
        return res.status(400).json({ error: 'Verification code expired. Please request a new code.' });
      }

      record.attempts = (record.attempts || 0) + 1;
      if (record.attempts > 5) {
        passwordResetOtps.delete(key);
        return res.status(429).json({ error: 'Too many attempts. Please request a new code.' });
      }

      const ok = safeEqualHex(hashOtp(String(code).trim()), record.hash);
      if (!ok) {
        passwordResetOtps.set(key, record);
        return res.status(400).json({ error: 'Invalid verification code' });
      }

      const password_hash = await bcrypt.hash(String(new_password), 10);

      const { error: updateErr } = await supabase
        .from('users')
        .update({ password_hash })
        .eq('id', userId);

      if (updateErr) {
        console.error('Supabase error updating password:', updateErr);
        return res.status(500).json({ error: 'Failed to update password' });
      }

      passwordResetOtps.delete(key);
      return res.json({ success: true });
    } catch (err) {
      console.error('Error in POST /api/users/:id/password-reset/confirm:', err);
      return res.status(500).json({ error: 'Failed to update password' });
    }
  }
);


module.exports = router;
