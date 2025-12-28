const nodemailer = require('nodemailer');

function envBool(v) {
  return String(v || '').toLowerCase() === 'true';
}

const EMAIL_USER = process.env.EMAIL_USER || '';
const EMAIL_PASSWORD = process.env.EMAIL_PASSWORD || '';
const EMAIL_FROM = process.env.EMAIL_FROM || EMAIL_USER;

const EMAIL_TEST_MODE = envBool(process.env.EMAIL_TEST_MODE);
const EMAIL_TEST_RECIPIENT = process.env.EMAIL_TEST_RECIPIENT || '';

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  if (!EMAIL_USER || !EMAIL_PASSWORD) {
    console.warn('[Email] Missing EMAIL_USER or EMAIL_PASSWORD. Email sending disabled.');
    return null;
  }

  transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: EMAIL_USER,
      pass: EMAIL_PASSWORD,
    },
  });

  transporter.verify()
    .then(() => console.log('[Email] Transporter is ready to send messages'))
    .catch((err) => console.warn('[Email] Transporter verify failed:', err.message));

  return transporter;
}

function resolveRecipient(realTo) {
  if (EMAIL_TEST_MODE) {
    if (!EMAIL_TEST_RECIPIENT) {
      throw new Error('EMAIL_TEST_MODE=true but EMAIL_TEST_RECIPIENT is empty');
    }
    return {
      to: EMAIL_TEST_RECIPIENT,
      note: `TEST MODE: original recipient was ${realTo || '(none)'}`,
    };
  }

  return { to: realTo, note: null };
}

async function sendMail({ to, subject, html, text, replyTo }) {
  const tx = getTransporter();
  if (!tx) {
    throw new Error('Email transporter not configured. Set EMAIL_USER and EMAIL_PASSWORD.');
  }

  const resolved = resolveRecipient(to);

  const finalSubject = EMAIL_TEST_MODE
    ? `[TEST] ${subject}`
    : subject;

  const finalHtml = resolved.note
    ? `<div style="padding:10px;border:1px solid #f59e0b;background:#fffbeb;color:#92400e;margin-bottom:12px;font-family:Arial,sans-serif;font-size:12px;">
         <strong>${resolved.note}</strong>
       </div>${html}`
    : html;

  const mailOptions = {
    from: EMAIL_FROM,
    to: resolved.to,
    subject: finalSubject,
    html: finalHtml,
    text,
  };

  if (replyTo) mailOptions.replyTo = replyTo;

  return tx.sendMail(mailOptions);
}

module.exports = {
  sendMail,
  EMAIL_TEST_MODE,
  EMAIL_TEST_RECIPIENT,
};
