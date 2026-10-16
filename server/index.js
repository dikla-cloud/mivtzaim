const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const db = require('./db');
const geo = require('./geo');
const push = require('./push');
const auth = require('./auth');
const scanner = require('./scanner');
const metrics = require('./metrics');
const i18n = require('./i18n');

// הגדרות ההתקנה: שפת ברירת מחדל ומדינה (למשל התקנה נפרדת לאוסטריה: APP_LANG=de APP_COUNTRY=AT)
const APP_COUNTRY = (process.env.APP_COUNTRY || 'IL').toUpperCase();
const APP_NAMES = { he: 'הקניות שלי', de: 'Meine Einkäufe', en: 'My Shopping' };
const appName = (l) => process.env.APP_NAME || APP_NAMES[i18n.pick(l)];
const T = (req, he, vars) => i18n.tr(req.lang, he, vars);

// גרסת תנאי השימוש ומדיניות הפרטיות. כשמשנים אותם – מעלים את הגרסה, וכל משתמש יתבקש לאשר מחדש.
const TERMS_VERSION = '2026-10-16';

const app = express();
app.use(express.json({ limit: '1mb' }));
// דף הבית והמניפסט מותאמים לשפה ולשם של ההתקנה
const PUBLIC = path.join(__dirname, '..', 'public');
app.get(['/', '/index.html'], (req, res) => {
  const L = i18n.DEFAULT_LANG;
  const html = fs.readFileSync(path.join(PUBLIC, 'index.html'), 'utf8')
    .replace('<html lang="he" dir="rtl" translate="no">', `<html lang="${L}" dir="${i18n.dir(L)}" translate="no" data-default-lang="${L}" data-country="${APP_COUNTRY}">`)
    .replace(/<title>[^<]*<\/title>/, `<title>${appName(L)}</title>`)
    .replace('content="הקניות שלי"', `content="${appName(L)}"`);
  res.set('Cache-Control', 'no-cache').type('html').send(html);
});
app.get('/manifest.webmanifest', (req, res) => {
  const L = i18n.DEFAULT_LANG;
  const m = JSON.parse(fs.readFileSync(path.join(PUBLIC, 'manifest.webmanifest'), 'utf8'));
  Object.assign(m, { name: appName(L), short_name: appName(L), lang: L, dir: i18n.dir(L) });
  res.type('application/manifest+json').send(JSON.stringify(m));
});
app.use(express.static(PUBLIC));
// ספריית קריאת ברקודים (ZXing) – מוגשת מהשרת עצמו, בלי שירות חיצוני
app.get('/vendor/zxing.min.js', (req, res) => res.sendFile(require.resolve('@zxing/library/umd/index.min.js')));
// שפת ההודעות: מה שהאפליקציה שולחת, אחרת השפה שנבחרה בחשבון, אחרת ברירת המחדל של ההתקנה
app.use('/api', (req, res, next) => { req.lang = i18n.pick(req.get('x-app-lang')); next(); });

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
    return res.status(401).json({ error: T(req, db.users().length ? 'שם או סיסמה שגויים' : 'הסיסמה הראשונית שגויה') });
  }
  failures.delete(key);
  res.json({ token: auth.newSession(u) });
});

app.get('/api/setup', (req, res) => res.json({ firstRun: !db.users().length, lang: i18n.DEFAULT_LANG, country: APP_COUNTRY }));

app.use('/api', (req, res, next) => {
  req.token = req.get('x-app-token');
  req.user = auth.sessionUser(req.token);
  if (req.user) {
    metrics.seen(req.user);
    if (!req.get('x-app-lang') && req.user.lang) req.lang = i18n.pick(req.user.lang);
    return next();
  }
  res.status(401).json({ error: T(req, 'נדרשת כניסה') });
});

const adminOnly = (req, res, next) => (req.user.admin ? next() : res.status(403).json({ error: T(req, 'רק למנהל החשבון') }));

const userInfo = (x) => ({ name: x.name, admin: x.admin, household: x.household, lastScan: x.lastScan, location: x.location?.label || null });

