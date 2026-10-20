// אוסטרליה: חיפוש בקטלוגי המבצעים של SaleFinder (Coles, Woolworths, ALDI, IGA ועוד).
// האתרים של Woolworths ו-Coles חוסמים את השרת, אבל SaleFinder מרכז את הקטלוגים שלהם.
// אין לו ממשק רשמי, ולכן זה מתאים לשימוש פרטי בלבד (כמו marktguru באוסטריה).
const { Session } = require('../http');
const translate = require('../translate');
const { tr } = require('../i18n');

const BASE = process.env.SALEFINDER_BASE || 'https://www.salefinder.com.au';
const BROWSER = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36' };
const PAGE = { headers: BROWSER, timeout: 40000, tries: 2 };
const PER_ITEM = 8;
// רשתות מזון. מבצעים של רשתות אחרות (בתי מרקחת, חשמל…) לא נכנסים
const GROCERS = { coles: 'Coles', woolworths: 'Woolworths', aldi: 'ALDI', iga: 'IGA', foodland: 'Foodland', drakes: 'Drakes', 'harris-farm-markets': 'Harris Farm', costco: 'Costco' };
const CATALOGUE_TTL = 6 * 3600000;

const decode = (s) => String(s || '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();

// מספר קטלוג ← שם הרשת (כתובת כל מוצר בחיפוש מתחילה במספר הקטלוג שלו)
let catalogues = null;
async function catalogueMap(s) {
  if (catalogues && Date.now() - catalogues.at < CATALOGUE_TTL) return catalogues.map;
  const map = new Map();
  for (const [slug, name] of Object.entries(GROCERS)) {
    try {
      const html = await s.text(`${BASE}/${slug}-catalogue`, PAGE);
      for (const m of html.matchAll(new RegExp(`/${slug}-catalogue/[^"'\\s#]*?/(\\d+)/`, 'g'))) map.set(m[1], name);
    } catch { /* רשת שלא נטענה – פשוט לא תזוהה */ }
  }
  catalogues = { at: Date.now(), map };
  return map;
}

// מוצרים מעמוד החיפוש
function parseSearch(html, cats = new Map()) {
  const out = [];
  const flat = html.replace(/\s+/g, ' ');
  for (const chunk of flat.split(/class="item-landscape/).slice(1)) {
    const name = decode((chunk.match(/data-itemname="([^"]*)"/) || [])[1]);
    const price = Number((chunk.match(/class="price"[^>]*>\s*\$\s?([\d,]+(?:\.\d\d)?)/) || [])[1]?.replace(',', ''));
    if (!name || !price) continue;
    const href = (chunk.match(/href="(\/(\d+)\/[^"]+)"[^>]*class="item-name"/) || chunk.match(/class="item-name"[^>]*href="(\/(\d+)\/[^"]+)"/) || [])[1] || '';
    const catalogueId = (href.match(/^\/(\d+)\//) || [])[1];
    const logo = decode((chunk.match(/item-retailer-logo[^>]*>[\s\S]*?(?:alt|title)="([^"]+)"/) || [])[1]).replace(/\s*(catalogue|logo)$/i, '');
    const save = Number((chunk.match(/Save \$\s?([\d.]+)/i) || [])[1]) || null;
    out.push({
      id: (chunk.match(/data-itemid="(\d+)"/) || [])[1] || href,
      name,
      price,
      regularPrice: save ? Math.round((price + save) * 100) / 100 : null,
      description: decode((chunk.match(/class="price-options[^"]*"[^>]*>([^<]*)/) || [])[1]),
      retailer: cats.get(catalogueId) || logo || '',
      url: href ? `${BASE}${href}` : null,
    });
  }
  return out;
}

// המוצר באמת מכיל את המילה שחיפשנו (מילה שלמה), כדי לא לקבל „Milk Chocolate” על „Milk” כשיש מוצרים טובים יותר
const words = (s) => String(s).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
const relevant = (term, name) => { const n = words(name); return words(term).every((w) => n.includes(w) || n.includes(`${w}s`)); };

module.exports = {
  id: 'salefinder',
  name: 'SaleFinder (קטלוגי מבצעים, אוסטרליה)',
  countries: ['AU'],
  parseSearch,
  relevant,
  GROCERS,
  async scan({ list, errors, report, lang }) {
    report.note = tr(lang, 'חיפוש בקטלוגי המבצעים של רשתות המזון באוסטרליה (SaleFinder). המחירים ארציים או לפי מדינה.');
    const s = new Session();
    const cats = await catalogueMap(s);
    const terms = await translate(list.map((x) => x.text), 'en', 'AU');
    const deals = [];
    const byChain = {};
    for (const entry of list) {
      const term = terms[entry.text]?.term || entry.text;
      const info = (report.items[entry.text] = { term, translated: Boolean(terms[entry.text]), how: terms[entry.text]?.how, offers: 0 });
      try {
        const items = parseSearch(await s.text(`${BASE}/search/${encodeURIComponent(term)}?qs=1`, PAGE), cats)
          .filter((i) => Object.values(GROCERS).includes(i.retailer) && relevant(term, i.name));
        info.offers = items.length;
        for (const i of items.slice(0, PER_ITEM)) {
          byChain[i.retailer] = (byChain[i.retailer] || 0) + 1;
          deals.push({
            key: `sf|${i.id}|${i.price}`,
            listItem: entry.text,
            product: i.name,
            regularPrice: i.regularPrice,
            promoPrice: i.price,
            currency: 'AUD',
            minQty: null,
            description: i.description,
            start: null,
            end: null,
            clubOnly: false,
            chain: i.retailer,
            store: tr(lang, '{chain} (קטלוג מבצעים)', { chain: i.retailer }),
            address: '',
            km: null,
            url: i.url,
            source: 'salefinder',
          });
        }
      } catch (e) {
        info.error = e.message;
        errors.push(`SaleFinder / ${term}: ${e.message}`);
      }
    }
    for (const [name, n] of Object.entries(byChain)) report.chains.push({ name, nearby: null, stores: [], deals: n, error: null });
    return deals;
  },
};
