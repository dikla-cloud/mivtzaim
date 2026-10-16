// חשבונות משתמש: סיסמאות מוצפנות (scrypt) וחיבורים לפי מכשיר
const crypto = require('crypto');
const db = require('./db');

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  return { salt, hash: crypto.scryptSync(String(password), salt, 64).toString('hex') };
}

function checkPassword(pass, password) {
  if (!pass) return false;
  const h = crypto.scryptSync(String(password), pass.salt, 64);
  return crypto.timingSafeEqual(h, Buffer.from(pass.hash, 'hex'));
}

function validPassword(p) {
  return typeof p === 'string' && p.length >= 6 && p.length <= 100;
}

function validName(n) {
  return typeof n === 'string' && n.trim().length >= 2 && n.trim().length <= 30;
}

function newSession(u) {
  const token = crypto.randomBytes(32).toString('hex');
  db.get().sessions[token] = db.userKey(u.name);
  db.save();
  return token;
}

function sessionUser(token) {
  const key = token && db.get().sessions[token];
  return key ? db.get().users[key] || null : null;
}

// מנתק את כל המכשירים של המשתמש, חוץ מהמכשיר הנוכחי (אם צוין)
function dropSessions(u, keep) {
  const d = db.get();
  const key = db.userKey(u.name);
  for (const [t, k] of Object.entries(d.sessions)) if (k === key && t !== keep) delete d.sessions[t];
}

// כניסה. בפעם הראשונה (אין עדיין משתמשים) – החשבון הראשון נוצר כמנהל.
// אם הוגדר APP_TOKEN בהתקנה, הוא הסיסמה הראשונית של המנהל.
function login(name, password) {
  const d = db.get();
  if (!validName(name) || typeof password !== 'string') return null;
  if (!db.users().length) {
    const initial = process.env.APP_TOKEN;
    if (initial ? password !== initial : !validPassword(password)) return null;
    const u = db.newUser(name, { ...(d.legacy || {}), admin: true, pass: hashPassword(password) });
    delete d.legacy;
    db.save();
    return u;
  }
  const u = d.users[db.userKey(name)];
  return u && checkPassword(u.pass, password) ? u : null;
}

module.exports = { hashPassword, checkPassword, validPassword, validName, newSession, sessionUser, dropSessions, login };
