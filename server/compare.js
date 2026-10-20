// השוואת עלות העגלה (״חסר בבית״) בין עד 4 סניפים, לפי קובצי המחירים והמבצעים הרשמיים (ישראל).
// לכל פריט נבחר בכל סניף המוצר הזול ביותר שמתאים לו (עדיפות למוצר ששמו מתחיל במילה שחיפשנו),
// ואם יש עליו מבצע בתוקף ליחידה אחת – המחיר במבצע. כך רואים איפה העגלה הכי זולה היום.
const israel = require('./providers/israel');
const xml = require('./xml');
const geo = require('./geo');
const { tokens, variantsOf, matchVariants } = require('./match');

const TTL = 3 * 3600000; // קובצי סניף נשמרים בזיכרון 3 שעות
const MAX_CACHED = 12;
const MAX_STORES = 4;
const cache = new Map(); // `${chain}|${store}` → { at, items, promoByCode }
const pending = new Map();

// רשתות שמפרסמות מחירים מלאים לכל סניף (ניצת הדובדבן, למשל, מפרסמת רק מבצעים)
const comparableChains = () => israel.chains.filter((c) => typeof c.storeFiles === 'function');

async function storeData(chain, storeId) {
  const key = `${chain.id}|${storeId}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit;
  if (!pending.has(key)) {
    pending.set(key, (async () => {
      const files = await chain.storeFiles(storeId);
      const prices = xml.parsePrices(files.prices);
      const now = new Date();
      // מבצע ליחידה אחת (או בלי כמות מינימלית) שבתוקף עכשיו – המחיר הנמוך ביותר לכל מוצר
      const promoByCode = new Map();
      for (const p of xml.parsePromos(files.promos)) {
        if (!p.price || (p.minQty && p.minQty > 1)) continue;
        if ((p.end && new Date(p.end) < now) || (p.start && new Date(p.start) > now)) continue;
        for (const code of p.items) {
          const cur = promoByCode.get(code);
          if (!cur || p.price < cur.price) promoByCode.set(code, { price: p.price, clubOnly: p.clubOnly, description: p.description, end: p.end });
        }
      }
      const items = [];
      for (const [code, it] of prices) if (it.price) items.push({ code, name: it.name, price: it.price, variants: variantsOf(it.name) });
      const data = { at: Date.now(), items, byCode: new Map(items.map((i) => [i.code, i])), promoByCode };
      cache.set(key, data);
      while (cache.size > MAX_CACHED) cache.delete(cache.keys().next().value);
      return data;
    })().finally(() => pending.delete(key)));
  }
  return pending.get(key);
}

// המוצר שנבחר לפריט בסניף: ברקוד אם נכתב, אחרת הזול מבין המתאימים
function pick(text, data) {
  const alts = String(text).split('|').map((s) => s.trim()).filter(Boolean);
  const code = alts.find((a) => /^\d{7,14}$/.test(a));
  let best = code && data.byCode.get(code);
  if (!best) {
    let bestScore = null;
    for (const alt of alts.filter((a) => !/^\d+$/.test(a))) {
      const qt = tokens(alt);
      for (const it of data.items) {
        if (!matchVariants(qt, it.variants)) continue;
        // קודם מוצר שהמילה הראשונה בשמו היא בדיוק המילה שחיפשנו (״חלב טרי״), אחריו מוצר שמתחיל בה (״חלבה״),
        // ורק אחר כך מוצר שהמילה באמצע שמו (״שוקו בטעם חלב״). בתוך כל קבוצה – הזול
        const [w0, w1] = it.variants;
        const score = [w0 === qt[0] || w1 === qt[0] ? 0 : w0?.startsWith(qt[0]) || w1?.startsWith(qt[0]) ? 1 : 2, it.price];
        if (!bestScore || score[0] < bestScore[0] || (score[0] === bestScore[0] && score[1] < bestScore[1])) { best = it; bestScore = score; }
      }
    }
  }
  if (!best) return null;
  const promo = data.promoByCode.get(best.code);
  const onSale = promo && promo.price < best.price;
  return {
    code: best.code,
    name: best.name,
    regularPrice: best.price,
    price: onSale ? promo.price : best.price,
    promo: onSale ? { clubOnly: promo.clubOnly, description: promo.description, end: promo.end } : null,
  };
}

// הסניפים באזור שאפשר להשוות ביניהם
async function nearbyStores(user, errors = []) {
  if (!user.location) return [];
  const out = [];
  for (const chain of comparableChains().filter((c) => !user.chains || user.chains.includes(c.id))) {
    try {
      const near = await geo.storesWithin(await israel.chainStores(chain), user.location, user.radiusKm || 10);
      for (const s of near) out.push({ chain: chain.id, chainName: chain.name, storeId: s.storeId, name: s.name, address: [s.address, s.city].filter(Boolean).join(', '), km: s.km });
    } catch (e) {
      errors.push(`${chain.name}: ${e.message}`);
    }
  }
  return out.sort((a, b) => a.km - b.km).slice(0, 60);
}

async function compare(items, stores) {
  const texts = [...new Set(items.map((t) => String(t).trim()).filter(Boolean))].slice(0, 100);
  const chosen = stores.slice(0, MAX_STORES);
  const results = await Promise.all(chosen.map(async (s) => {
    const chain = comparableChains().find((c) => c.id === s.chain);
    const base = { chain: s.chain, chainName: chain?.name || s.chain, storeId: String(s.storeId), name: s.name || '' };
    if (!chain) return { ...base, error: 'unknown chain' };
    try {
      const data = await storeData(chain, String(s.storeId));
      const lines = texts.map((text) => ({ text, ...(pick(text, data) || { missing: true }) }));
      const found = lines.filter((l) => !l.missing);
      return { ...base, lines, total: round(found.reduce((a, l) => a + l.price, 0)), found: found.length };
    } catch (e) {
      return { ...base, error: e.message };
    }
  }));
  // השוואה הוגנת: סכום רק על הפריטים שנמצאו בכל הסניפים שנבדקו בהצלחה
  const ok = results.filter((r) => !r.error);
  const common = texts.filter((t) => ok.every((r) => r.lines.some((l) => l.text === t && !l.missing)));
  for (const r of ok) r.commonTotal = round(r.lines.filter((l) => common.includes(l.text)).reduce((a, l) => a + l.price, 0));
  const cheapest = ok.length && common.length ? ok.reduce((a, b) => (b.commonTotal < a.commonTotal ? b : a)) : null;
  return { items: texts, common: common.length, cheapest: cheapest ? `${cheapest.chain}|${cheapest.storeId}` : null, stores: results, at: new Date().toISOString() };
}

const round = (n) => Math.round(n * 100) / 100;

module.exports = { compare, nearbyStores, pick, MAX_STORES };
