// מרחקים ואיתור כתובות (OpenStreetMap Nominatim, עם מטמון קבוע בדיסק)
const fs = require('fs');
const path = require('path');
const { UA } = require('./http');

const CACHE = path.join(__dirname, '..', 'data', 'geocache.json');
let cache = null;

// כתיבה בטוחה: קודם לקובץ זמני ואז החלפה, כדי ששתי התקנות על אותו שרת לא ישברו את הקובץ
function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data));
  fs.renameSync(tmp, file);
}
let last = 0;

function haversineKm(a, b) {
  const R = 6371, rad = (x) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function load() {
  if (!cache) {
    try { cache = JSON.parse(fs.readFileSync(CACHE, 'utf8')); } catch { cache = {}; }
  }
  return cache;
}

async function geocode(query, { il = true } = {}) {
  const c = load();
  const key = (il ? '' : 'w:') + query.trim();
  if (key in c) return c[key];
  // מדיניות Nominatim: לכל היותר בקשה אחת בשנייה
  const wait = last + 1100 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  last = Date.now();
  let result = null;
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1${il ? '&countrycodes=il' : ''}&accept-language=he&q=${encodeURIComponent(query.trim())}`;
    const res = await fetch(url, { headers: { 'User-Agent': process.env.GEOCODER_UA || UA }, signal: AbortSignal.timeout(15000) });
    const [hit] = await res.json();
    if (hit) result = { lat: Number(hit.lat), lon: Number(hit.lon), label: hit.display_name };
  } catch (e) {
    return null; // שגיאת רשת – לא שומרים במטמון
  }
  c[key] = result;
  writeJson(CACHE, c);
  return result;
}

// מיקום → מדינה/עיר/מיקוד (נשמר במטמון לפי רשת של ~1 ק"מ)
async function reverse(lat, lon) {
  const c = load();
  const key = `rev:${lat.toFixed(2)},${lon.toFixed(2)}`;
  if (c[key]) return c[key];
  const wait = last + 1100 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  last = Date.now();
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&zoom=16&accept-language=en&lat=${lat}&lon=${lon}`;
    const res = await fetch(url, { headers: { 'User-Agent': process.env.GEOCODER_UA || UA }, signal: AbortSignal.timeout(15000) });
    const { address: a = {}, display_name } = await res.json();
    const place = {
      countryCode: (a.country_code || '').toUpperCase(),
      country: a.country || '',
      city: a.city || a.town || a.village || a.municipality || a.county || '',
      postcode: a.postcode || '',
      label: display_name || '',
    };
    if (!place.countryCode) return null;
    c[key] = place;
    writeJson(CACHE, c);
    return place;
  } catch {
    return null;
  }
}

