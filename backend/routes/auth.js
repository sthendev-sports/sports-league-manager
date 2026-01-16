// backend/routes/auth.js

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto'); // Add this import
const supabase = require('../config/database');
const { getPermissionsForRole } = require('../services/rolePermissions');
const { authMiddleware } = require('../middleware/auth');
const { ROLES } = require('../config/roles');
const { sendEmail } = require('../services/emailService'); // Add this import

const router = express.Router();

// In-memory OTP store for user password resets
const userPasswordResetOtps = new Map(); // email => { hash, expiresAt, attempts }

function generateOtp() {
  return crypto.randomInt(0, 1000000).toString().padStart(6, '0');
}

function hashOtp(code) {
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

async function getScopedDivisionIdsForUser(user) {
  try {
    if (!user?.email) return [];
    // Divisions table stores player_agent_email for assignment in Configuration -> Divisions
    const { data, error } = await supabase
      .from('divisions')
      .select('id')
      .eq('player_agent_email', user.email);

    if (error) {
      console.warn('Could not load scoped divisions for user:', error);
      return [];
    }
    return (data || []).map((d) => d.id);
  } catch (e) {
    console.warn('Could not load scoped divisions for user:', e);
    return [];
  }
}


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

    const permissions = await getPermissionsForRole(payload.role);
    const scoped_division_ids = permissions?.__scope__?.divisions === 'assigned'
      ? await getScopedDivisionIdsForUser(payload)
      : [];

    return res.json({
      token,
      user: { ...payload, permissions, scoped_division_ids },
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
    const permissions = await getPermissionsForRole(req.user.role);
    const scoped_division_ids = permissions?.__scope__?.divisions === 'assigned'
      ? await getScopedDivisionIdsForUser(req.user)
      : [];

    return res.json({
      user: { ...req.user, permissions, scoped_division_ids },
    });
  } catch (err) {
    console.error('Error in /api/auth/me:', err);
    return res.status(500).json({ error: 'Failed to load current user' });
  }
});

/**
 * POST /api/auth/forgot-password
 * Body: { email }
 * Send verification code to user's email for password reset
 */
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body || {};
    
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    // Check if user exists
    const { data: user, error } = await supabase
      .from('users')
      .select('id, email, name')
      .eq('email', email)
      .maybeSingle();

    if (error) {
      console.error('Supabase error checking user:', error);
      return res.status(500).json({ error: 'Failed to check user' });
    }

    // Don't reveal if user doesn't exist (security best practice)
    if (!user) {
      return res.json({ 
        success: true, 
        message: 'If an account exists with this email, a verification code has been sent.' 
      });
    }

    const code = generateOtp();
    const key = email.toLowerCase();

    userPasswordResetOtps.set(key, {
      hash: hashOtp(code),
      expiresAt: Date.now() + 10 * 60 * 1000, // 10 minutes
      attempts: 0,
      userId: user.id,
    });

    // Send email with verification code
    await sendEmail({
      to: email,
      subject: 'Password Reset Verification Code',
      text:
        `Hello ${user.name},\n\n` +
        `You requested a password reset for your Sports League Manager account.\n` +
        `Verification code: ${code}\n\n` +
        `This code expires in 10 minutes. If you did not request this, please ignore this email.\n\n` +
        `Thank you,\n` +
        `Sports League Manager Team`,
    });

    return res.json({ 
      success: true, 
      message: 'Verification code sent to your email.' 
    });
  } catch (err) {
    console.error('Error in POST /api/auth/forgot-password:', err);
    return res.status(500).json({ error: 'Failed to process request' });
  }
});

/**
 * POST /api/auth/verify-reset-code
 * Body: { email, code }
 * Verify the reset code sent to user's email
 */
router.post('/verify-reset-code', async (req, res) => {
  try {
    const { email, code } = req.body || {};
    
    if (!email || !code) {
      return res.status(400).json({ error: 'Email and code are required' });
    }

    const key = email.toLowerCase();
    const record = userPasswordResetOtps.get(key);

    if (!record) {
      return res.status(400).json({ error: 'No pending password reset request for this email' });
    }

    if (Date.now() > record.expiresAt) {
      userPasswordResetOtps.delete(key);
      return res.status(400).json({ error: 'Verification code expired. Please request a new code.' });
    }

    record.attempts = (record.attempts || 0) + 1;
    if (record.attempts > 5) {
      userPasswordResetOtps.delete(key);
      return res.status(429).json({ error: 'Too many attempts. Please request a new code.' });
    }

    const ok = safeEqualHex(hashOtp(String(code).trim()), record.hash);
    if (!ok) {
      userPasswordResetOtps.set(key, record);
      return res.status(400).json({ error: 'Invalid verification code' });
    }

    // Code is valid - mark as verified
    record.verified = true;
    userPasswordResetOtps.set(key, record);

    return res.json({ success: true });
  } catch (err) {
    console.error('Error in POST /api/auth/verify-reset-code:', err);
    return res.status(500).json({ error: 'Failed to verify code' });
  }
});

/**
 * POST /api/auth/reset-password
 * Body: { email, code, new_password }
 * Reset password with verified code
 */
router.post('/reset-password', async (req, res) => {
  try {
    const { email, code, new_password } = req.body || {};
    
    if (!email || !code || !new_password) {
      return res.status(400).json({ error: 'Email, code, and new password are required' });
    }

    if (new_password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    const key = email.toLowerCase();
    const record = userPasswordResetOtps.get(key);

    if (!record) {
      return res.status(400).json({ error: 'No pending password reset request' });
    }

    if (Date.now() > record.expiresAt) {
      userPasswordResetOtps.delete(key);
      return res.status(400).json({ error: 'Verification code expired. Please start over.' });
    }

    // Verify code again
    const ok = safeEqualHex(hashOtp(String(code).trim()), record.hash);
    if (!ok) {
      return res.status(400).json({ error: 'Invalid verification code' });
    }

    // Hash new password
    const password_hash = await bcrypt.hash(String(new_password), 10);

    // Update password in database
    const { error: updateError } = await supabase
      .from('users')
      .update({ password_hash })
      .eq('id', record.userId);

    if (updateError) {
      console.error('Supabase error updating password:', updateError);
      return res.status(500).json({ error: 'Failed to update password' });
    }

    // Clear OTP after successful reset
    userPasswordResetOtps.delete(key);

    return res.json({ success: true });
  } catch (err) {
    console.error('Error in POST /api/auth/reset-password:', err);
    return res.status(500).json({ error: 'Failed to reset password' });
  }
});

module.exports = router;