// אוסטריה וגרמניה: עלוני המבצעים של כל הרשתות (Billa, Spar, Hofer, Lidl, Penny, REWE, Edeka, Aldi…)
// לפי מיקוד, דרך marktguru. זה ממשק לא רשמי של האתר – אם הוא ישתנה, יופיע על כך הסבר ב„הערות מהסריקה”.
const { Session } = require('../http');
const translate = require('../translate');

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

function toDeal(o, entry, now) {
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
    store: adv.name ? `${adv.name} (סניפים באזור)` : '',
    address: '',
    km: null,
    source: 'marktguru',
  };
}

// מצב הדגמה: תוצאות קבועות בסגנון וינה
function demoDeals(list) {
  const day = (n) => new Date(Date.now() + n * 86400000).toISOString();
  const samples = {
    'חלב': { id: 1, price: 1.29, oldPrice: 1.69, description: '-25%', brand: { name: 'Schärdinger' }, product: { name: 'Vollmilch 3,5% 1l' }, advertisers: [{ name: 'BILLA' }], validityDates: [{ from: day(-1), to: day(4) }] },
    'קוטג': { id: 2, price: 1.19, oldPrice: 1.59, description: 'Aktion', brand: { name: 'NÖM' }, product: { name: 'Cottage Cheese 200g' }, advertisers: [{ name: 'SPAR' }], validityDates: [{ from: day(-2), to: day(5) }] },
  };
  const now = new Date();
  return list.flatMap((entry) => {
    const k = Object.keys(samples).find((s) => entry.text.replace(/['׳]/g, '').includes(s));
    return k ? [toDeal(samples[k], entry, now)] : [];
  });
}

module.exports = {
  id: 'marktguru',
  name: 'marktguru (עלוני מבצעים)',
  countries: Object.keys(SITES),
  async scan({ list, place, errors }) {
    if (process.env.DEMO === '1') return demoDeals(list);
    if (!place.postcode) throw new Error('marktguru: חסר מיקוד למיקום הנוכחי');
    const host = SITES[place.countryCode];
    const s = new Session();
    const { apiKey, clientKey } = await apiKeys(s, host);
    const terms = await translate(list.map((x) => x.text), 'de');
    const now = new Date();
    const deals = [];
    for (const entry of list) {
      const q = terms[entry.text] || entry.text;
      try {
        const url = `https://api.${host}/api/v1/offers/search?as=web&limit=30&offset=0&zipCode=${encodeURIComponent(place.postcode)}&q=${encodeURIComponent(q)}`;
        const res = await s.fetch(url, { headers: { 'x-apikey': apiKey, 'x-clientkey': clientKey, Accept: 'application/json' } });
        const json = await res.json();
        for (const o of json.results || []) {
          const d = toDeal(o, entry, now);
          if (d) deals.push(d);
        }
      } catch (e) {
        errors.push(`marktguru / ${q}: ${e.message}`);
      }
    }
    return deals;
  },
  toDeal,
};
