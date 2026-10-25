// אחסון פשוט בקובץ JSON. לכל בן משפחה יש חשבון עם רשימה, מיקום והתראות משלו,
// ובני אותו משק בית (household) חולקים את רשימת ״חסר בבית״.
const fs = require('fs');
const path = require('path');

const FILE = path.join(process.env.DATA_DIR || path.join(__dirname, '..', 'data'), 'db.json');

const userDefaults = () => ({
  name: '',
  admin: false,
  household: null,     // מזהה משק הבית
  pass: null,          // { salt, hash }
  list: [],            // [{ id, text }]
  location: null,      // { lat, lon, label, place }
  radiusKm: 10,
  chains: null,        // null = כל הרשתות
  followLocation: false, // ברירת מחדל: מעדכנים מיקום בלחיצה
  subscriptions: [],   // Web Push
  deals: [],           // תוצאות הסריקה האחרונה
  seen: {},            // מפתחות מבצעים שכבר נשלחה עליהם התראה
  lastScan: null,
  lastErrors: [],
  lastSources: [],
});

const defaults = () => ({
  users: {},           // { key: user }
  households: {},      // { id: { id, home: [{ id, text, done, by, at }] } }
  sessions: {},        // { token: userKey }
  storesCache: {},     // { chainId: { at, stores } } – משותף לכולם
  translations: {},    // משותף לכולם
  // הגבלות הזמנה (המנהל משנה בהגדרות): מספר משתמשים מקסימלי, והאם גם משתמשים רגילים יכולים להזמין
  limits: { maxUsers: 20, membersCanInvite: true },
});

// גרסה ראשונה של האפליקציה שמרה משתמש יחיד בשורש הקובץ
const LEGACY = ['list', 'location', 'radiusKm', 'chains', 'followLocation', 'subscriptions', 'deals', 'seen', 'lastScan', 'lastErrors', 'lastSources'];

let db;
function get() {
  if (!db) {
    let raw = {};
    try { raw = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { /* קובץ חדש */ }
    db = { ...defaults(), ...raw };
    db.limits = { ...defaults().limits, ...(raw.limits || {}) };
    if (LEGACY.some((k) => k in raw)) {
      db.legacy = Object.fromEntries(LEGACY.filter((k) => k in raw).map((k) => [k, raw[k]]));
      for (const k of LEGACY) delete db[k];
    }
    // משתמשים מגרסה קודמת (לפני משקי בית) – כל אחד מקבל משק בית משלו
    for (const u of Object.values(db.users)) if (!u.household || !db.households[u.household]) u.household = newHousehold();
    // תיקון חד-פעמי: גרסה קודמת צירפה את כל המשתמשים הקיימים למשק הבית של המנהל.
    // מפרידים אותם; רשימת ״חסר בבית״ נשארת אצל המנהל. אפשר לצרף מחדש מההגדרות.
    if (!db.householdsV2) {
      for (const u of Object.values(db.users)) if (!u.admin) u.household = newHousehold();
      db.householdsV2 = true;
    }
    // שינוי ברירת מחדל: מיקום מתעדכן בלחיצה על ״עדכון מיקום״, לא אוטומטית (אפשר להפעיל שוב בהגדרות)
    if (!db.locationV2) {
      for (const u of Object.values(db.users)) u.followLocation = false;
      db.locationV2 = true;
    }
    // רשת חדשה (ניצת הדובדבן) נדלקת גם למי שכבר בחר רשתות בעבר
    if (!db.chainsNizat) {
      for (const u of Object.values(db.users)) if (Array.isArray(u.chains) && !u.chains.includes('nizat')) u.chains.push('nizat');
      db.chainsNizat = true;
    }
    if (!db.chainsVictory) {
      for (const u of Object.values(db.users)) if (Array.isArray(u.chains) && !u.chains.includes('victory')) u.chains.push('victory');
      db.chainsVictory = true;
    }
  }
  return db;
}

function newHousehold() {
  const id = 'h' + require('crypto').randomBytes(6).toString('hex');
  db.households[id] = { id, home: [] };
  return id;
}

const householdOf = (u) => {
  get();
  if (!u.household || !db.households[u.household]) u.household = newHousehold();
  return db.households[u.household];
};

function save() {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE + '.tmp', JSON.stringify(db, null, 1));
  fs.renameSync(FILE + '.tmp', FILE);
}

const userKey = (name) => String(name || '').trim().toLowerCase();
const users = () => Object.values(get().users);

function newUser(name, extra = {}) {
  get();
  const u = { ...userDefaults(), ...extra, name: String(name).trim() };
  if (!u.household) u.household = newHousehold();
  get().users[userKey(name)] = u;
  return u;
}

module.exports = { get, save, FILE, userKey, users, newUser, userDefaults, householdOf, reset: () => (db = null) };