const state = (u) => ({
  me: { name: u.name, admin: u.admin, household: db.householdOf(u).id },
  // המנהל רואה את כל המשתמשים; כל אחד אחר – את בני משק הבית שלו
  users: db.users().filter((x) => u.admin || x.household === u.household).map(userInfo),
  home: db.householdOf(u).home,
  limits: { ...db.get().limits, count: db.users().length },
  needTerms: u.termsVersion !== TERMS_VERSION,
  list: u.list, location: u.location, radiusKm: u.radiusKm, deals: u.deals,
  lastScan: u.lastScan, lastErrors: u.lastErrors, lastSources: u.lastSources || [], lastReport: u.lastReport || null,
  lang: u.lang || null,
  country: APP_COUNTRY,
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
  if (!auth.checkPassword(req.user.pass, current)) return res.status(400).json({ error: T(req, 'הסיסמה הנוכחית שגויה') });
  if (!auth.validPassword(next)) return res.status(400).json({ error: T(req, 'הסיסמה החדשה צריכה להכיל לפחות 6 תווים') });
  req.user.pass = auth.hashPassword(next);
  auth.dropSessions(req.user, req.token); // ניתוק שאר המכשירים
  db.save();
  res.json({ ok: true });
});

// ---------- בני משפחה (מנהל בלבד) ----------
// כל משתמש יכול להוסיף מישהו נוסף ממשק הבית שלו (המנהל יכול גם להוסיף משק בית חדש)
app.post('/api/users', (req, res) => {
  const { name, password, newHousehold } = req.body || {};
  if (!auth.validName(name)) return res.status(400).json({ error: T(req, 'השם צריך להכיל 2–30 תווים') });
  if (!auth.validPassword(password)) return res.status(400).json({ error: T(req, 'הסיסמה צריכה להכיל לפחות 6 תווים') });
  if (db.get().users[db.userKey(name)]) return res.status(400).json({ error: T(req, 'כבר יש משתמש בשם הזה') });
  const { maxUsers, membersCanInvite } = db.get().limits;
  if (!req.user.admin && !membersCanInvite) return res.status(403).json({ error: T(req, 'רק מנהל האפליקציה יכול להזמין משתמשים חדשים') });
  if (db.users().length >= maxUsers) {
    return res.status(400).json({ error: `${T(req, 'הגעתם למספר המשתמשים המקסימלי באפליקציה ({max}).', { max: maxUsers })} ${T(req, req.user.admin ? 'אפשר להגדיל אותו בהגדרות ← בני הבית.' : 'אפשר לבקש מהמנהל להגדיל אותו.')}` });
  }
  db.newUser(name, {
    pass: auth.hashPassword(password),
    household: req.user.admin && newHousehold ? null : db.householdOf(req.user).id,
  });
  metrics.count('signup');
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
    const existing = list.find((x) => !x.done && sameItem(x.text, text));
    if (existing) {
      duplicates.push({ text: existing.text, by: existing.by, at: existing.at });
      continue;
    }
    list.push({ id: crypto.randomUUID(), text, done: false, by: req.user.name, at: new Date().toISOString() });
  }
  metrics.count('home_add', texts.length - duplicates.length);
  db.save();
  res.json({ ...homeState(req), duplicates });
});

app.patch('/api/home/:id', (req, res) => {
  const item = home(req).find((x) => x.id === req.params.id);
  if (!item) return res.status(404).json({ error: T(req, 'הפריט כבר לא ברשימה'), ...homeState(req) });
  if (typeof req.body?.done === 'boolean') {
    if (req.body.done && !item.done) metrics.count('home_bought');
    item.done = req.body.done;
    item.doneBy = req.body.done ? req.user.name : undefined;
  }
  if (typeof req.body?.text === 'string' && req.body.text.trim()) item.text = req.body.text.trim();
  db.save();
  res.json(homeState(req));
});

// ההודעות הקוליות הוסרו מהאפליקציה – מנקים פריטים וקבצים שנשארו מגרסה קודמת
{
  let removed = false;
  for (const h of Object.values(db.get().households)) {
    const before = h.home.length;
    h.home = h.home.filter((x) => !x.voice);
    removed ||= h.home.length !== before;
  }
  if (removed) db.save();
  fs.rm(path.resolve(path.dirname(db.FILE), 'voice'), { recursive: true, force: true }, () => {});
}

