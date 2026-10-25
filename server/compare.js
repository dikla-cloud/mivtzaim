// השוואת עלות העגלה (״חסר בבית״) בין עד 4 סניפים, לפי קובצי המחירים והמבצעים הרשמיים (ישראל).
// לכל פריט נבחר בכל סניף המוצר הזול ביותר שמתאים לו (עדיפות למוצר ששמו מתחיל במילה שחיפשנו),
// ואם יש עליו מבצע בתוקף ליחידה אחת – המחיר במבצע. כך רואים איפה העגלה הכי זולה היום.
const israel = require('./providers/israel');
const xml = require('./xml');
const geo = require('./geo');
const { tokens, variantsOf, matchVariants } = require('./match');

const TTL = 3 * 3600000; // קובצי סניף נשמרים בזיכרון 3 שעות
const MAX_CACHED = 12;
const MAX_STORES = 12;
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

// מחיר בפועל של מוצר בסניף (כולל מבצע ליחידה אחת, אם יש)
function priced(best, data, extra = {}) {
  const promo = data.promoByCode.get(best.code);
  const onSale = promo && promo.price < best.price;
  return {
    code: best.code,
    name: best.name,
    regularPrice: best.price,
    price: onSale ? promo.price : best.price,
    promo: onSale ? { clubOnly: promo.clubOnly, description: promo.description, end: promo.end } : null,
    ...extra,
  };
}

// כל המוצרים בסניף שמתאימים לפריט, עם „דרגת התאמה”: 0 = המילה הראשונה בשם היא בדיוק המילה שחיפשנו,
// 1 = מתחילה בה, 2 = המילה באמצע השם
function candidates(text, data) {
  const out = new Map();
  for (const alt of String(text).split('|').map((x) => x.trim()).filter((x) => x && !/^\d+$/.test(x))) {
    const qt = tokens(alt);
    for (const it of data.items) {
      if (!matchVariants(qt, it.variants)) continue;
      const [w0, w1] = it.variants;
      const tier = w0 === qt[0] || w1 === qt[0] ? 0 : w0?.startsWith(qt[0]) || w1?.startsWith(qt[0]) ? 1 : 2;
      if (!out.has(it.code) || out.get(it.code).tier > tier) out.set(it.code, { ...it, tier });
    }
  }
  const best = Math.min(...[...out.values()].map((c) => c.tier));
  // אם יש התאמות טובות (0/1) – רק הן; „שוקו בטעם חלב” לא נכנס כשמחפשים „חלב”
  return new Map([...out].filter(([, c]) => c.tier <= Math.max(best, 1)));
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
  return priced(best, data);
}

// מיון מועמדים: קודם התאמה טובה יותר, אחר כך כמה שיותר סניפים, ואז הזול בממוצע
const byFit = (a, b) => a.tier - b.tier || b.n - a.n || a.sum / a.n - b.sum / b.n;

// בחירת אותו מוצר בכל הסניפים: ברקוד שמשותף לכמה שיותר סניפים (ובתיקו – התאמה טובה יותר, ואז הזול בממוצע).
// כך משווים „שוקולית 850 גרם” ל„שוקולית 850 גרם”, ולא לקופסה של 500 גרם ברשת אחרת.
function commonCode(text, datas) {
  const counts = new Map();
  for (const d of datas) {
    for (const c of candidates(text, d).values()) {
      const e = counts.get(c.code) || { code: c.code, n: 0, tier: c.tier, sum: 0 };
      e.n += 1; e.sum += c.price; e.tier = Math.min(e.tier, c.tier);
      counts.set(c.code, e);
    }
  }
  // קודם התאמה טובה יותר („חלב” ולא „חלבה”), אחר כך כמה שיותר סניפים, ואז הזול בממוצע
  const need = Math.min(2, datas.length);
  const best = [...counts.values()].filter((e) => e.n >= need).sort(byFit)[0];
  return best ? best.code : null;
}

