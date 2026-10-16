// אוסטרליה: המבצעים (Specials) באתרי Woolworths ו-Coles.
// שתי הרשתות מפרסמות מחירים ארציים באתר, והן פרוסות בכל הערים הגדולות.
// אלה ממשקים לא רשמיים של האתרים – אם אחד מהם ישתנה או יחסום, זה יופיע ב„מה נבדק בסריקה”.
const { Session } = require('../http');
const translate = require('../translate');

const BROWSER = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  'Accept-Language': 'en-AU,en;q=0.9',
};
const PER_ITEM = 6; // כמה מבצעים להציג לכל מוצר מכל רשת

const deal = (chain, entry, p) => ({
  key: `au|${chain}|${p.id}|${p.price}`,
  listItem: entry.text,
  product: p.name,
  regularPrice: p.was || null,
  promoPrice: p.price,
  currency: 'AUD',
  minQty: null,
  description: p.terms || 'Special',
  start: null,
  end: p.end || null,
  clubOnly: false,
  chain,
  store: `${chain} (מחיר ארצי באתר)`,
  address: '',
  km: null,
  url: p.url || null,
  source: 'au',
});

const woolworths = {
  name: 'Woolworths',
  async session() {
    const s = new Session();
    await s.fetch('https://www.woolworths.com.au/', { headers: BROWSER });
    return s;
  },
  async search(s, term) {
    const res = await s.fetch('https://www.woolworths.com.au/apis/ui/Search/products', {
      method: 'POST',
      headers: { ...BROWSER, 'Content-Type': 'application/json', Accept: 'application/json', Origin: 'https://www.woolworths.com.au', Referer: 'https://www.woolworths.com.au/' },
      body: JSON.stringify({
        Filters: [], IsSpecial: false, Location: `/shop/search/products?searchTerm=${encodeURIComponent(term)}`,
        PageNumber: 1, PageSize: 36, SearchTerm: term, SortType: 'TraderRelevance',
      }),
    });
    const json = await res.json();
    const products = (json.Products || []).flatMap((g) => g.Products || []);
    return {
      count: products.length,
      specials: products.filter((p) => p.IsOnSpecial && p.Price).map((p) => ({
        id: p.Stockcode, name: p.DisplayName || p.Name, price: p.Price,
        was: p.WasPrice && p.WasPrice > p.Price ? p.WasPrice : null,
        terms: 'Special',
        url: p.Stockcode ? `https://www.woolworths.com.au/shop/productdetails/${p.Stockcode}` : null,
      })),
    };
  },
};

const coles = {
  name: 'Coles',
  async session() {
    const s = new Session();
    const html = await s.text('https://www.coles.com.au/', { headers: BROWSER });
    s.buildId = (html.match(/"buildId"\s*:\s*"([^"]+)"/) || [])[1];
    if (!s.buildId) throw new Error('האתר של Coles לא החזיר את המידע הנדרש (ייתכן שחסם את השרת)');
    return s;
  },
  async search(s, term) {
    const res = await s.fetch(`https://www.coles.com.au/_next/data/${s.buildId}/en/search/products.json?q=${encodeURIComponent(term)}`, { headers: { ...BROWSER, Accept: 'application/json' } });
    const json = await res.json();
    const results = (json.pageProps?.searchResults?.results || []).filter((r) => r._type === 'PRODUCT');
    return {
      count: results.length,
      specials: results
        .filter((r) => r.pricing?.now && (r.pricing.promotionType || (r.pricing.was && r.pricing.was > r.pricing.now)))
        .map((r) => ({
          id: r.id, name: [r.brand, r.name, r.size].filter(Boolean).join(' '), price: r.pricing.now,
          was: r.pricing.was > r.pricing.now ? r.pricing.was : null,
          terms: r.pricing.offerDescription || r.pricing.specialType || 'Special',
          url: r.id ? `https://www.coles.com.au/product/${r.id}` : null,
        })),
    };
  },
};

module.exports = {
  id: 'australia',
  name: 'Woolworths + Coles (אוסטרליה)',
  countries: ['AU'],
  async scan({ list, errors, report }) {
    report.note = 'מבצעי השבוע באתרי Woolworths ו-Coles. המחירים באתרים ארציים, ושתי הרשתות פרוסות בכל הערים.';
    const terms = await translate(list.map((x) => x.text), 'en');
    for (const e of list) report.items[e.text] = { term: terms[e.text] || e.text, translated: Boolean(terms[e.text]), offers: 0 };
    const deals = [];
    for (const retailer of [woolworths, coles]) {
      const r = { name: retailer.name, nearby: null, stores: [], deals: 0, error: null };
      report.chains.push(r);
      let s;
      try {
        s = await retailer.session();
      } catch (e) {
        r.error = e.message;
        errors.push(`${retailer.name}: ${e.message}`);
        continue;
      }
      for (const entry of list) {
        const info = report.items[entry.text];
        try {
          const { count, specials } = await retailer.search(s, info.term);
          info.offers += count;
          const found = specials.slice(0, PER_ITEM).map((p) => deal(retailer.name, entry, p));
          r.deals += found.length;
          deals.push(...found);
        } catch (e) {
          r.error = `חיפוש „${info.term}” נכשל: ${e.message}`;
          errors.push(`${retailer.name} / ${info.term}: ${e.message}`);
        }
      }
    }
    return deals;
  },
};