// ביטול מחיקה: מחזירים פריטים שנמחקו (בטעות) למקומם ברשימה
app.post('/api/home/restore', (req, res) => {
  const list = home(req);
  const entries = [].concat(req.body?.items || []).filter((e) => e && e.item).sort((x, y) => (x.index ?? 1e9) - (y.index ?? 1e9));
  for (const { item, index } of entries.slice(0, 200)) {
    const text = typeof item.text === 'string' ? item.text.trim().slice(0, 200) : '';
    if (!text || list.some((x) => x.id === item.id)) continue;
    const restored = {
      id: typeof item.id === 'string' && item.id.length <= 64 ? item.id : crypto.randomUUID(),
      text,
      done: Boolean(item.done),
      by: String(item.by || req.user.name).slice(0, 30),
      at: typeof item.at === 'string' ? item.at : new Date().toISOString(),
      ...(item.done && item.doneBy ? { doneBy: String(item.doneBy).slice(0, 30) } : {}),
    };
    const i = Number.isInteger(index) ? Math.min(Math.max(index, 0), list.length) : list.length;
    list.splice(i, 0, restored);
  }
  db.save();
  res.json(homeState(req));
});

app.delete('/api/home/:id', (req, res) => {
  const h = db.householdOf(req.user);
  h.home = h.home.filter((x) => x.id !== req.params.id);
  db.save();
  res.json(homeState(req));
});

// „ניקוי פריטים שנקנו”: נשארים רק מה שעוד לא נקנה. רשימת המבצעים לא מושפעת.
app.post('/api/home/clear-done', (req, res) => {
  const h = db.householdOf(req.user);
  h.home = h.home.filter((x) => !x.done);
  db.save();
  res.json(homeState(req));
});

app.put('/api/users/:name/password', adminOnly, (req, res) => {
  const u = db.get().users[db.userKey(req.params.name)];
  if (!u) return res.status(404).json({ error: T(req, 'משתמש לא נמצא') });
  if (!auth.validPassword(req.body?.password)) return res.status(400).json({ error: T(req, 'הסיסמה צריכה להכיל לפחות 6 תווים') });
  u.pass = auth.hashPassword(req.body.password);
  auth.dropSessions(u, u === req.user ? req.token : undefined);
  db.save();
  res.json(state(req.user));
});

// הגבלות הזמנה – מנהל בלבד
app.put('/api/limits', adminOnly, (req, res) => {
  const l = db.get().limits;
  const max = Number(req.body?.maxUsers);
  if (Number.isFinite(max)) l.maxUsers = Math.min(Math.max(Math.round(max), 1), 500);
  if (typeof req.body?.membersCanInvite === 'boolean') l.membersCanInvite = req.body.membersCanInvite;
  db.save();
  res.json(state(req.user));
});

// המנהל מצרף משתמש למשק הבית שלו, או מפריד אותו למשק בית משלו
app.put('/api/users/:name/household', adminOnly, (req, res) => {
  const u = db.get().users[db.userKey(req.params.name)];
  if (!u) return res.status(404).json({ error: T(req, 'משתמש לא נמצא') });
  if (u === req.user) return res.status(400).json({ error: T(req, 'זה החשבון שלך') });
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
  if (!u) return res.status(404).json({ error: T(req, 'משתמש לא נמצא') });
  if (u === req.user) return res.status(400).json({ error: T(req, 'אי אפשר למחוק את החשבון שלך') });
  auth.dropSessions(u);
  delete db.get().users[key];
  db.save();
  res.json(state(req.user));
});

// מחיקת החשבון שלי: החשבון, הרשימה לחיפוש מבצעים, המיקום וההתראות נמחקים.
// רשימת „חסר בבית” נמחקת רק אם לא נשאר בה אף בן בית אחר.
app.delete('/api/me', (req, res) => {
  const u = req.user;
  if (u.admin) return res.status(400).json({ error: T(req, 'חשבון המנהל לא נמחק מכאן, כי בלעדיו אי אפשר לנהל את האפליקציה.') });
  const d = db.get();
  auth.dropSessions(u);
  delete d.users[db.userKey(u.name)];
  if (!db.users().some((x) => x.household === u.household)) delete d.households[u.household];
  db.save();
  res.json({ ok: true });
});

// ---------- תנאי שימוש ומדיניות פרטיות ----------
app.post('/api/terms/accept', (req, res) => {
  req.user.termsVersion = TERMS_VERSION;
  req.user.termsAcceptedAt = new Date().toISOString();
  db.save();
  res.json(state(req.user));
});

