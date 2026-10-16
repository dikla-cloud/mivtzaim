// ניצת הדובדבן: אין קובצי שקיפות, אז קוראים את דף „מבצעי מועדון” באתר.
// הדף מקשר לקטגוריות (productslist.aspx?offerid=-1&catid=…), ובכל קטגוריה כרטיסי מוצרים
// עם מחיר רגיל (מחוק) ומחיר מבצע. המבצעים זהים בכל הסניפים, ולא מתפרסם תאריך סיום.
// רשימת הסניפים מגיעה מהנתונים המובנים (JSON-LD) בדף הסניפים.
const { Session } = require('../http');

const BASE = process.env.NIZAT_BASE || 'https://www.nizat.com/';
const PROMO_PAGE = BASE + encodeURI('מבצעי-מועדון');
const BROWSER = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36' };
const TTL = 6 * 3600000; // המבצעים נקראים מהאתר לכל היותר פעם ב-6 שעות, לכל המשתמשים יחד
const PARALLEL = 4;
const PAGE = { headers: BROWSER, timeout: 25000, tries: 2 }; // דף שלא נענה תוך 25 שניות – מדלגים עליו

const decode = (s) => String(s)
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
  .replace(/\s+/g, ' ').trim();
const num = (s) => (s == null ? null : Number(String(s).replace(',', '.')));

function categoryLinks(html) {
  return [...new Set([...html.matchAll(/href="([^"]*productslist\.aspx\?[^"]*catid=\d+[^"]*)"/gi)].map((m) => new URL(decode(m[1]), BASE).href))];
}

// כרטיסי המוצרים בדף קטגוריה. רק מוצרים עם מחיר מחוק נחשבים מבצע.
function parseProducts(html) {
  const out = [];
  const re = /rptproducts_hplpname_(\d+)"[^>]*?href="([^"]*)"[^>]*>([^<]+)<\/a>[\s\S]*?rptproducts_productprice_\1"[^>]*>([\s\S]*?)<\/div>/g;
  for (const m of html.matchAll(re)) {
    const priceHtml = m[4];
    const regular = priceHtml.match(/line-through[^>]*>\s*([\d.,]+)/);
    const sale = priceHtml.match(/color:\s*#A61D22[^>]*>\s*([\d.,]+)/i) || priceHtml.match(/<\/span>\s*<span[^>]*>\s*([\d.,]+)\s*<\/span>\s*$/);
    if (!regular || !sale) continue;
    const per100 = priceHtml.match(/pricefor100gram[^>]*>([^<]+)</);
    const href = new URL(decode(m[2]), BASE).href;
    out.push({
      id: (href.match(/-i(\d+)(?:$|[?#])/) || [])[1] || href,
      name: decode(m[3]),
      url: href,
      regularPrice: num(regular[1]),
      promoPrice: num(sale[1]),
      per100: per100 ? decode(per100[1]) : '',
    });
  }
  return out;
}

// סניפים מתוך ה-JSON-LD בדף הסניפים
function parseStores(html) {
  const found = [];
  const walk = (o) => {
    if (!o || typeof o !== 'object') return;
    if (Array.isArray(o)) return o.forEach(walk);
    if (o.address && typeof o.address === 'object' && o.name) found.push(o);
    Object.values(o).forEach(walk);
  };
  for (const m of html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try { walk(JSON.parse(m[1])); } catch { /* בלוק לא תקין – מדלגים */ }
  }
  const seen = new Set();
  return found.map((o) => {
    const street = decode(o.address.streetAddress || '').replace(/^.*:\s*/, ''); // „עברנו לכתובת החדשה: החרט 7…”
    const city = decode(o.address.addressLocality || '');
    return {
      storeId: decode(o.name).replace(/^ניצת הדובדבן\s*-\s*/, '') || city,
      name: decode(o.name),
      address: street.split(',')[0].trim(),
      city,
    };
  }).filter((s) => s.city && !seen.has(s.storeId) && seen.add(s.storeId));
}

let cache = null; // { at, deals }
let pending = null;

async function loadDeals(onProgress = () => {}) {
  const s = new Session();
  const cats = categoryLinks(await s.text(PROMO_PAGE, PAGE));
  if (!cats.length) throw new Error('לא נמצאו קטגוריות בדף המבצעים');
  const byId = new Map();
  let failed = 0;
  for (let i = 0; i < cats.length; i += PARALLEL) {
    await Promise.all(cats.slice(i, i + PARALLEL).map(async (u) => {
      try {
        for (const p of parseProducts(await s.text(u, PAGE))) byId.set(p.id, p);
      } catch { failed++; }
    }));
    onProgress(Math.min(i + PARALLEL, cats.length), cats.length, byId.size);
  }
  if (!byId.size && failed) throw new Error('דפי הקטגוריות לא נטענו');
  return [...byId.values()];
}

module.exports = {
  id: 'nizat',
  name: 'ניצת הדובדבן',
  web: true,
  parseProducts,
  parseStores,
  categoryLinks,
  async stores() {
    const stores = parseStores(await new Session().text(BASE + 'snifim.aspx', PAGE));
    if (!stores.length) throw new Error('לא נמצאה רשימת סניפים בדף הסניפים');
    return stores;
  },
  // כל המבצעים ברשת (משותפים לכל הסניפים).
  // wait: כמה זמן לחכות לטעינה ראשונה. אם לא הספיקה – מחזיר null והטעינה ממשיכה ברקע לסריקה הבאה.
  async deals({ wait = Infinity, onProgress } = {}) {
    if (cache && Date.now() - cache.at < TTL) return cache.deals;
    pending ||= loadDeals(onProgress).then((deals) => { cache = { at: Date.now(), deals }; return deals; }).finally(() => { pending = null; });
    if (wait === Infinity) return pending;
    let timer;
    const late = new Promise((r) => { timer = setTimeout(() => r(null), wait); });
    try { return await Promise.race([pending, late]); } finally { clearTimeout(timer); }
  },
};