// שמות ערים ישנים או מקוצרים בקובצי הרשתות
const CITY_ALIASES = { 'עפולה עילית': 'נוף הגליל', 'נצרת עילית': 'נוף הגליל', 'פ"ת': 'פתח תקווה', 'ת"א': 'תל אביב', 'ראשל"צ': 'ראשון לציון', 'ב"ש': 'באר שבע' };
const norm = (x) => String(x || '').replace(/[׳'"״\-–(),.]/g, ' ').replace(/\s+/g, ' ').trim();
// האם התוצאה של שירות המפות נמצאת באותה עיר (לפי המילה הראשונה בשם העיר)
// (בלי י׳ ו-ו׳, כדי ש״קרית״ ו״קריית״ ייחשבו אותו דבר. שם עיר שאינו בעברית לא נבדק)
const loose = (x) => norm(x).replace(/[וי]/g, '');
const inCity = (label, city) => !/[א-ת]/.test(city) || loose(label).includes(loose(city).split(' ')[0]);
const MAX_FROM_CITY_KM = 10;

// חלק מהרשתות כותבות את העיר כסמל יישוב של הלמ"ס (למשל 7900 = פתח תקווה).
// הטבלה הרשמית מ-data.gov.il יורדת פעם אחת ונשמרת בדיסק.
const CITIES = path.join(path.dirname(CACHE), 'cities.json');
const CBS_URL = 'https://data.gov.il/api/3/action/datastore_search?resource_id=5c78e9fa-c2e2-4771-93ff-7f400a12f7ba&limit=5000';
let cbs = null;
async function cbsCities() {
  if (cbs) return cbs;
  try { cbs = JSON.parse(fs.readFileSync(CITIES, 'utf8')); return cbs; } catch { /* עוד לא ירד */ }
  try {
    const res = await fetch(CBS_URL, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(30000) });
    const rows = (await res.json()).result?.records || [];
    const map = {};
    for (const r of rows) {
      const code = Number(r['סמל_ישוב']);
      const name = String(r['שם_ישוב'] || '').replace(/\s+/g, ' ').trim();
      if (code && name) map[code] = name;
    }
    if (Object.keys(map).length > 100) {
      writeJson(CITIES, map);
      cbs = map;
      return cbs;
    }
  } catch { /* אין חיבור – ננסה בפעם הבאה */ }
  return {};
}

// שם העיר לאיתור: מתרגם סמל יישוב ושמות ישנים/מקוצרים. מחזיר '' אם אי אפשר
async function cityName(raw) {
  raw = String(raw || '').trim();
  if (/^\d+$/.test(raw)) raw = (await cbsCities())[Number(raw)] || '';
  return CITY_ALIASES[raw] || raw;
}

// ניקוי כתובת מקובץ הרשת לפני האיתור: ״רח' דרויאנוב 5״ ← ״דרויאנוב 5״, ״17 יצחק שמיר״ ← ״יצחק שמיר 17״,
// ״החשמונאים 84 פינת קרליבך״ ← ״החשמונאים 84״
function cleanAddress(a) {
  let x = String(a || '').replace(/\s+/g, ' ').trim();
  x = x.split(',')[0].replace(/\s+פינת.*$/, '').replace(/^(רח['׳.]|רחוב)\s*/, '').trim();
  const m = x.match(/^(\d+[א-ת]?)\s+(\D.*)$/);
  if (m) x = `${m[2]} ${m[1]}`;
  return x;
}

// ״סניף״ אינטרנטי (שופרסל ONLINE וכד׳) – אין לו מיקום אמיתי
const isOnline = (s) => /www\.|online|אונליין|אינטרנט/i.test(`${s.name} ${s.address}`);

// מיקום סניף. מחזיר גם איך נקבע (לבדיקה): city / address / none
async function storePosition(s) {
  if (s.lat != null) return { lat: s.lat, lon: s.lon, how: 'file' };
  const city = await cityName(s.city);
  if (!city) return null;
  let center = await geocode(`${city}, ישראל`);
  if (center && !inCity(center.label, city)) center = null;
  const street = cleanAddress(s.address);
  const addr = street && /[א-תa-z]/i.test(street) && (await geocode(`${street}, ${city}, ישראל`));
  // כתובת נחשבת רק אם היא באותה עיר, וקרובה למרכז העיר (אחרת זה כנראה רחוב באותו שם בעיר אחרת)
  const addrOk = addr && inCity(addr.label, city) && (!center || haversineKm(center, addr) <= MAX_FROM_CITY_KM);
  if (addrOk) return { lat: addr.lat, lon: addr.lon, how: 'address' };
  if (center) return { lat: center.lat, lon: center.lon, how: 'city' };
  return null;
}

// שלב 1 (מהיר): מועמדים לפי מרכז העיר שלהם, מהקרוב לרחוק. ערים מתחלפות לעתים רחוקות ונשמרות במטמון
async function nearCandidates(stores, center, radiusKm) {
  const out = [];
  for (const s of stores) {
    if (isOnline(s)) continue;
    if (s.lat != null) { out.push({ s, approx: haversineKm(center, s) }); continue; }
    const name = await cityName(s.city);
    const city = name && (await geocode(`${name}, ישראל`));
    if (city && haversineKm(center, city) > radiusKm + 8) continue; // עיר רחוקה – לא צריך לאתר את הכתובת
    out.push({ s, approx: city ? haversineKm(center, city) : radiusKm + 8 });
  }
  return out.sort((a, b) => a.approx - b.approx);
}

// שלב 2: מיקום מדויק של מועמד (לפי כתובת), ומרחק אמיתי. null אם מחוץ לרדיוס
async function locate(s, center, radiusKm) {
  const pos = await storePosition(s);
  if (!pos) return null;
  const km = haversineKm(center, pos);
  return km <= radiusKm ? { ...s, lat: pos.lat, lon: pos.lon, geo: pos.how, km: Math.round(km * 10) / 10 } : null;
}

// מחזיר את הסניפים ברדיוס, עם מרחק. קודם הקרובים (לפי העיר), ורק אז מאתר כתובות מדויקות.
async function storesWithin(stores, center, radiusKm, onStore) {
  const out = [];
  for (const { s } of await nearCandidates(stores, center, radiusKm)) {
    const found = await locate(s, center, radiusKm);
    if (!found) continue;
    out.push(found);
    onStore?.(found); // לרשימה שמתעדכנת בזמן האיתור
  }
  return out.sort((a, b) => a.km - b.km);
}

module.exports = { haversineKm, geocode, reverse, storesWithin, nearCandidates, locate, isOnline, storePosition, inCity, cityName, cleanAddress };
