// השוואת עלות העגלה (״חסר בבית״) בין עד 4 סניפים, לפי קובצי המחירים והמבצעים הרשמיים (ישראל).
// לכל פריט נבחר בכל סניף המוצר הזול ביותר שמתאים לו (עדיפות למוצר ששמו מתחיל במילה שחיפשנו),
// ואם יש עליו מבצע בתוקף ליחידה אחת – המחיר במבצע. כך רואים איפה העגלה הכי זולה היום.
const israel = require('./providers/israel');
const xml = require('./xml');
const geo = require('./geo');
const { tokens, variantsOf, matchVariants, alternatives, stem } = require('./match');

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
      // כל המבצעים שבתוקף לכל מוצר – גם מבצעי כמות („3 ב-20”), לחישוב לפי הכמות בעגלה
      const promos = new Map();
      for (const p of xml.parsePromos(files.promos)) {
        if (!p.price) continue;
        if ((p.end && new Date(p.end) < now) || (p.start && new Date(p.start) > now)) continue;
        const promo = { price: p.price, minQty: p.minQty, clubOnly: p.clubOnly, description: p.description, end: p.end };
        for (const code of p.items) {
          if (!promos.has(code)) promos.set(code, []);
          promos.get(code).push(promo);
          if (p.minQty && p.minQty > 1) continue;
          const cur = promoByCode.get(code);
          if (!cur || p.price < cur.price) promoByCode.set(code, promo);
        }
      }
      const items = [];
      // לא מוצרים אמיתיים: פריטי קופון/מתנה במחיר סמלי (״ה.נ קופון … מתנה״ ב-0.01 ₪)
      const fake = (it) => it.price < 0.1 || /קופון|^ה\.נ\b/.test(it.name || '');
      for (const [code, it] of prices) if (it.price && !fake(it)) items.push({ code, name: it.name, price: it.price, weighted: Boolean(it.weighted), variants: variantsOf(it.name) });
      const data = { at: Date.now(), items, byCode: new Map(items.map((i) => [i.code, i])), promoByCode, promos };
      cache.set(key, data);
      while (cache.size > MAX_CACHED) cache.delete(cache.keys().next().value);
      return data;
    })().finally(() => pending.delete(key)));
  }
  return pending.get(key);
}

const DEFAULT_KG = 0.5; // מוצר במשקל בלי כמות שנקבעה – חצי ק"ג

