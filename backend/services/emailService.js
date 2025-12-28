// backend/services/emailService.js

const supabase = require('../config/database');
const { sendMail } = require('../config/email');

const DEFAULT_FROM =
  process.env.EMAIL_FROM || process.env.EMAIL_USER || 'no-reply@example.com';

async function getEmailSettings() {
  const { data, error } = await supabase
    .from('email_settings')
    .select('*')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('[EmailSettings] Error loading email_settings:', error);
  }

  if (!data) {
    return {
      test_mode: false,
      test_email: null,
      from_email: DEFAULT_FROM,
    };
  }

  return {
    test_mode: data.test_mode ?? false,
    test_email: data.test_email || null,
    from_email: data.from_email || DEFAULT_FROM,
    id: data.id,
  };
}

async function saveEmailSettings({ test_mode, test_email, from_email }) {
  const current = await getEmailSettings();

  const payload = {
    test_mode: !!test_mode,
    test_email: test_email || null,
    from_email: from_email || DEFAULT_FROM,
  };

  if (current.id) {
    const { data, error } = await supabase
      .from('email_settings')
      .update({
        ...payload,
        updated_at: new Date().toISOString(),
      })
      .eq('id', current.id)
      .select('*')
      .single();

    if (error) {
      console.error('[EmailSettings] Error updating email_settings:', error);
      throw new Error('Failed to update email settings');
    }
    return data;
  }

  const { data, error } = await supabase
    .from('email_settings')
    .insert([{ ...payload }])
    .select('*')
    .single();

  if (error) {
    console.error('[EmailSettings] Error inserting email_settings:', error);
    throw new Error('Failed to save email settings');
  }

  return data;
}

async function sendEmail({ to, subject, text, html }) {
  const settings = await getEmailSettings();

  let finalTo = to;
  let finalSubject = subject;
  let note = '';

  if (settings.test_mode && settings.test_email) {
    note = `\n\n[TEST MODE] Original recipient(s): ${
      Array.isArray(to) ? to.join(', ') : to
    }`;
    finalTo = settings.test_email;
    finalSubject = `[TEST MODE] ${subject}`;
  }

  const from = settings.from_email || DEFAULT_FROM;

  const mailOptions = {
    from,
    to: finalTo,
    subject: finalSubject,
    text: text ? text + note : note || undefined,
    html: html
      ? `${html}${
          note
            ? `<hr /><p style="font-size:12px;color:#6b7280;">${note
                .replace('\n', '<br />')
                .replace('\n', '<br />')}</p>`
            : ''
        }`
      : undefined,
  };

  try {
    // ✅ Use config/email.js implementation
    const info = await sendMail({
      to: mailOptions.to,
      subject: mailOptions.subject,
      html: mailOptions.html,
      text: mailOptions.text,
      replyTo: mailOptions.replyTo,
    });

    console.log(`[Email] Sent message to ${finalTo}`);
    return info;
  } catch (err) {
    console.error('[Email] Error sending message:', err);
    throw err;
  }
}

module.exports = {
  getEmailSettings,
  saveEmailSettings,
  sendEmail,
};