// ---------- מדידה שומרת פרטיות ----------
app.post('/api/metrics/event', (req, res) => {
  const ok = metrics.clientEvent(String(req.body?.type || ''), req.body?.chain);
  res.status(ok ? 200 : 400).json({ ok });
});
app.get('/api/metrics', adminOnly, (req, res) => res.json(metrics.summary(Math.min(Math.max(Number(req.query.days) || 30, 7), 365))));
app.get('/api/metrics.csv', adminOnly, (req, res) => {
  res.set('Content-Disposition', `attachment; filename="usage-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.type('text/csv').send(metrics.csv());
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
  const { lat, lon, label, address, radiusKm, chains, lang } = req.body;
  if (i18n.LANGS.includes(lang)) u.lang = lang;
  if (address) {
    const hit = await geo.geocode(address, { il: false });
    if (!hit) return res.status(400).json({ error: T(req, 'הכתובת לא נמצאה') });
    u.location = { lat: hit.lat, lon: hit.lon, label: address };
    rescanSoon(u);
  } else if (Number.isFinite(lat) && Number.isFinite(lon)) {
    // עדכון מיקום בלחיצה: מזהים עיר ומדינה ובודקים מבצעים מחדש
    u.location = { lat, lon, label: label || T(req, 'המיקום הנוכחי') };
    const place = await scanner.placeOf(u.location);
    if (place && !label) u.location.label = [place.city, place.country].filter(Boolean).join(', ') || u.location.label;
    rescanSoon(u);
  }
  if (Number.isFinite(radiusKm)) u.radiusKm = Math.min(Math.max(radiusKm, 1), 50);
  if (Array.isArray(chains)) u.chains = chains;
  db.save();
  res.json(state(u));
});

// שם מוצר לפי ברקוד (מצילום): מאגר המוצרים החופשי Open Food Facts, עם מטמון בשרת
const PRODUCT_TTL = 30 * 86400000;
app.get('/api/product/:code', async (req, res) => {
  const code = String(req.params.code);
  if (!/^\d{6,14}$/.test(code)) return res.status(400).json({ error: T(req, 'ברקוד לא תקין') });
  const d = db.get();
  const cache = (d.products ||= {});
  const key = `${code}:${req.lang}`;
  const hit = cache[key];
  if (hit && Date.now() - hit.at < PRODUCT_TTL) return res.json({ code, name: hit.name });
  let name = null;
  try {
    const r = await fetch(`https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=product_name,product_name_he,product_name_de,product_name_en,brands`, {
      headers: { 'User-Agent': process.env.GEOCODER_UA || 'MivtzaimApp/1.0' }, signal: AbortSignal.timeout(10000),
    });
    const p = (await r.json()).product || {};
    const base = p[`product_name_${req.lang}`] || p.product_name || p.product_name_en || '';
    const brand = String(p.brands || '').split(',')[0].trim();
    name = base ? (brand && !base.toLowerCase().includes(brand.toLowerCase()) ? `${base} ${brand}` : base).trim().slice(0, 80) : null;
  } catch {
    return res.json({ code, name: null }); // בלי חיבור – לא שומרים במטמון
  }
  cache[key] = { name, at: Date.now() };
  db.save();
  res.json({ code, name });
});

app.post('/api/subscribe', (req, res) => {
  const sub = req.body;
  if (!sub?.endpoint) return res.status(400).json({ error: T(req, 'מנוי לא תקין') });
  // מכשיר שייך למשתמש אחד בלבד (למשל טלפון שעבר מיד ליד)
  for (const u of db.users()) u.subscriptions = u.subscriptions.filter((s) => s.endpoint !== sub.endpoint);
  req.user.subscriptions.push(sub);
  db.save();
  res.json({ ok: true });
});

app.post('/api/test-push', async (req, res) => {
  await push.send(req.user, { title: T(req, 'בדיקת התראה'), body: T(req, 'שלום {name}, ההתראות פועלות ✔', { name: req.user.name }), url: '/' });
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
  app.listen(PORT, () => console.log(`„הקניות שלי” פועלת: http://localhost:${PORT}${process.env.DEMO === '1' ? ' (מצב הדגמה)' : ''}`));
}