// מחיר כולל של מבצע כמות. „3 ב-20” בתיאור – 20 לשלושה. אחרת: מחיר גבוה מהמחיר הרגיל ליחידה הוא כנראה
// המחיר לכל הכמות, ונמוך ממנו – מחיר ליחידה. מבצע שלא זול מהמחיר הרגיל – לא נחשב
function multiTotal(p, regular, m) {
  const d = String(p.description || '').match(/(\d+)\s*(?:יח['׳]?|יחידות|פריטים|מוצרים)?\s*ב\s*[-–]?\s*₪?\s*(\d+(?:\.\d+)?)/);
  const total = d && Number(d[1]) === m ? Number(d[2]) : p.price >= regular ? p.price : p.price * m;
  return total > 0 && total < regular * m ? total : null;
}

// עלות הפריט בעגלה: לפי הכמות (או המשקל), עם המבצע המשתלם ביותר.
// club: האם לחשב גם מבצעי מועדון ברשת הזו
function lineCost(it, data, { qty = 1, kg = null, club = true } = {}) {
  const regular = it.price;
  const all = data.promos?.get(it.code) ?? (data.promoByCode?.get(it.code) ? [data.promoByCode.get(it.code)] : []);
  const promos = all.filter((p) => club || !p.clubOnly);
  if (it.weighted) { // מחיר לק"ג
    const amount = kg || DEFAULT_KG;
    let best = { unit: regular, promo: null };
    for (const p of promos) if ((!p.minQty || p.minQty <= 1) && p.price < best.unit) best = { unit: p.price, promo: p };
    return { qty: 1, kg: amount, weighted: true, price: best.unit, cost: best.unit * amount, promo: best.promo };
  }
  let best = { cost: regular * qty, promo: null };
  let hint = null; // מבצע כמות שעוד לא הגענו אליו – רמז („3 ב-20”)
  for (const p of promos) {
    const m = p.minQty && p.minQty > 1 ? Math.round(p.minQty) : 1;
    let c;
    if (m === 1) c = p.price < regular ? p.price * qty : null;
    else {
      const total = multiTotal(p, regular, m);
      if (total == null) continue;
      if (qty < m) { hint ||= p; continue; }
      const groups = Math.floor(qty / m);
      c = groups * total + (qty - groups * m) * regular;
    }
    if (c != null && c < best.cost) best = { cost: c, promo: p };
  }
  return { qty, price: best.cost / qty, cost: best.cost, promo: best.promo, hint: best.promo ? null : hint };
}

// מחיר בפועל של מוצר בסניף (כולל מבצעים לפי הכמות)
function priced(best, data, extra = {}, ctx = {}) {
  const c = lineCost(best, data, ctx);
  const promoInfo = (p) => p && { clubOnly: p.clubOnly, description: p.description, end: p.end, minQty: p.minQty > 1 ? p.minQty : null };
  return {
    code: best.code,
    name: best.name,
    regularPrice: best.price,
    price: round(c.price),
    cost: round(c.cost),
    qty: c.qty,
    ...(c.weighted ? { weighted: true, kg: c.kg } : {}),
    promo: promoInfo(c.promo),
    ...(c.hint ? { hint: promoInfo(c.hint) } : {}),
    ...extra,
  };
}

// כל המוצרים בסניף שמתאימים לפריט, עם „דרגת התאמה”: 0 = המילה הראשונה בשם היא בדיוק המילה שחיפשנו,
// 1 = מתחילה בה, 2 = המילה באמצע השם
function candidates(text, data) {
  const find = (queries) => {
    const out = new Map();
    for (const qt of queries) {
      if (!qt.length) continue;
      for (const it of data.items) {
        if (!matchVariants(qt, it.variants)) continue;
        const [w0, w1] = it.variants;
        const tier = w0 === qt[0] || w1 === qt[0] ? 0 : w0?.startsWith(qt[0]) || w1?.startsWith(qt[0]) ? 1 : 2;
        if (!out.has(it.code) || out.get(it.code).tier > tier) out.set(it.code, { ...it, tier });
      }
    }
    return out;
  };
  const alts = alternatives(text).map(tokens);
  let out = find(alts);
  // לא נמצא כלום – מנסים בלי סיומת יחיד/רבים
  if (!out.size) out = find(alts.map((qt) => qt.map(stem)));
  const best = Math.min(...[...out.values()].map((c) => c.tier));
  // אם יש התאמות טובות (0/1) – רק הן; „שוקו בטעם חלב” לא נכנס כשמחפשים „חלב”
  return new Map([...out].filter(([, c]) => c.tier <= Math.max(best, 1)));
}

// המוצר שנבחר לפריט בסניף: ברקוד אם נכתב, אחרת הזול מבין המתאימים
function pick(text, data, ctx = {}) {
  const code = String(text).split('|').map((a) => a.trim()).find((a) => /^\d{7,14}$/.test(a));
  let best = code && data.byCode.get(code);
  // קודם מוצר שהמילה הראשונה בשמו היא בדיוק המילה שחיפשנו (״חלב טרי״), אחריו מוצר שמתחיל בה (״חלבה״),
  // ורק אחר כך מוצר שהמילה באמצע שמו (״שוקו בטעם חלב״). בתוך כל קבוצה – הזול
  if (!best) for (const c of candidates(text, data).values()) if (!best || c.tier < best.tier || (c.tier === best.tier && c.price < best.price)) best = c;
  if (!best) return null;
  return priced(best, data, {}, ctx);
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

const uniqTexts = (items) => [...new Set(items.map((t) => String(typeof t === 'string' ? t : t?.text || '').trim()).filter(Boolean))].slice(0, 100);
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
    const list = aggregate(datas, (d) => candidates(text, d).values());
    // פריט שיש לו רק מוצר אחד אפשרי – אין מה לשאול
    if (list.length < 2 && !all) continue;
    out.push({
      text: text.split('|')[0],
      pin: pin || null,
      auto: commonCode(text, datas),
      stores: datas.length,
      options: list.slice(0, limit).map(publicOption),
    });
  }
  return { items: out, stores: datas.length };
}

// המוצרים שנמצאו בכל הסניפים, מאוחדים לפי ברקוד: בכמה סניפים, טווח מחירים
function aggregate(datas, found) {
  const counts = new Map();
  for (const d of datas) {
    for (const c of found(d)) {
      const promo = d.promoByCode.get(c.code);
      const price = promo && promo.price < c.price ? promo.price : c.price;
      const e = counts.get(c.code) || { code: c.code, name: c.name, n: 0, tier: c.tier ?? 0, sum: 0, min: price, max: price, weighted: c.weighted };
      e.n += 1; e.sum += price; e.tier = Math.min(e.tier, c.tier ?? 0);
      e.min = Math.min(e.min, price); e.max = Math.max(e.max, price);
      counts.set(c.code, e);
    }
  }
  return [...counts.values()].sort(byFit);
}
const publicOption = ({ code, name, n, min, max, weighted }) => ({ code, name, n, min: round(min), max: round(max), ...(weighted ? { weighted: true } : {}) });

// חיפוש חופשי במסך „למה התכוונת?”: תחילת מילה (״פטרוז״) או ברקוד (גם מצילום)
async function search(q, stores, { limit = 12 } = {}) {
  const datas = (await loadStores(stores)).filter((x) => x.data).map((x) => x.data);
  const query = String(q || '').trim();
  if (!query) return { options: [], stores: datas.length };
  const list = /^\d{4,14}$/.test(query)
    ? aggregate(datas, (d) => [d.byCode.get(query)].filter(Boolean))
    : aggregate(datas, (d) => candidates(query, d).values());
  return { options: list.slice(0, limit).map(publicOption), stores: datas.length };
}

// פריטי העגלה: מחרוזות או { text, qty, kg }. פריט שמופיע פעמיים – פעם אחת
function cartItems(items) {
  const out = new Map();
  for (const x of items) {
    const it = typeof x === 'string' ? { text: x } : x || {};
    const text = String(it.text || '').trim();
    if (!text || out.has(text)) continue;
    const qty = Math.min(Math.max(Math.round(Number(it.qty) || 1), 1), 99);
    const kg = Number(it.kg) > 0 ? Math.min(Number(it.kg), 50) : null;
    out.set(text, { text, qty, kg });
  }
  return [...out.values()].slice(0, 100);
}

const median = (xs) => {
  const a = [...xs].sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};

// opts.pins: מה שהמשתמש בחר לפריט – { [פריט]: ברקוד | 'any' (לא משנה המותג – הכי זול בכל סניף) | 'auto' (בחירה אוטומטית, לא לשאול שוב) }
// opts.clubs: רשתות שהמשתמש חבר במועדון שלהן (null = מבצעי מועדון נחשבים בכל הרשתות)
// opts.shipping: דמי משלוח לסניף – { 'רשת|סניף': ₪ }
//
// כל סניף מקבל מחיר של כל העגלה: פריט שהמוצר המדויק שלו לא נמכר בסניף (חסר, או רק מוצר דומה ≈)
// מקבל מחיר משוער – החציון של המחיר שלו בסניפים שבהם הוא נמכר – ומסומן. כך משווים את אותה עגלה.
async function compare(items, stores, { pins = {}, clubs = null, shipping = {} } = {}) {
  const cart = cartItems(items);
  const texts = cart.map((c) => c.text);
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
    const club = !Array.isArray(clubs) || clubs.includes(base.chain);
    const lines = cart.map(({ text, qty, kg }) => {
      const ctx = { qty, kg, club };
      const { code, pinned, any } = codes[text];
      if (any) { // „לא משנה המותג”: הזול שמתאים בכל סניף
        const p = pick(text, data, ctx);
        return p ? { text, ...p, any: true } : { text, qty, missing: true };
      }
      const exact = code && data.byCode.get(code);
      if (exact) return { text, ...priced(exact, data, { pinned }, ctx) };
      // המוצר עצמו לא נמכר כאן – מוצר דומה (הזול מבין המתאימים), מסומן ≈
      const similar = pick(text.split('|')[0], data, ctx);
      return similar ? { text, ...similar, similar: Boolean(code), pinned } : { text, qty, missing: true };
    });
    return { ...base, lines };
  });
  const ok = results.filter((r) => !r.error);
  // השלמה משוערת: לפריט שיש לו מוצר מדויק בחלק מהסניפים – בשאר הסניפים החציון של המחירים המדויקים
  const notFound = [];
  texts.forEach((text, i) => {
    const ls = ok.map((r) => r.lines[i]);
    const exact = ls.filter((l) => !l.missing && !l.similar);
    const base = exact.length ? exact : ls.filter((l) => !l.missing);
    if (!base.length) { notFound.push(text.split('|')[0]); for (const l of ls) l.excluded = true; return; }
    const est = round(median(base.map((l) => l.cost)));
    for (const l of ls) if (!base.includes(l)) { l.estimated = true; l.estCost = est; }
  });
  for (const r of ok) {
    const counted = r.lines.filter((l) => !l.excluded);
    r.itemsTotal = round(counted.reduce((a, l) => a + (l.estimated ? l.estCost : l.cost), 0));
    r.estimated = counted.filter((l) => l.estimated).length;
    r.found = counted.filter((l) => !l.estimated).length;
    const ship = Number(shipping[`${r.chain}|${r.storeId}`]);
    r.shipping = ship > 0 ? round(ship) : 0;
    r.total = round(r.itemsTotal + r.shipping);
  }
  const counted = texts.length - notFound.length;
  const cheapest = ok.length && counted ? ok.reduce((a, b) => (b.total < a.total ? b : a)) : null;
  return {
    items: texts,
    cart,
    counted,
    notFound,
    cheapest: cheapest ? `${cheapest.chain}|${cheapest.storeId}` : null,
    stores: results,
    at: new Date().toISOString(),
  };
}

// מפתח לפריט ב„מוצרים קבועים” (בלי רווחים כפולים ואותיות גדולות)
const pinKey = (t) => String(t).split('|')[0].trim().replace(/\s+/g, ' ').toLowerCase();

const round = (n) => Math.round(n * 100) / 100;

module.exports = { compare, options, search, nearbyStores, pick, candidates, commonCode, pinKey, lineCost, MAX_STORES };
