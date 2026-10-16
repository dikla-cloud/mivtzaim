const fs = require('fs');
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

const userInfo = (x) => ({ name: x.name, admin: x.admin, household: x.household, lastScan: x.lastScan, location: x.location?.label || null });

const state = (u) => ({
  me: { name: u.name, admin: u.admin, household: db.householdOf(u).id },
  // המנהל רואה את כל המשתמשים; כל אחד אחר – את בני משק הבית שלו
  users: db.users().filter((x) => u.admin || x.household === u.household).map(userInfo),
  home: db.householdOf(u).home,
  list: u.list, location: u.location, radiusKm: u.radiusKm, deals: u.deals,
  lastScan: u.lastScan, lastErrors: u.lastErrors, lastSources: u.lastSources || [], lastReport: u.lastReport || null,
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
// כל משתמש יכול להוסיף מישהו נוסף ממשק הבית שלו (המנהל יכול גם להוסיף משק בית חדש)
app.post('/api/users', (req, res) => {
  const { name, password, newHousehold } = req.body || {};
  if (!auth.validName(name)) return res.status(400).json({ error: 'השם צריך להכיל 2–30 תווים' });
  if (!auth.validPassword(password)) return res.status(400).json({ error: 'הסיסמה צריכה להכיל לפחות 6 תווים' });
  if (db.get().users[db.userKey(name)]) return res.status(400).json({ error: 'כבר יש משתמש בשם הזה' });
  db.newUser(name, {
    pass: auth.hashPassword(password),
    household: req.user.admin && newHousehold ? null : db.householdOf(req.user).id,
  });
  db.save();
  res.json(state(req.user));
});

// ---------- „חסר בבית”: רשימה משותפת לכל בני משק הבית ----------
// כל פעולה היא על פריט בודד, כדי שכמה טלפונים יוכלו לעדכן באותו זמן בלי לדרוס זה את זה
const home = (req) => db.householdOf(req.user).home;
const homeState = (req) => ({ home: home(req) });

app.get('/api/home', (req, res) => res.json(homeState(req)));

// השוואת פריטים בלי תלות ברווחים, גרשיים, אותיות גדולות/קטנות וה' הידיעה („החלב” = „חלב”)
const sameItem = (a, b) => {
  const n = (s) => String(s).replace(/[׳'"״.,]/g, '').replace(/\s+/g, ' ').trim().toLowerCase().replace(/^ה(?=[\u05D0-\u05EA]{2})/, '');
  return n(a) === n(b);
};

app.post('/api/home', (req, res) => {
  const texts = [].concat(req.body?.items ?? req.body?.text ?? []).map((t) => String(t).trim()).filter(Boolean);
  const list = home(req);
  const duplicates = []; // פריטים שכבר ברשימה – מוחזרים כדי שהאפליקציה תודיע עליהם
  for (const text of texts.slice(0, 200)) {
    const existing = list.find((x) => !x.done && !x.voice && sameItem(x.text, text));
    if (existing) {
      duplicates.push({ text: existing.text, by: existing.by, at: existing.at });
      continue;
    }
    list.push({ id: crypto.randomUUID(), text, done: false, by: req.user.name, at: new Date().toISOString() });
  }
  db.save();
  res.json({ ...homeState(req), duplicates });
});

app.patch('/api/home/:id', (req, res) => {
  const item = home(req).find((x) => x.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'הפריט כבר לא ברשימה', ...homeState(req) });
  if (typeof req.body?.done === 'boolean') {
    item.done = req.body.done;
    item.doneBy = req.body.done ? req.user.name : undefined;
  }
  if (typeof req.body?.text === 'string' && req.body.text.trim()) item.text = req.body.text.trim();
  db.save();
  res.json(homeState(req));
});

// הודעות קוליות ב„חסר בבית”: נשמרות כקבצים בתיקיית הנתונים, ונגישות רק לבני משק הבית
const VOICE_DIR = path.resolve(path.dirname(db.FILE), 'voice');
const VOICE_TYPES = { 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mp4': 'm4a', 'audio/mpeg': 'mp3', 'audio/aac': 'aac', 'audio/wav': 'wav' };
const voiceFile = (item) => path.join(VOICE_DIR, `${item.id}.${item.voice.ext}`);
const dropVoice = (items) => { for (const x of items) if (x.voice) fs.rm(voiceFile(x), { force: true }, () => {}); };

app.post('/api/home/voice', express.raw({ type: 'audio/*', limit: '3mb' }), (req, res) => {
  const type = String(req.get('content-type') || '').split(';')[0].trim();
  const ext = VOICE_TYPES[type];
  if (!ext || !Buffer.isBuffer(req.body) || !req.body.length) return res.status(400).json({ error: 'פורמט הקלטה לא נתמך' });
  const seconds = Math.min(Math.round(Number(req.get('x-voice-seconds')) || 0), 120);
  const item = { id: crypto.randomUUID(), text: 'הודעה קולית', done: false, by: req.user.name, at: new Date().toISOString(), voice: { type, ext, seconds } };
  fs.mkdirSync(VOICE_DIR, { recursive: true });
  fs.writeFileSync(voiceFile(item), req.body);
  home(req).push(item);
  db.save();
  res.json(homeState(req));
});

app.get('/api/home/:id/voice', (req, res) => {
  const item = home(req).find((x) => x.id === req.params.id && x.voice);
  if (!item || !fs.existsSync(voiceFile(item))) return res.status(404).json({ error: 'ההקלטה לא נמצאה' });
  res.type(item.voice.type).sendFile(voiceFile(item));
});

app.delete('/api/home/:id', (req, res) => {
  const h = db.householdOf(req.user);
  dropVoice(h.home.filter((x) => x.id === req.params.id));
  h.home = h.home.filter((x) => x.id !== req.params.id);
  db.save();
  res.json(homeState(req));
});

// „ניקוי פריטים שנקנו”: נשארים רק מה שעוד לא נקנה. רשימת המבצעים לא מושפעת.
app.post('/api/home/clear-done', (req, res) => {
  const h = db.householdOf(req.user);
  dropVoice(h.home.filter((x) => x.done));
  h.home = h.home.filter((x) => !x.done);
  db.save();
  res.json(homeState(req));
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

// המנהל מצרף משתמש למשק הבית שלו, או מפריד אותו למשק בית משלו
app.put('/api/users/:name/household', adminOnly, (req, res) => {
  const u = db.get().users[db.userKey(req.params.name)];
  if (!u) return res.status(404).json({ error: 'משתמש לא נמצא' });
  if (u === req.user) return res.status(400).json({ error: 'זה החשבון שלך' });
  if (req.body?.join) u.household = db.householdOf(req.user).id;
  else {
    u.household = null;
    db.householdOf(u); // משק בית חדש וריק
  }
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
