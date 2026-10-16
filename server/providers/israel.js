// ישראל: קובצי המחירים והמבצעים הרשמיים (חוק שקיפות המחירים)
const db = require('../db');
const xml = require('../xml');
const geo = require('../geo');
const { matches } = require('../match');

const CHAINS = process.env.DEMO === '1'
  ? [require('../chains/demo')]
  : [require('../chains/shufersal'), ...require('../chains/cerberus').chains];

const STORES_TTL = 7 * 86400000;
const MAX_STORES_PER_CHAIN = Number(process.env.MAX_STORES_PER_CHAIN || 3);

async function chainStores(chain) {
  const d = db.get();
  const c = d.storesCache[chain.id];
  if (c && Date.now() - c.at < STORES_TTL) return c.stores;
  const stores = await chain.stores();
  d.storesCache[chain.id] = { at: Date.now(), stores };
  db.save();
  return stores;
}

// מוצא מבצעים בתוקף שמתאימים לפריטי הרשימה
function findDeals({ list, promos, prices, chain, store, now = new Date() }) {
  const deals = [];
  for (const p of promos) {
    if (p.end && new Date(p.end) < now) continue;
    for (const code of p.items) {
      const item = prices.get(code);
      const name = item?.name || '';
      for (const entry of list) {
        if (!matches(entry.text, name, code)) continue;
        deals.push({
          key: `${chain.id}|${store.storeId}|${p.promoId}|${code}`,
          listItem: entry.text,
          product: name || code,
          itemCode: code,
          regularPrice: item?.price ?? null,
          promoPrice: p.price,
          currency: 'ILS',
          minQty: p.minQty,
          description: p.description,
          start: p.start,
          end: p.end,
          clubOnly: p.clubOnly,
          chain: chain.name,
          store: store.name,
          address: [store.address, store.city].filter(Boolean).join(', '),
          km: store.km,
          source: 'official',
        });
      }
    }
  }
  return deals;
}

module.exports = {
  id: 'israel',
  name: 'קובצי שקיפות מחירים (ישראל)',
  countries: ['IL'],
  chains: CHAINS,
  findDeals,
  async scan({ list, location, radiusKm, enabledChains, errors, report }) {
    const deals = [];
    for (const chain of CHAINS.filter((c) => !enabledChains || enabledChains.includes(c.id))) {
      // מה נבדק ברשת הזו – מוצג למשתמש ב„מה נבדק בסריקה”
      const r = { name: chain.name, nearby: 0, stores: [], deals: 0, error: null };
      report.chains.push(r);
      try {
        const all = await geo.storesWithin(await chainStores(chain), location, radiusKm);
        r.nearby = all.length;
        for (const store of all.slice(0, MAX_STORES_PER_CHAIN)) {
          const sr = { name: store.name, km: store.km, promos: 0, deals: 0, error: null };
          r.stores.push(sr);
          try {
            const files = await chain.storeFiles(store.storeId);
            const promos = xml.parsePromos(files.promos);
            const found = findDeals({ list, promos, prices: xml.parsePrices(files.prices), chain, store });
            sr.promos = promos.length;
            sr.deals = found.length;
            r.deals += found.length;
            deals.push(...found);
          } catch (e) {
            sr.error = e.message;
            errors.push(`${chain.name} / ${store.name}: ${e.message}`);
          }
        }
      } catch (e) {
        r.error = e.message;
        errors.push(`${chain.name}: ${e.message}`);
      }
    }
    return deals;
  },
};
