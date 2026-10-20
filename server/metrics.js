// מדידה ששומרת על פרטיות: רק ספירות מצטברות ליום, בתוך השרת שלך, בלי שירות חיצוני.
// לא נשמר: מה כתוב ברשימות, מיקומים, כתובות IP, או מי לחץ על מה.
// ״פעילים היום״ נספר בעזרת קוד מזהה מוצפן עם מלח שמתחלף כל יום ונמחק בסוף היום,
// כך שאי אפשר לשחזר ממנו מי היה פעיל.
const crypto = require('crypto');
const db = require('./db');

const KEEP_DAYS = 400;
// אירועים שהאפליקציה רשאית לדווח (כל דבר אחר נדחה)
const CLIENT_EVENTS = new Set(['deal_click', 'deal_sheet', 'share_link', 'copy_link', 'dictation', 'photo', 'cart_compare']);

const today = () => new Date().toISOString().slice(0, 10);

function store() {
  const d = db.get();
  d.metrics ||= { days: {}, live: null };
  const m = d.metrics;
  const t = today();
  if (!m.live || m.live.date !== t) {
    // יום חדש: המלח והקודים של אתמול נמחקים
    m.live = { date: t, salt: crypto.randomBytes(16).toString('hex'), seen: [] };
    const cutoff = new Date(Date.now() - KEEP_DAYS * 86400000).toISOString().slice(0, 10);
    for (const k of Object.keys(m.days)) if (k < cutoff) delete m.days[k];
  }
  m.days[t] ||= { active: 0, events: {}, chains: {}, countries: {} };
  return { m, day: m.days[t] };
}

let dirty = false;
const touch = () => { dirty = true; };
// שמירה מרוכזת כל דקה (ולא בכל בקשה)
setInterval(() => { if (dirty) { dirty = false; db.save(); } }, 60000).unref();

// משתמש פעיל היום (נקרא בכל בקשה מחוברת)
function seen(user) {
  const { m, day } = store();
  const h = crypto.createHash('sha256').update(m.live.salt + db.userKey(user.name)).digest('hex').slice(0, 16);
  if (!m.live.seen.includes(h)) {
    m.live.seen.push(h);
    day.active = m.live.seen.length;
    const c = user.location?.place?.countryCode || '??';
    day.countries[c] = (day.countries[c] || 0) + 1;
    touch();
  }
  user.lastActive = today(); // תאריך בלבד, לחישוב פעילים ב-7/30 הימים האחרונים
}

function count(event, n = 1) {
  if (!n) return;
  const { day } = store();
  day.events[event] = (day.events[event] || 0) + n;
  touch();
}

// לכל רשת: כמה פעמים הוצגו מבצעים שלה, וכמה לחצו עליהם
function chain(name, field, n = 1) {
  if (!name || !n) return;
  const { day } = store();
  const c = (day.chains[String(name).slice(0, 60)] ||= { shown: 0, clicks: 0 });
  c[field] += n;
  touch();
}

function clientEvent(type, chainName) {
  if (!CLIENT_EVENTS.has(type)) return false;
  count(type);
  if (type === 'deal_click') chain(chainName, 'clicks');
  return true;
}

function summary(days = 30) {
  const { m } = store();
  const users = db.users();
  const since = (n) => new Date(Date.now() - (n - 1) * 86400000).toISOString().slice(0, 10);
  const series = [];
  for (let i = days - 1; i >= 0; i--) {
    const k = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    const d = m.days[k] || { active: 0, events: {}, chains: {}, countries: {} };
    series.push({ date: k, active: d.active, events: d.events });
  }
  const totals = {};
  const chains = {};
  const countries = {};
  for (const [k, d] of Object.entries(m.days)) {
    if (k < since(days)) continue;
    for (const [e, n] of Object.entries(d.events)) totals[e] = (totals[e] || 0) + n;
    for (const [c, v] of Object.entries(d.chains)) {
      const t = (chains[c] ||= { shown: 0, clicks: 0 });
      t.shown += v.shown;
      t.clicks += v.clicks;
    }
    for (const [c, n] of Object.entries(d.countries)) countries[c] = (countries[c] || 0) + n;
  }
  return {
    days,
    registered: users.length,
    households: new Set(users.map((u) => u.household)).size,
    active: {
      today: series[series.length - 1].active,
      week: users.filter((u) => u.lastActive && u.lastActive >= since(7)).length,
      month: users.filter((u) => u.lastActive && u.lastActive >= since(30)).length,
    },
    series,
    totals,
    chains: Object.entries(chains).map(([name, v]) => ({ name, ...v })).sort((a, b) => b.clicks - a.clicks || b.shown - a.shown),
    countries,
  };
}

// קובץ CSV יומי (להצגה לרשתות או לשותפים) – מספרים מצטברים בלבד
function csv() {
  const { m } = store();
  const rows = [['date', 'active_users', 'scans', 'deals_found', 'notifications', 'deal_clicks', 'home_items_added', 'home_items_bought', 'new_users']];
  for (const k of Object.keys(m.days).sort()) {
    const d = m.days[k];
    const e = d.events;
    rows.push([k, d.active, e.scan || 0, e.deals_found || 0, e.notification || 0, e.deal_click || 0, e.home_add || 0, e.home_bought || 0, e.signup || 0]);
  }
  const chainRows = [['date', 'chain', 'deals_shown', 'deal_clicks']];
  for (const k of Object.keys(m.days).sort()) {
    for (const [c, v] of Object.entries(m.days[k].chains)) chainRows.push([k, `"${c.replace(/"/g, '""')}"`, v.shown, v.clicks]);
  }
  return '﻿' + rows.map((r) => r.join(',')).join('\n') + '\n\n' + chainRows.map((r) => r.join(',')).join('\n') + '\n';
}

module.exports = { seen, count, chain, clientEvent, summary, csv, CLIENT_EVENTS };
