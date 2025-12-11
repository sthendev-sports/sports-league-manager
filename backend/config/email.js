// backend/config/email.js
const nodemailer = require('nodemailer');

const host = process.env.EMAIL_HOST || 'smtp.gmail.com';
const port = Number(process.env.EMAIL_PORT) || 465;
const secure =
  process.env.EMAIL_SECURE !== undefined
    ? process.env.EMAIL_SECURE === 'true'
    : true;

const user = process.env.EMAIL_USER;
const pass = process.env.EMAIL_PASS;

if (!user || !pass) {
  console.warn(
    '[Email] EMAIL_USER or EMAIL_PASS is not set. Email sending will fail until configured.'
  );
}

const transporter = nodemailer.createTransport({
  host,
  port,
  secure,
  auth: {
    user,
    pass,
  },
});

// Optional: verify on startup
transporter.verify((error, success) => {
  if (error) {
    console.warn('[Email] Transporter verification failed:', error.message);
  } else {
    console.log('[Email] Transporter is ready to send messages');
  }
});

module.exports = {
  transporter,
};
