const path = require('path');
const crypto = require('crypto');
const express = require('express');
const db = require('./db');
const geo = require('./geo');
const push = require('./push');
const auth = require('./auth');
const scanner = require('./scanner');

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

// ---------- כניסה ----------
const failures = new Map(); // הגנה מניחוש סיסמאות: השהיה אחרי ניסיונות כושלים

app.post('/api/login', async (req, res) => {
  const { name, password } = req.body || {};
  const key = `${req.ip}|${db.userKey(name)}`;
  const f = failures.get(key) || 0;
  if (f) await new Promise((r) => setTimeout(r, Math.min(f, 10) * 1000));
  const u = auth.login(name, password);
  if (!u) {
    failures.set(key, f + 1);
    return res.status(401).json({ error: db.users().length ? 'שם או סיסמה שגויים' : 'הסיסמה הראשונית שגויה' });
  }
  failures.delete(key);
  res.json({ token: auth.newSession(u) });
});

app.get('/api/setup', (req, res) => res.json({ firstRun: !db.users().length }));

app.use('/api', (req, res, next) => {
  req.token = req.get('x-app-token');
  req.user = auth.sessionUser(req.token);
  if (req.user) return next();
  res.status(401).json({ error: 'נדרשת כניסה' });
});

const adminOnly = (req, res, next) => (req.user.admin ? next() : res.status(403).json({ error: 'רק למנהל החשבון' }));

const state = (u) => ({
  me: { name: u.name, admin: u.admin },
  users: u.admin ? db.users().map((x) => ({ name: x.name, admin: x.admin, lastScan: x.lastScan, location: x.location?.label || null })) : undefined,
  list: u.list, location: u.location, radiusKm: u.radiusKm, deals: u.deals,
  lastScan: u.lastScan, lastErrors: u.lastErrors, lastSources: u.lastSources || [],
  followLocation: u.followLocation !== false,
  chains: scanner.ALL_CHAINS.map((c) => ({ id: c.id, name: c.name, on: !u.chains || u.chains.includes(c.id) })),
  vapidKey: push.publicKey,
});

app.post('/api/logout', (req, res) => {
  delete db.get().sessions[req.token];
  db.save();
  res.json({ ok: true });
});

app.put('/api/password', (req, res) => {
  const { current, next } = req.body || {};
  if (!auth.checkPassword(req.user.pass, current)) return res.status(400).json({ error: 'הסיסמה הנוכחית שגויה' });
  if (!auth.validPassword(next)) return res.status(400).json({ error: 'הסיסמה החדשה צריכה להכיל לפחות 6 תווים' });
  req.user.pass = auth.hashPassword(next);
  auth.dropSessions(req.user, req.token); // ניתוק שאר המכשירים
  db.save();
  res.json({ ok: true });
});

// ---------- בני משפחה (מנהל בלבד) ----------
app.post('/api/users', adminOnly, (req, res) => {
  const { name, password } = req.body || {};
  if (!auth.validName(name)) return res.status(400).json({ error: 'השם צריך להכיל 2–30 תווים' });
  if (!auth.validPassword(password)) return res.status(400).json({ error: 'הסיסמה צריכה להכיל לפחות 6 תווים' });
  if (db.get().users[db.userKey(name)]) return res.status(400).json({ error: 'כבר יש משתמש בשם הזה' });
  db.newUser(name, { pass: auth.hashPassword(password) });
  db.save();
  res.json(state(req.user));
});

app.put('/api/users/:name/password', adminOnly, (req, res) => {
  const u = db.get().users[db.userKey(req.params.name)];
  if (!u) return res.status(404).json({ error: 'משתמש לא נמצא' });
  if (!auth.validPassword(req.body?.password)) return res.status(400).json({ error: 'הסיסמה צריכה להכיל לפחות 6 תווים' });
  u.pass = auth.hashPassword(req.body.password);
  auth.dropSessions(u, u === req.user ? req.token : undefined);
  db.save();
  res.json(state(req.user));
});

app.delete('/api/users/:name', adminOnly, (req, res) => {
  const key = db.userKey(req.params.name);
  const u = db.get().users[key];
  if (!u) return res.status(404).json({ error: 'משתמש לא נמצא' });
  if (u === req.user) return res.status(400).json({ error: 'אי אפשר למחוק את החשבון שלך' });
  auth.dropSessions(u);
  delete db.get().users[key];
  db.save();
  res.json(state(req.user));
});

