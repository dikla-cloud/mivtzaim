// אחסון פשוט בקובץ JSON (אפליקציה אישית למשתמש אחד)
const fs = require('fs');
const path = require('path');

const FILE = path.join(process.env.DATA_DIR || path.join(__dirname, '..', 'data'), 'db.json');

const defaults = () => ({
  list: [],            // [{ id, text }]
  location: null,      // { lat, lon, label }
  radiusKm: 10,
  chains: null,        // null = כל הרשתות
  subscriptions: [],   // Web Push
  deals: [],           // תוצאות הסריקה האחרונה
  seen: {},            // מפתחות מבצעים שכבר נשלחה עליהם התראה
  storesCache: {},     // { chainId: { at, stores } }
  lastScan: null,
  lastErrors: [],
});

let db;
function get() {
  if (!db) {
    try { db = { ...defaults(), ...JSON.parse(fs.readFileSync(FILE, 'utf8')) }; } catch { db = defaults(); }
  }
  return db;
}

function save() {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE + '.tmp', JSON.stringify(db, null, 1));
  fs.renameSync(FILE + '.tmp', FILE);
}

module.exports = { get, save, FILE };
