// רשתות שמפרסמות את קובצי השקיפות כרשימת קישורים בעמוד אינטרנט (למשל קרפור).
// מחפשים בעמוד קישורים לקבצים בשמות התקניים: Stores… / PriceFull… / PromoFull…
const { Session } = require('../http');
const xml = require('../xml');

const BROWSER = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36' };

function fileLinks(html, base) {
  const out = [];
  for (const m of html.matchAll(/(?:href|src)\s*=\s*["']([^"']+)["']|["'](https?:\/\/[^"']+\.(?:gz|xml)[^"']*)["']/gi)) {
    const raw = (m[1] || m[2]).replace(/&amp;/g, '&');
    const name = decodeURIComponent(raw.split('/').pop().split('?')[0]);
    const f = name.match(/^(Stores|PriceFull|PromoFull)\d+-(\d+)-(\d{12})/i);
    if (f) out.push({ url: new URL(raw, base).href, kind: f[1].toLowerCase(), store: Number(f[2]), stamp: f[3] });
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
  const latest = (ls, kind, store) => ls
    .filter((l) => l.kind === kind && (store == null || l.store === Number(store)))
    .sort((a, b) => b.stamp.localeCompare(a.stamp))[0];

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
  chains: [
    chain('carrefour', 'קרפור (כולל יינות ביתן)', pages('CARREFOUR_PAGES', 'https://prices.carrefour.co.il/')),
  ],
};
