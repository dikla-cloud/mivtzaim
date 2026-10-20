// שליחת מייל (קוד לשחזור סיסמה) דרך SMTP – למשל חשבון Gmail עם „סיסמת אפליקציה”, בחינם.
// ההגדרות בקובץ /etc/mivtzaim/mail.env בשרת: MAIL_USER, MAIL_PASS (ואופציונלי MAIL_HOST, MAIL_PORT, MAIL_FROM)
const nodemailer = require('nodemailer');

let transport = null;
const configured = () => Boolean(process.env.MAIL_USER && process.env.MAIL_PASS);

function get() {
  if (!configured()) return null;
  transport ||= nodemailer.createTransport({
    host: process.env.MAIL_HOST || 'smtp.gmail.com',
    port: Number(process.env.MAIL_PORT || 465),
    secure: Number(process.env.MAIL_PORT || 465) === 465,
    auth: { user: process.env.MAIL_USER, pass: process.env.MAIL_PASS },
  });
  return transport;
}

// לבדיקות: אפשר להחליף את השליחה בפונקציה
let override = null;

async function send({ to, subject, text }) {
  if (override) return override({ to, subject, text });
  const t = get();
  if (!t) throw new Error('mail-not-configured');
  await t.sendMail({ from: process.env.MAIL_FROM || process.env.MAIL_USER, to, subject, text });
}

module.exports = { send, configured: () => Boolean(override) || configured(), _setOverride: (f) => { override = f; } };
