// backend/config/email.js
// Gmail API (HTTPS) sender for Render free tier (no SMTP ports)

const { google } = require("googleapis");

function envBool(v) {
  return String(v || "").toLowerCase() === "true";
}

const EMAIL_TEST_MODE = envBool(process.env.EMAIL_TEST_MODE);
const EMAIL_TEST_RECIPIENT = process.env.EMAIL_TEST_RECIPIENT || "";

// Gmail API OAuth
const GMAIL_CLIENT_ID = process.env.GMAIL_CLIENT_ID || "";
const GMAIL_CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET || "";
const GMAIL_REFRESH_TOKEN = process.env.GMAIL_REFRESH_TOKEN || "";

// Sender address (must be the Gmail account you authorized)
const GMAIL_SENDER = process.env.GMAIL_SENDER || process.env.EMAIL_USER || "";
const EMAIL_FROM = process.env.EMAIL_FROM || GMAIL_SENDER;

function requireGmailApiConfig() {
  const missing = [];
  if (!GMAIL_CLIENT_ID) missing.push("GMAIL_CLIENT_ID");
  if (!GMAIL_CLIENT_SECRET) missing.push("GMAIL_CLIENT_SECRET");
  if (!GMAIL_REFRESH_TOKEN) missing.push("GMAIL_REFRESH_TOKEN");
  if (!GMAIL_SENDER) missing.push("GMAIL_SENDER");

  if (missing.length) {
    throw new Error(
      `Missing Gmail API env vars: ${missing.join(
        ", "
      )}. Configure them in Render Environment.`
    );
  }
}

function resolveRecipient(realTo) {
  if (!EMAIL_TEST_MODE) return realTo;

  if (!EMAIL_TEST_RECIPIENT) {
    throw new Error("EMAIL_TEST_MODE=true but EMAIL_TEST_RECIPIENT is not set.");
  }
  return EMAIL_TEST_RECIPIENT;
}

// Build a simple RFC 2822 email with multipart/alternative if html+text provided
function buildRawMessage({ from, to, subject, text, html, replyTo }) {
  const headers = [];
  headers.push(`From: ${from}`);
  headers.push(`To: ${to}`);
  headers.push(`Subject: ${subject}`);
  headers.push("MIME-Version: 1.0");
  if (replyTo) headers.push(`Reply-To: ${replyTo}`);

  // If HTML provided, send multipart/alternative
  if (html) {
    const boundary = `----=_Part_${Date.now()}`;
    headers.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);

    const parts = [];
    // Text part (optional)
    if (text) {
      parts.push(
        `--${boundary}\r\n` +
          `Content-Type: text/plain; charset="UTF-8"\r\n` +
          `Content-Transfer-Encoding: 7bit\r\n\r\n` +
          `${text}\r\n`
      );
    }

    // HTML part
    parts.push(
      `--${boundary}\r\n` +
        `Content-Type: text/html; charset="UTF-8"\r\n` +
        `Content-Transfer-Encoding: 7bit\r\n\r\n` +
        `${html}\r\n`
    );

    parts.push(`--${boundary}--`);

    return headers.join("\r\n") + "\r\n\r\n" + parts.join("\r\n");
  }

  // Otherwise plain text
  headers.push(`Content-Type: text/plain; charset="UTF-8"`);
  return headers.join("\r\n") + "\r\n\r\n" + (text || "");
}

// base64url encode for Gmail API
function toBase64Url(str) {
  return Buffer.from(str, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function getGmailClient() {
  requireGmailApiConfig();

  const oauth2Client = new google.auth.OAuth2(
    GMAIL_CLIENT_ID,
    GMAIL_CLIENT_SECRET,
    // Redirect URI not used at runtime; only for initial token generation
    "https://developers.google.com/oauthplayground"
  );

  oauth2Client.setCredentials({ refresh_token: GMAIL_REFRESH_TOKEN });

  return google.gmail({ version: "v1", auth: oauth2Client });
}

async function sendMail({ to, subject, text, html, replyTo }) {
  const gmail = getGmailClient();

  const finalTo = resolveRecipient(to);

  const rawMessage = buildRawMessage({
    from: EMAIL_FROM,
    to: finalTo,
    subject,
    text,
    html,
    replyTo,
  });

  const raw = toBase64Url(rawMessage);

  // userId "me" sends as the authenticated user (your Gmail account)
  const res = await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw },
  });

  return res.data;
}

module.exports = {
  sendMail,
  EMAIL_TEST_MODE,
  EMAIL_TEST_RECIPIENT,
};