// הסניפים באזור שאפשר להשוות ביניהם
// הסניפים באזור. בפעם הראשונה האיתור על המפה לוקח כמה דקות (כתובת אחת בשנייה),
// ולכן הוא רץ ברקע: מחזירים את מה שכבר נמצא, והאפליקציה מבקשת שוב עד שהכול מוכן.
const storeJobs = new Map(); // מפתח: מיקום + רדיוס + רשתות → { list, errors, done, at }
const JOB_TTL = 30 * 60000;
function storesJob(user) {
  const L = user.location;
  const chains = israel.chains.filter((c) => !user.chains || user.chains.includes(c.id));
  const key = `${L.lat.toFixed(3)},${L.lon.toFixed(3)}|${user.radiusKm || 10}|${chains.map((c) => c.id).join(',')}`;
  const old = storeJobs.get(key);
  if (old && (!old.done || Date.now() - old.at < JOB_TTL)) return old;
  const job = { list: [], errors: [], done: false, at: Date.now() };
  storeJobs.set(key, job);
  job.promise = (async () => {
    const entry = (chain, s, km) => ({
      chain: chain.id, chainName: chain.name, storeId: s.storeId, name: s.name, address: [s.address, s.city].filter(Boolean).join(', '), km,
      web: Boolean(chain.web), online: km == null,
    });
    // שלב 1: מכל הרשתות – סניפי אונליין (בלי מרחק) ומועמדים לפי העיר
    const all = [];
    for (const chain of chains) {
      try {
        const stores = await israel.chainStores(chain);
        // סניף אונליין (למשל שופרסל ONLINE): משלוח עד הבית, בלי מיקום. רק לרשתות עם מחירון מלא
        if (!chain.web) for (const s of await geo.nearestOnline(stores, L)) job.list.push(entry(chain, s, null));
        for (const c of await geo.nearCandidates(stores, L, user.radiusKm || 10)) all.push({ chain, ...c });
      } catch (e) {
        job.errors.push(`${chain.name}: ${e.message}`);
      }
    }
    // שלב 2: איתור מדויק – מהקרוב לרחוק, בכל הרשתות יחד
    all.sort((a, b) => a.approx - b.approx);
    for (const { chain, s } of all) {
      const found = await geo.locate(s, L, user.radiusKm || 10);
      // web: רשת בלי מחירון מלא (רק מבצעים) – אפשר לבחור אותה לבדיקת מבצעים, אבל לא להשוואת עגלה
      if (found) job.list.push(entry(chain, found, found.km));
    }
  })().finally(() => { job.done = true; job.at = Date.now(); });
  return job;
}

// wait: כמה זמן לחכות לפני שמחזירים תוצאה חלקית
async function nearbyStores(user, errors = [], { wait = Infinity } = {}) {
  if (!user.location) return { stores: [], loading: false };
  const job = storesJob(user);
  if (!job.done) await Promise.race([job.promise, new Promise((r) => setTimeout(r, wait === Infinity ? 2 ** 31 - 1 : wait))]);
  errors.push(...job.errors);
  return { stores: [...job.list].sort((a, b) => (a.km ?? -1) - (b.km ?? -1)).slice(0, 250), loading: !job.done };
}

const uniqTexts = (items) => [...new Set(items.map((t) => String(t).trim()).filter(Boolean))].slice(0, 100);
const hasBarcode = (text) => String(text).split('|').some((a) => /^\d{7,14}$/.test(a.trim()));

// קובצי המחירים של הסניפים שנבחרו (מהזיכרון, או הורדה)
async function loadStores(stores) {
  const chosen = stores.filter((s) => comparableChains().some((c) => c.id === s.chain)).slice(0, MAX_STORES);
  return Promise.all(chosen.map(async (s) => {
    const chain = comparableChains().find((c) => c.id === s.chain);
    const base = { chain: s.chain, chainName: chain?.name || s.chain, storeId: String(s.storeId), name: s.name || '' };
    try {
      return { base, data: await storeData(chain, String(s.storeId)) };
    } catch (e) {
      return { base, error: e.message };
    }
  }));
}

