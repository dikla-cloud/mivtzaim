// סריקת מבצעים לפי המיקום הנוכחי: מזהה מדינה ← בוחר מקור נתונים ← מתאים לרשימה ← התראות
const db = require('./db');
const { tr, pick } = require('./i18n');
const geo = require('./geo');
const push = require('./push');
const metrics = require('./metrics');
const israel = require('./providers/israel');
const marktguru = require('./providers/marktguru');
const salefinder = require('./providers/salefinder');

// מקורות נתונים חינמיים לפי מדינה
const PROVIDERS = [israel, marktguru, salefinder];

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

const running = new Map(); // סריקה אחת בכל רגע לכל משתמש

// סורק עבור משתמש אחד (d = החשבון שלו)
async function scan(d) {
  const key = db.userKey(d.name);
  if (running.has(key)) return running.get(key);
  const job = (async () => {
    const lang = pick(d.lang);
    if (!d.location) throw new Error(tr(lang, 'לא הוגדר מיקום'));
    const list = d.list.filter((x) => x.text.trim());
    const errors = [];
    const place = (await placeOf(d.location)) || { countryCode: '', country: '', city: '', postcode: '', label: d.location.label };
    // דוח ״מה נבדק״ – נשמר עם תוצאות הסריקה ומוצג באפליקציה
    const report = { place: { ...place }, radiusKm: d.radiusKm, providers: [], chains: [], items: {}, note: '' };
    const ctx = { list, location: d.location, place, radiusKm: d.radiusKm, enabledChains: d.chains, errors, report, lang };

    const deals = [];
    const sources = [];
    const providers = PROVIDERS.filter((p) => p.countries.includes(place.countryCode));
    if (!providers.length) {
      errors.push(tr(lang, 'אין עדיין מקור מבצעים חינמי ל{country}. נתמכות כרגע: ישראל, אוסטריה, גרמניה ואוסטרליה.', { country: place.country || tr(lang, 'המדינה הזו') }));
    }
    for (const p of providers) {
      try {
        deals.push(...await p.scan(ctx));
        sources.push(tr(lang, p.name));
        report.providers.push({ name: tr(lang, p.name), error: null });
      } catch (e) {
        errors.push(`${tr(lang, p.name)}: ${e.message}`);
        report.providers.push({ name: tr(lang, p.name), error: e.message });
      }
    }
    report.items = list.map((x) => ({
      text: x.text,
      found: deals.filter((dl) => dl.listItem === x.text).length,
      ...(report.items[x.text] || {}),
    }));

    // מיון: לפי פריט ברשימה, ואז לפי מחיר מבצע
    deals.sort((a, b) => a.listItem.localeCompare(b.listItem, 'he') || (a.promoPrice ?? 1e9) - (b.promoPrice ?? 1e9));
    const fresh = deals.filter((x) => !d.seen[x.key]);
    for (const x of fresh) d.seen[x.key] = x.end || new Date(Date.now() + 14 * 86400000).toISOString();
    for (const [k, end] of Object.entries(d.seen)) if (typeof end !== 'string' || new Date(end) < new Date()) delete d.seen[k];

    d.deals = deals;
    d.lastScan = new Date().toISOString();
    d.lastErrors = errors;
    d.lastSources = sources;
    d.lastReport = report;
    db.save();
    metrics.count('scan');
    metrics.count('deals_found', deals.length);
    for (const dl of deals) metrics.chain(dl.chain, 'shown');
    if (fresh.length && d.subscriptions.length) metrics.count('notification');
    if (fresh.length) await push.notifyDeals(d, fresh);
    return { deals: deals.length, new: fresh.length, errors, sources };
  })();
  running.set(key, job);
  try { return await job; } finally { running.delete(key); }
}

module.exports = { scan, placeOf, findDeals: israel.findDeals, ALL_CHAINS: israel.chains };
