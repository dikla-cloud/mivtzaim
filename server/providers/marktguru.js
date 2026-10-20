// אוסטריה וגרמניה: עלוני המבצעים של כל הרשתות (Billa, Spar, Hofer, Lidl, Penny, REWE, Edeka, Aldi…)
// לפי מיקוד, דרך marktguru. זה ממשק לא רשמי של האתר – אם הוא ישתנה, יופיע על כך הסבר ב״הערות מהסריקה״.
const { Session } = require('../http');
const translate = require('../translate');
const { tr } = require('../i18n');

const SITES = { AT: 'marktguru.at', DE: 'marktguru.de' };
const keysCache = {};

async function apiKeys(s, host) {
  const k = keysCache[host];
  if (k && Date.now() - k.at < 86400000) return k;
  const html = await s.text(`https://www.${host}/`);
  const apiKey = (html.match(/"apiKey"\s*:\s*"([^"]+)"/) || [])[1];
  const clientKey = (html.match(/"clientKey"\s*:\s*"([^"]+)"/) || [])[1];
  if (!apiKey || !clientKey) throw new Error('marktguru: לא נמצאו מפתחות גישה באתר');
  return (keysCache[host] = { apiKey, clientKey, at: Date.now() });
}

// החיפוש של marktguru מחזיר גם מוצרים שרק מכילים את המילה (״Butter״ ← Buttercroissant, Margarine).
// בגרמנית העיקר במילה מורכבת הוא החלק האחרון: Teebutter היא חמאה, Buttercroissant הוא קרואסון.
// לכן מוצר נחשב רק אם אחת המילים בשמו מסתיימת במילה שחיפשנו.
const words = (s) => String(s).toLowerCase().replace(/-/g, '').split(/[^a-zäöüßàâçéèêëîïôûùüÿñæœ]+/).filter(Boolean);
function relevant(term, name) {
  const q = words(term);
  if (!q.length) return true;
  const head = q[q.length - 1];
  const ws = words(name);
  // המילה מסתיימת במילת החיפוש, אולי עם סיומת רבים קצרה (Tomate ← Rispentomaten)
  const isHead = (w) => { const i = w.lastIndexOf(head); return i >= 0 && w.length - (i + head.length) <= 2; };
  return ws.some(isHead) && q.slice(0, -1).every((x) => ws.some((w) => w.includes(x)));
}

function toDeal(o, entry, now, lang) {
  const v = [].concat(o.validityDates || [])[0] || {};
  if (v.to && new Date(v.to) < now) return null;
  const adv = [].concat(o.advertisers || [])[0] || {};
  const product = [o.brand?.name, o.product?.name].filter(Boolean).join(' ') || o.description || '';
  return {
    key: `marktguru|${o.id}`,
    listItem: entry.text,
    product,
    regularPrice: o.oldPrice || null,
    promoPrice: o.price ?? null,
    currency: 'EUR',
    minQty: null,
    description: o.description || '',
    start: v.from || null,
    end: v.to || null,
    clubOnly: false,
    chain: adv.name || 'marktguru',
    store: adv.name ? tr(lang, '{chain} (סניפים באזור)', { chain: adv.name }) : '',
    address: '',
    km: null,
    source: 'marktguru',
  };
}

// מצב הדגמה: תוצאות קבועות בסגנון וינה
function demoDeals(list, lang) {
  const day = (n) => new Date(Date.now() + n * 86400000).toISOString();
  const samples = {
    'חלב': { id: 1, price: 1.29, oldPrice: 1.69, description: '-25%', brand: { name: 'Schärdinger' }, product: { name: 'Vollmilch 3,5% 1l' }, advertisers: [{ name: 'BILLA' }], validityDates: [{ from: day(-1), to: day(4) }] },
    'קוטג': { id: 2, price: 1.19, oldPrice: 1.59, description: 'Aktion', brand: { name: 'NÖM' }, product: { name: 'Cottage Cheese 200g' }, advertisers: [{ name: 'SPAR' }], validityDates: [{ from: day(-2), to: day(5) }] },
  };
  const now = new Date();
  return list.flatMap((entry) => {
    const k = Object.keys(samples).find((s) => entry.text.replace(/['׳]/g, '').includes(s));
    return k ? [toDeal(samples[k], entry, now, lang)] : [];
  });
}

module.exports = {
  id: 'marktguru',
  name: 'marktguru (עלוני מבצעים)',
  countries: Object.keys(SITES),
  async scan({ list, place, errors, report, lang }) {
    const t = (he, v) => tr(lang, he, v);
    report.note = t('חיפוש בעלוני המבצעים של כל הרשתות באזור המיקוד {zip}', { zip: place.postcode || '?' });
    const deals = [];
    if (process.env.DEMO === '1') {
      deals.push(...demoDeals(list, lang));
      for (const e of list) report.items[e.text] = { term: e.text, translated: true, offers: deals.filter((d) => d.listItem === e.text).length };
    } else {
      if (!place.postcode) throw new Error(t('לא זוהה מיקוד למיקום הנוכחי, ולכן אי אפשר לחפש בעלונים'));
      const host = SITES[place.countryCode];
      const s = new Session();
      const { apiKey, clientKey } = await apiKeys(s, host);
      const terms = await translate(list.map((x) => x.text), 'de', place.countryCode);
      const now = new Date();
      const search = async (q) => {
        const url = `https://api.${host}/api/v1/offers/search?as=web&limit=30&offset=0&zipCode=${encodeURIComponent(place.postcode)}&q=${encodeURIComponent(q)}`;
        const res = await s.fetch(url, { headers: { 'x-apikey': apiKey, 'x-clientkey': clientKey, Accept: 'application/json' } });
        return (await res.json()).results || [];
      };
      for (const entry of list) {
        const q = terms[entry.text]?.term || entry.text;
        const info = (report.items[entry.text] = { term: q, offers: 0, translated: Boolean(terms[entry.text]), how: terms[entry.text]?.how });
        try {
          const results = await search(q);
          info.offers = results.length;
          for (const o of results) {
            const d = toDeal(o, entry, now, lang);
            if (d && relevant(q, o.product?.name || d.product)) deals.push(d);
          }
        } catch (e) {
          info.error = e.message;
          errors.push(`marktguru / ${q}: ${e.message}`);
        }
      }
      // אם אף מוצר לא החזיר תוצאות – בדיקת שפיות עם מוצר שתמיד יש עליו מבצעים
      const items = Object.values(report.items);
      if (items.length && items.every((i) => !i.offers && !i.error)) {
        try {
          const n = (await search('Milch')).length;
          report.note += n
            ? t(' · בדיקת ביקורת: חיפוש ״Milch״ החזיר {n} תוצאות, כלומר החיבור לעלונים תקין ופשוט אין כרגע מבצעים על המוצרים ברשימה.', { n })
            : t(' · בדיקת ביקורת: גם חיפוש ״Milch״ החזיר 0 תוצאות. כנראה שהממשק של marktguru השתנה או שהמיקוד לא נתמך.');
        } catch (e) {
          report.note += t(' · בדיקת ביקורת נכשלה: {err}', { err: e.message });
        }
      }
    }
    // הרשתות שהופיעו בתוצאות
    const byChain = {};
    for (const d of deals) byChain[d.chain] = (byChain[d.chain] || 0) + 1;
    report.chains.push(...Object.entries(byChain).map(([name, n]) => ({ name, nearby: null, stores: [], deals: n, error: null })));
    return deals;
  },
  toDeal,
  relevant,
};