// „למה התכוונת?” – לכל פריט בלי ברקוד ובלי בחירה קודמת: המוצרים האפשריים בסניפים שנבחרו.
// all: גם פריטים שכבר נבחר להם מוצר (כדי לשנות את הבחירה)
async function options(items, stores, pins = {}, { all = false, limit = 5 } = {}) {
  const datas = (await loadStores(stores)).filter((x) => x.data).map((x) => x.data);
  const out = [];
  for (const text of uniqTexts(items)) {
    const pin = pins[pinKey(text)];
    if (hasBarcode(text) || (pin && !all)) continue;
    const counts = new Map();
    for (const d of datas) {
      for (const c of candidates(text, d).values()) {
        const promo = d.promoByCode.get(c.code);
        const price = promo && promo.price < c.price ? promo.price : c.price;
        const e = counts.get(c.code) || { code: c.code, name: c.name, n: 0, tier: c.tier, sum: 0, min: price, max: price };
        e.n += 1; e.sum += price; e.tier = Math.min(e.tier, c.tier);
        e.min = Math.min(e.min, price); e.max = Math.max(e.max, price);
        counts.set(c.code, e);
      }
    }
    const list = [...counts.values()].sort(byFit);
    // פריט שיש לו רק מוצר אחד אפשרי – אין מה לשאול
    if (list.length < 2 && !all) continue;
    out.push({
      text: text.split('|')[0],
      pin: pin || null,
      auto: commonCode(text, datas),
      stores: datas.length,
      options: list.slice(0, limit).map(({ code, name, n, min, max }) => ({ code, name, n, min: round(min), max: round(max) })),
    });
  }
  return { items: out, stores: datas.length };
}

// pins: מה שהמשתמש בחר לפריט – { [פריט]: ברקוד | 'any' (לא משנה המותג – הכי זול בכל סניף) | 'auto' (בחירה אוטומטית, לא לשאול שוב) }
async function compare(items, stores, pins = {}) {
  const texts = uniqTexts(items);
  const loaded = await loadStores(stores);
  const datas = loaded.filter((x) => x.data).map((x) => x.data);
  // לכל פריט: הברקוד שמשווים (שנקבע ידנית, או המשותף לכמה שיותר סניפים)
  const codes = Object.fromEntries(texts.map((t) => {
    const pinned = pins[pinKey(t)];
    if (pinned === 'any') return [t, { code: null, pinned: false, any: true }];
    return [t, /^\d+$/.test(pinned || '') ? { code: pinned, pinned: true } : { code: commonCode(t, datas), pinned: false }];
  }));
  const results = loaded.map(({ base, data, error }) => {
    if (error) return { ...base, error };
    const lines = texts.map((text) => {
      const { code, pinned, any } = codes[text];
      if (any) { // „לא משנה המותג”: הזול שמתאים בכל סניף
        const p = pick(text, data);
        return p ? { text, ...p, any: true } : { text, missing: true };
      }
      const exact = code && data.byCode.get(code);
      if (exact) return { text, ...priced(exact, data, { pinned }) };
      // המוצר עצמו לא נמכר כאן – מוצר דומה (הזול מבין המתאימים), מסומן ≈
      const similar = pick(text.split('|')[0], data);
      return similar ? { text, ...similar, similar: Boolean(code), pinned } : { text, missing: true };
    });
    const found = lines.filter((l) => !l.missing);
    return { ...base, lines, total: round(found.reduce((a, l) => a + l.price, 0)), found: found.length };
  });
  // השוואה הוגנת: סכום רק על הפריטים שנמצאו בכל הסניפים שנבדקו בהצלחה
  const ok = results.filter((r) => !r.error);
  const common = texts.filter((t) => ok.every((r) => r.lines.some((l) => l.text === t && !l.missing)));
  for (const r of ok) r.commonTotal = round(r.lines.filter((l) => common.includes(l.text)).reduce((a, l) => a + l.price, 0));
  const cheapest = ok.length && common.length ? ok.reduce((a, b) => (b.commonTotal < a.commonTotal ? b : a)) : null;
  return { items: texts, common: common.length, cheapest: cheapest ? `${cheapest.chain}|${cheapest.storeId}` : null, stores: results, at: new Date().toISOString() };
}

// מפתח לפריט ב„מוצרים קבועים” (בלי רווחים כפולים ואותיות גדולות)
const pinKey = (t) => String(t).split('|')[0].trim().replace(/\s+/g, ' ').toLowerCase();

const round = (n) => Math.round(n * 100) / 100;

module.exports = { compare, options, nearbyStores, pick, candidates, commonCode, pinKey, MAX_STORES };
