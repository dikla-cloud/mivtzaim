// רשתות שמפרסמות את קובצי השקיפות כרשימת קישורים בעמוד אינטרנט (למשל קרפור).
// מחפשים בעמוד קישורים לקבצים בשמות התקניים: Stores… / PriceFull… / PromoFull…
const { Session } = require('../http');
const xml = require('../xml');

const BROWSER = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36' };

// שם קובץ תקני: Stores/PriceFull/PromoFull + קוד רשת + סניף + חותמת זמן.
// קרפור מוסיפה גם תת-רשת: Price7290055700007-001-002-20261016-140004.gz (רשת-תת רשת-סניף-תאריך-שעה)
// ויקטורי: StoresFull7290696200003-000-202610250200.xml.gz
const NAME = /^(StoresFull|Stores|PriceFull|PromoFull|Price|Promo)(\d{13})-(\d{3})(?:-(\d{3}))?-(\d{8})-?(\d{4,6})/i;

function parseName(name) {
  const f = String(name).match(NAME);
  if (!f) return null;
  return { kind: f[1].toLowerCase().replace('storesfull', 'stores'), code: f[2], store: Number(f[4] ?? f[3]), stamp: f[5] + f[6].padEnd(6, '0') };
}

function fileLinks(html, base) {
  const out = [];
  const add = (raw, url) => {
    const name = decodeURIComponent(String(raw).split('/').pop().split('?')[0]);
    const f = parseName(name);
    if (f) out.push({ ...f, name, url });
  };
  // קישורים רגילים בעמוד
  for (const m of html.matchAll(/(?:href|src)\s*=\s*["']([^"'$]+)["']|["'](https?:\/\/[^"']+\.(?:gz|xml)[^"']*)["']/gi)) {
    const raw = (m[1] || m[2]).replace(/&amp;/g, '&');
    add(raw, new URL(raw, base).href);
  }
  // רשימה שמוטמעת בקוד העמוד: const files = [{"name": "..."}], והקישור נבנה מ-origin + path + name
  const list = html.match(/(?:const|let|var)\s+files\s*=\s*(\[[\s\S]*?\])\s*[;\n]/);
  if (list) {
    const pathVar = (html.match(/(?:const|let|var)\s+path\s*=\s*["'`]([^"'`]*)["'`]/) || [])[1];
    const origin = new URL(base).origin;
    const dir = pathVar != null ? `${origin}/${pathVar.replace(/^\/+|\/+$/g, '')}` : new URL('.', base).href.replace(/\/$/, '');
    try {
      for (const f of JSON.parse(list[1])) if (f && f.name) add(f.name, `${dir.replace(/\/$/, '')}/${f.name}`.replace(/([^:])\/\//g, '$1/'));
    } catch { /* לא JSON תקין */ }
  }
  return out;
}

function chain(id, name, pages) {
  async function links(s) {
    const all = [];
    for (const page of pages) all.push(...fileLinks(await s.text(page, { headers: BROWSER }), page));
    if (!all.length) throw new Error(`לא נמצאו קובצי מחירים בעמוד ${pages[0]}`);
    return all;
  }
  // מעדיפים קובץ מלא (PriceFull/PromoFull), ואם אין – הקובץ החלקי (Price/Promo)
  const latest = (ls, kind, store) => {
    for (const k of kind === 'stores' ? ['stores'] : [kind, kind.replace('full', '')]) {
      const f = ls
        .filter((l) => l.kind === k && (store == null || l.store === Number(store)))
        .sort((a, b) => b.stamp.localeCompare(a.stamp))[0];
      if (f) return f;
    }
    return null;
  };

  return {
    id, name,
    async stores() {
      const s = new Session();
      const f = latest(await links(s), 'stores');
      if (!f) throw new Error(`${name}: לא נמצא קובץ סניפים`);
      return xml.parseStores(await s.buffer(f.url, { headers: BROWSER }));
    },
    async storeFiles(storeId) {
      const s = new Session();
      const ls = await links(s);
      const promo = latest(ls, 'promofull', storeId);
      const price = latest(ls, 'pricefull', storeId);
      if (!promo || !price) throw new Error(`${name}: חסרים קבצים לסניף ${storeId} בעמוד הקבצים`);
      return { promos: await s.buffer(promo.url, { headers: BROWSER }), prices: await s.buffer(price.url, { headers: BROWSER }) };
    },
  };
}

const pages = (env, def) => (process.env[env] || def).split(',').map((x) => x.trim()).filter(Boolean);

module.exports = {
  fileLinks,
  parseName,
  BROWSER,
  chains: [
    chain('carrefour', 'קרפור (כולל יינות ביתן)', pages('CARREFOUR_PAGES', 'https://prices.carrefour.co.il/')),
  ],
};
