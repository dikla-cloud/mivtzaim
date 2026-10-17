// ישראל: קובצי המחירים והמבצעים הרשמיים (חוק שקיפות המחירים)
const db = require('../db');
const xml = require('../xml');
const geo = require('../geo');
const { matches } = require('../match');
const translate = require('../translate');

const CHAINS = process.env.DEMO === '1'
  ? [require('../chains/demo')]
  : [require('../chains/shufersal'), ...require('../chains/cerberus').chains, ...require('../chains/weblist').chains, require('../chains/nizat')];

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

// רשת שמפרסמת מבצעים באתר (לא בקובצי שקיפות): אותם מבצעים בכל הסניפים, ומשייכים אותם לסניף הקרוב
function findWebDeals({ list, items, chain, store }) {
  const deals = [];
  for (const it of items) {
    for (const entry of list) {
      if (!matches(entry.match || entry.text, it.name, '')) continue;
      deals.push({
        key: `${chain.id}|${it.id}|${it.promoPrice}`,
        listItem: entry.text,
        product: it.name,
        itemCode: '',
        regularPrice: it.regularPrice,
        promoPrice: it.promoPrice,
        currency: 'ILS',
        minQty: 1,
        description: [it.regularPrice && it.promoPrice ? `${Math.round((1 - it.promoPrice / it.regularPrice) * 100)}% הנחה` : '', it.per100].filter(Boolean).join(' · '),
        start: null,
        end: null,
        clubOnly: true,
        url: it.url,
        chain: chain.name,
        store: store.name,
        address: [store.address, store.city].filter(Boolean).join(', '),
        km: store.km,
        source: 'website',
      });
    }
  }
  return deals;
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
        if (!matches(entry.match || entry.text, name, code)) continue;
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
  chainStores,
  id: 'israel',
  name: 'קובצי שקיפות מחירים (ישראל)',
  countries: ['IL'],
  chains: CHAINS,
  findDeals,
  findWebDeals,
  async scan({ list: rawList, location, radiusKm, enabledChains, errors, report }) {
    const deals = [];
    // פריטים בערבית: קובצי הרשתות בעברית, ולכן מחפשים גם לפי התרגום לעברית
    const arabic = rawList.filter((e) => translate.sourceLang(e.text) === 'ar');
    const terms = arabic.length ? await translate(arabic.map((e) => e.text), 'he', 'IL') : {};
    const list = rawList.map((e) => {
      const tr = terms[e.text];
      if (!tr) return e;
      report.items[e.text] = { term: tr.term, how: tr.how, translated: true };
      return { ...e, match: `${e.text}|${tr.term}` };
    });
    for (const chain of CHAINS.filter((c) => !enabledChains || enabledChains.includes(c.id))) {
      // מה נבדק ברשת הזו – מוצג למשתמש ב„מה נבדק בסריקה”
      const r = { name: chain.name, nearby: 0, stores: [], deals: 0, error: null };
      report.chains.push(r);
      try {
        const all = await geo.storesWithin(await chainStores(chain), location, radiusKm);
        r.nearby = all.length;
        if (chain.web) {
          const store = all[0];
          if (!store) continue;
          const sr = { name: store.name, km: store.km, promos: 0, deals: 0, error: null };
          r.stores.push(sr);
          const items = await chain.deals({ wait: 45000 });
          if (!items) { sr.error = 'המבצעים עדיין נטענים מהאתר. יופיעו בסריקה הבאה'; continue; }
          const found = findWebDeals({ list, items, chain, store });
          sr.promos = items.length;
          sr.deals = r.deals = found.length;
          deals.push(...found);
          continue;
        }
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
