// מרחקים ואיתור כתובות (OpenStreetMap Nominatim, עם מטמון קבוע בדיסק)
const fs = require('fs');
const path = require('path');
const { UA } = require('./http');

const CACHE = path.join(__dirname, '..', 'data', 'geocache.json');
let cache = null;
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
    const res = await fetch(url, { headers: { 'User-Agent': process.env.GEOCODER_UA || UA } });
    const [hit] = await res.json();
    if (hit) result = { lat: Number(hit.lat), lon: Number(hit.lon), label: hit.display_name };
  } catch (e) {
    return null; // שגיאת רשת – לא שומרים במטמון
  }
  c[key] = result;
  fs.mkdirSync(path.dirname(CACHE), { recursive: true });
  fs.writeFileSync(CACHE, JSON.stringify(c));
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
    const res = await fetch(url, { headers: { 'User-Agent': process.env.GEOCODER_UA || UA } });
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
    fs.mkdirSync(path.dirname(CACHE), { recursive: true });
    fs.writeFileSync(CACHE, JSON.stringify(c));
    return place;
  } catch {
    return null;
  }
}

// שמות ערים ישנים או מקוצרים בקובצי הרשתות
const CITY_ALIASES = { 'עפולה עילית': 'נוף הגליל', 'נצרת עילית': 'נוף הגליל', 'פ"ת': 'פתח תקווה', 'ת"א': 'תל אביב', 'ראשל"צ': 'ראשון לציון', 'ב"ש': 'באר שבע' };
const norm = (x) => String(x || '').replace(/[׳'"״\-–(),.]/g, ' ').replace(/\s+/g, ' ').trim();
// האם התוצאה של שירות המפות נמצאת באותה עיר (לפי המילה הראשונה בשם העיר)
// (בלי י׳ ו-ו׳, כדי ש„קרית” ו„קריית” ייחשבו אותו דבר. שם עיר שאינו בעברית לא נבדק)
const loose = (x) => norm(x).replace(/[וי]/g, '');
const inCity = (label, city) => !/[א-ת]/.test(city) || loose(label).includes(loose(city).split(' ')[0]);
const MAX_FROM_CITY_KM = 10;

// מיקום סניף. מחזיר גם איך נקבע (לבדיקה): city / address / none
async function storePosition(s) {
  if (s.lat != null) return { lat: s.lat, lon: s.lon, how: 'file' };
  const raw = String(s.city || '').trim();
  if (!raw || /^\d+$/.test(raw)) return null; // קוד עיר מספרי – אי אפשר לאתר בבטחה
  const city = CITY_ALIASES[raw] || raw;
  let center = await geocode(`${city}, ישראל`);
  if (center && !inCity(center.label, city)) center = null;
  const addr = s.address && norm(s.address) && (await geocode(`${s.address}, ${city}, ישראל`));
  // כתובת נחשבת רק אם היא באותה עיר, וקרובה למרכז העיר (אחרת זה כנראה רחוב באותו שם בעיר אחרת)
  const addrOk = addr && inCity(addr.label, city) && (!center || haversineKm(center, addr) <= MAX_FROM_CITY_KM);
  if (addrOk) return { lat: addr.lat, lon: addr.lon, how: 'address' };
  if (center) return { lat: center.lat, lon: center.lon, how: 'city' };
  return null;
}

// מחזיר את הסניפים ברדיוס, עם מרחק. קודם מסנן לפי עיר (מעט בקשות), ורק אז מאתר כתובות מדויקות.
async function storesWithin(stores, center, radiusKm) {
  const out = [];
  for (const s of stores) {
    if (s.lat == null) {
      const raw = String(s.city || '').trim();
      const city = raw && !/^\d+$/.test(raw) && (await geocode(`${CITY_ALIASES[raw] || raw}, ישראל`));
      if (city && haversineKm(center, city) > radiusKm + 8) continue; // עיר רחוקה – לא צריך לאתר את הכתובת
    }
    const pos = await storePosition(s);
    if (!pos) continue;
    const km = haversineKm(center, pos);
    if (km <= radiusKm) out.push({ ...s, lat: pos.lat, lon: pos.lon, geo: pos.how, km: Math.round(km * 10) / 10 });
  }
  return out.sort((a, b) => a.km - b.km);
}

module.exports = { haversineKm, geocode, reverse, storesWithin, storePosition, inCity };
