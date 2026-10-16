const path = require('path');
const crypto = require('crypto');
const express = require('express');
const db = require('./db');
const geo = require('./geo');
const push = require('./push');
const scanner = require('./scanner');

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

// הגנה בסיסית בסיסמה כשהשרת חשוף לאינטרנט (APP_TOKEN)
app.use('/api', (req, res, next) => {
  const t = process.env.APP_TOKEN;
  if (!t || req.get('x-app-token') === t) return next();
  res.status(401).json({ error: 'נדרשת סיסמה' });
});

const state = () => {
  const d = db.get();
  return {
    list: d.list, location: d.location, radiusKm: d.radiusKm, deals: d.deals,
    lastScan: d.lastScan, lastErrors: d.lastErrors, lastSources: d.lastSources || [],
    followLocation: d.followLocation !== false,
    chains: scanner.ALL_CHAINS.map((c) => ({ id: c.id, name: c.name, on: !d.chains || d.chains.includes(c.id) })),
    vapidKey: push.publicKey,
  };
};

app.get('/api/state', (req, res) => res.json(state()));

let listTimer;
app.put('/api/list', (req, res) => {
  const items = Array.isArray(req.body.items) ? req.body.items : [];
  db.get().list = items
    .map((x) => String(typeof x === 'string' ? x : x.text || '').trim())
    .filter(Boolean)
    .slice(0, 300)
    .map((text) => ({ id: crypto.randomUUID(), text }));
  db.save();
  // בדיקה חוזרת דקה אחרי השינוי האחרון ברשימה
  clearTimeout(listTimer);
  listTimer = setTimeout(rescanSoon, 60000);
  res.json(state());
});

app.put('/api/settings', async (req, res) => {
  const d = db.get();
  const { lat, lon, label, address, radiusKm, chains } = req.body;
  if (address) {
    const hit = await geo.geocode(address, { il: false });
    if (!hit) return res.status(400).json({ error: 'הכתובת לא נמצאה' });
    d.location = { lat: hit.lat, lon: hit.lon, label: address };
    d.followLocation = false; // כתובת ידנית – מפסיקים לעקוב אחרי ה-GPS
    rescanSoon();
  } else if (Number.isFinite(lat) && Number.isFinite(lon)) {
    d.location = { lat, lon, label: label || 'המיקום הנוכחי' };
    rescanSoon();
  }
  if (typeof req.body.followLocation === 'boolean') d.followLocation = req.body.followLocation;
  if (Number.isFinite(radiusKm)) d.radiusKm = Math.min(Math.max(radiusKm, 1), 50);
  if (Array.isArray(chains)) d.chains = chains;
  db.save();
  res.json(state());
});

// עדכון מיקום אוטומטי מהמכשיר. אם זזת יותר מ-MOVE_KM (או עברת מדינה) – סריקה חדשה ברקע.
const MOVE_KM = Number(process.env.MOVE_KM || 3);
function rescanSoon() {
  setTimeout(() => scanner.scan().catch((e) => console.error('scan:', e.message)), 100);
}

app.post('/api/location', async (req, res) => {
  const d = db.get();
  const { lat, lon } = req.body;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return res.status(400).json({ error: 'מיקום לא תקין' });
  if (d.followLocation === false) return res.json({ moved: false, state: state() });
  const moved = !d.location || geo.haversineKm(d.location, { lat, lon }) > MOVE_KM;
  if (moved) {
    d.location = { lat, lon, label: 'המיקום הנוכחי' };
    const place = await scanner.placeOf(d.location);
    if (place) d.location.label = [place.city, place.country].filter(Boolean).join(', ') || d.location.label;
    db.save();
    rescanSoon();
  }
  res.json({ moved, state: state() });
});

app.post('/api/subscribe', (req, res) => {
  const d = db.get();
  const sub = req.body;
  if (!sub?.endpoint) return res.status(400).json({ error: 'מנוי לא תקין' });
  d.subscriptions = d.subscriptions.filter((s) => s.endpoint !== sub.endpoint).concat(sub);
  db.save();
  res.json({ ok: true });
});

app.post('/api/test-push', async (req, res) => {
  await push.send({ title: 'בדיקת התראה', body: 'ההתראות פועלות ✔', url: '/' });
  res.json({ ok: true });
});

app.post('/api/scan', async (req, res) => {
  try {
    const r = await scanner.scan();
    res.json({ ...r, state: state() });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// סריקה אוטומטית (ברירת מחדל: כל 3 שעות). הרשתות מעדכנות קובצי מבצעים לפחות פעם ביום.
const HOURS = Number(process.env.SCAN_EVERY_HOURS || 3);
setInterval(() => scanner.scan().catch((e) => console.error('scan:', e.message)), HOURS * 3600000);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`מבצעים ליד הבית פועל: http://localhost:${PORT}${process.env.DEMO === '1' ? ' (מצב הדגמה)' : ''}`));
