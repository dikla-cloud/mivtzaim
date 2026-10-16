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
  async scan({ list, location, radiusKm, enabledChains, errors }) {
    const deals = [];
    for (const chain of CHAINS.filter((c) => !enabledChains || enabledChains.includes(c.id))) {
      try {
        const nearby = (await geo.storesWithin(await chainStores(chain), location, radiusKm)).slice(0, MAX_STORES_PER_CHAIN);
        for (const store of nearby) {
          try {
            const files = await chain.storeFiles(store.storeId);
            deals.push(...findDeals({ list, promos: xml.parsePromos(files.promos), prices: xml.parsePrices(files.prices), chain, store }));
          } catch (e) {
            errors.push(`${chain.name} / ${store.name}: ${e.message}`);
          }
        }
      } catch (e) {
        errors.push(`${chain.name}: ${e.message}`);
      }
    }
    return deals;
  },
};