// ---------- רשימה, מיקום והגדרות ----------
app.get('/api/state', (req, res) => res.json(state(req.user)));

const timers = new Map();
function rescanSoon(u, delay = 100) {
  clearTimeout(timers.get(u));
  timers.set(u, setTimeout(() => scanner.scan(u).catch((e) => console.error(`scan ${u.name}:`, e.message)), delay));
}

app.put('/api/list', (req, res) => {
  const items = Array.isArray(req.body.items) ? req.body.items : [];
  req.user.list = items
    .map((x) => String(typeof x === 'string' ? x : x.text || '').trim())
    .filter(Boolean)
    .slice(0, 300)
    .map((text) => ({ id: crypto.randomUUID(), text }));
  db.save();
  rescanSoon(req.user, 60000); // בדיקה חוזרת דקה אחרי השינוי האחרון ברשימה
  res.json(state(req.user));
});

app.put('/api/settings', async (req, res) => {
  const u = req.user;
  const { lat, lon, label, address, radiusKm, chains } = req.body;
  if (address) {
    const hit = await geo.geocode(address, { il: false });
    if (!hit) return res.status(400).json({ error: 'הכתובת לא נמצאה' });
    u.location = { lat: hit.lat, lon: hit.lon, label: address };
    u.followLocation = false; // כתובת ידנית – מפסיקים לעקוב אחרי ה-GPS
    rescanSoon(u);
  } else if (Number.isFinite(lat) && Number.isFinite(lon)) {
    u.location = { lat, lon, label: label || 'המיקום הנוכחי' };
    rescanSoon(u);
  }
  if (typeof req.body.followLocation === 'boolean') u.followLocation = req.body.followLocation;
  if (Number.isFinite(radiusKm)) u.radiusKm = Math.min(Math.max(radiusKm, 1), 50);
  if (Array.isArray(chains)) u.chains = chains;
  db.save();
  res.json(state(u));
});

// עדכון מיקום אוטומטי מהמכשיר. אם זזת יותר מ-MOVE_KM (או עברת מדינה) – סריקה חדשה ברקע.
const MOVE_KM = Number(process.env.MOVE_KM || 3);

app.post('/api/location', async (req, res) => {
  const u = req.user;
  const { lat, lon } = req.body;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return res.status(400).json({ error: 'מיקום לא תקין' });
  if (u.followLocation === false) return res.json({ moved: false, state: state(u) });
  const moved = !u.location || geo.haversineKm(u.location, { lat, lon }) > MOVE_KM;
  if (moved) {
    u.location = { lat, lon, label: 'המיקום הנוכחי' };
    const place = await scanner.placeOf(u.location);
    if (place) u.location.label = [place.city, place.country].filter(Boolean).join(', ') || u.location.label;
    db.save();
    rescanSoon(u);
  }
  res.json({ moved, state: state(u) });
});

app.post('/api/subscribe', (req, res) => {
  const sub = req.body;
  if (!sub?.endpoint) return res.status(400).json({ error: 'מנוי לא תקין' });
  // מכשיר שייך למשתמש אחד בלבד (למשל טלפון שעבר מיד ליד)
  for (const u of db.users()) u.subscriptions = u.subscriptions.filter((s) => s.endpoint !== sub.endpoint);
  req.user.subscriptions.push(sub);
  db.save();
  res.json({ ok: true });
});

app.post('/api/test-push', async (req, res) => {
  await push.send(req.user, { title: 'בדיקת התראה', body: `שלום ${req.user.name}, ההתראות פועלות ✔`, url: '/' });
  res.json({ ok: true });
});

app.post('/api/scan', async (req, res) => {
  try {
    const r = await scanner.scan(req.user);
    res.json({ ...r, state: state(req.user) });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// סריקה אוטומטית לכל בני המשפחה (ברירת מחדל: כל 3 שעות)
const HOURS = Number(process.env.SCAN_EVERY_HOURS || 3);
setInterval(async () => {
  for (const u of db.users()) {
    if (!u.location) continue;
    await scanner.scan(u).catch((e) => console.error(`scan ${u.name}:`, e.message));
  }
}, HOURS * 3600000).unref();

module.exports = app;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`מבצעים ליד הבית פועל: http://localhost:${PORT}${process.env.DEMO === '1' ? ' (מצב הדגמה)' : ''}`));
}
