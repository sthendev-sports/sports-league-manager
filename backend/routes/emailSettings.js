// backend/routes/emailSettings.js

const express = require('express');
const { authMiddleware, requireRole } = require('../middleware/auth');
const { getEmailSettings, saveEmailSettings, sendEmail } = require('../services/emailService');
const { ROLES } = require('../config/roles');

const router = express.Router();

// All routes here require authentication AND admin-like role
router.use(authMiddleware);
router.use(requireRole(ROLES.ADMINISTRATOR, ROLES.PRESIDENT));

/**
 * GET /api/email-settings
 * Returns current email settings (test mode, test email, from email)
 */
router.get('/', async (req, res) => {
  try {
    const settings = await getEmailSettings();
    return res.json({
      test_mode: settings.test_mode,
      test_email: settings.test_email,
      from_email: settings.from_email,
    });
  } catch (err) {
    console.error('Error in GET /api/email-settings:', err);
    return res.status(500).json({ error: 'Failed to load email settings' });
  }
});

/**
 * PUT /api/email-settings
 * Body: { test_mode, test_email, from_email }
 */
router.put('/', async (req, res) => {
  try {
    const { test_mode, test_email, from_email } = req.body || {};

    if (test_mode && !test_email) {
      return res.status(400).json({
        error:
          'When test mode is enabled, a test email address is required.',
      });
    }

    const updated = await saveEmailSettings({
      test_mode,
      test_email,
      from_email,
    });

    return res.json({
      test_mode: updated.test_mode,
      test_email: updated.test_email,
      from_email: updated.from_email,
    });
  } catch (err) {
    console.error('Error in PUT /api/email-settings:', err);
    return res.status(500).json({ error: 'Failed to update email settings' });
  }
});

/**
 * POST /api/email-settings/test-send
 * Quick test endpoint to verify email configuration.
 * Body: { to? } - optional override; otherwise uses test_email or current user email.
 */
router.post('/test-send', async (req, res) => {
  try {
    const settings = await getEmailSettings();
    const { to } = req.body || {};

    const target =
      to ||
      settings.test_email ||
      req.user.email; // fallback to logged-in admin

    await sendEmail({
      to: target,
      subject: 'Sports League Manager - Test Email',
      text: `This is a test email from Sports League Manager.\n\nYou are receiving this because you triggered a test send from the admin panel.`,
      html: `<p>This is a <strong>test email</strong> from Sports League Manager.</p>
             <p>You are receiving this because you triggered a test send from the admin panel.</p>`,
    });

    return res.json({ success: true });
  } catch (err) {
    console.error('Error in POST /api/email-settings/test-send:', err);
    return res.status(500).json({ error: 'Failed to send test email' });
  }
});

module.exports = router;
