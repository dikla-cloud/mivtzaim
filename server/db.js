// אחסון פשוט בקובץ JSON. לכל בן משפחה יש חשבון עם רשימה, מיקום והתראות משלו.
const fs = require('fs');
const path = require('path');

const FILE = path.join(process.env.DATA_DIR || path.join(__dirname, '..', 'data'), 'db.json');

const userDefaults = () => ({
  name: '',
  admin: false,
  pass: null,          // { salt, hash }
  list: [],            // [{ id, text }]
  location: null,      // { lat, lon, label, place }
  radiusKm: 10,
  chains: null,        // null = כל הרשתות
  followLocation: true,
  subscriptions: [],   // Web Push
  deals: [],           // תוצאות הסריקה האחרונה
  seen: {},            // מפתחות מבצעים שכבר נשלחה עליהם התראה
  lastScan: null,
  lastErrors: [],
  lastSources: [],
});

const defaults = () => ({
  users: {},           // { key: user }
  sessions: {},        // { token: userKey }
  storesCache: {},     // { chainId: { at, stores } } – משותף לכולם
  translations: {},    // משותף לכולם
});

// גרסה ראשונה של האפליקציה שמרה משתמש יחיד בשורש הקובץ
const LEGACY = ['list', 'location', 'radiusKm', 'chains', 'followLocation', 'subscriptions', 'deals', 'seen', 'lastScan', 'lastErrors', 'lastSources'];

let db;
function get() {
  if (!db) {
    let raw = {};
    try { raw = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { /* קובץ חדש */ }
    db = { ...defaults(), ...raw };
    if (LEGACY.some((k) => k in raw)) {
      db.legacy = Object.fromEntries(LEGACY.filter((k) => k in raw).map((k) => [k, raw[k]]));
      for (const k of LEGACY) delete db[k];
    }
  }
  return db;
}

function save() {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE + '.tmp', JSON.stringify(db, null, 1));
  fs.renameSync(FILE + '.tmp', FILE);
}

const userKey = (name) => String(name || '').trim().toLowerCase();
const users = () => Object.values(get().users);

function newUser(name, extra = {}) {
  const u = { ...userDefaults(), ...extra, name: String(name).trim() };
  get().users[userKey(name)] = u;
  return u;
}

module.exports = { get, save, FILE, userKey, users, newUser, userDefaults, reset: () => (db = null) };
