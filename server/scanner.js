// סריקת מבצעים לפי המיקום הנוכחי: מזהה מדינה ← בוחר מקור נתונים ← מתאים לרשימה ← התראות
const db = require('./db');
const geo = require('./geo');
const push = require('./push');
const israel = require('./providers/israel');
const marktguru = require('./providers/marktguru');

// מקורות נתונים חינמיים לפי מדינה
const PROVIDERS = [israel, marktguru];

const inIsrael = ({ lat, lon }) => lat > 29.4 && lat < 33.4 && lon > 34.2 && lon < 35.95;
const inAustria = ({ lat, lon }) => lat > 46.3 && lat < 49.1 && lon > 9.5 && lon < 17.2;

async function placeOf(location) {
  if (location.place?.countryCode) return location.place;
  // אם שירות המפות לא זמין – זיהוי גס לפי גבולות
  const guess = inIsrael(location) ? { countryCode: 'IL', country: 'Israel' }
    : inAustria(location) ? { countryCode: 'AT', country: 'Austria' } : null;
  const place = (await geo.reverse(location.lat, location.lon))
    || (guess && { ...guess, city: '', postcode: '', label: location.label });
  if (place) {
    location.place = place;
    db.save();
  }
  return place;
}

let running = null;

async function scan() {
  if (running) return running;
  running = (async () => {
    const d = db.get();
    if (!d.location) throw new Error('לא הוגדר מיקום');
    const list = d.list.filter((x) => x.text.trim());
    const errors = [];
    const place = (await placeOf(d.location)) || { countryCode: '', country: '', city: '', postcode: '', label: d.location.label };
    const ctx = { list, location: d.location, place, radiusKm: d.radiusKm, enabledChains: d.chains, errors };

    const deals = [];
    const sources = [];
    const providers = PROVIDERS.filter((p) => p.countries.includes(place.countryCode));
    if (!providers.length) {
      errors.push(`אין עדיין מקור מבצעים חינמי ל${place.country || 'מדינה הזו'}. נתמכות כרגע: ישראל, אוסטריה וגרמניה.`);
    }
    for (const p of providers) {
      try {
        deals.push(...await p.scan(ctx));
        sources.push(p.name);
      } catch (e) {
        errors.push(`${p.name}: ${e.message}`);
      }
    }

    // מיון: לפי פריט ברשימה, ואז לפי מחיר מבצע
    deals.sort((a, b) => a.listItem.localeCompare(b.listItem, 'he') || (a.promoPrice ?? 1e9) - (b.promoPrice ?? 1e9));
    const fresh = deals.filter((x) => !d.seen[x.key]);
    for (const x of fresh) d.seen[x.key] = x.end || new Date(Date.now() + 14 * 86400000).toISOString();
    for (const [k, end] of Object.entries(d.seen)) if (typeof end !== 'string' || new Date(end) < new Date()) delete d.seen[k];

    d.deals = deals;
    d.lastScan = new Date().toISOString();
    d.lastErrors = errors;
    d.lastSources = sources;
    db.save();
    if (fresh.length) await push.notifyDeals(fresh);
    return { deals: deals.length, new: fresh.length, errors, sources };
  })();
  try { return await running; } finally { running = null; }
}

module.exports = { scan, placeOf, findDeals: israel.findDeals, ALL_CHAINS: israel.chains };
