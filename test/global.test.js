const test = require('node:test');
const assert = require('node:assert');
const os = require('os');
const fs = require('fs');
const path = require('path');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'mv-'));

const marktguru = require('../server/providers/marktguru');
const translate = require('../server/translate');
const { matches } = require('../server/match');

test('list item alternatives with |', () => {
  assert.ok(!matches('חלב 3% | Milch', 'Schärdinger Vollmilch', '1'));
  assert.ok(matches('חלב | vollmilch', 'Schärdinger Vollmilch 3,5%', '1'));
});

test('manual translation after | is used without calling any service', async () => {
  assert.deepEqual(await translate(['חלב 3% | Milch'], 'de'), { 'חלב 3% | Milch': { term: 'Milch', how: 'manual' } });
});

test('glossary translates the items that the online service got wrong', async () => {
  const { lookup } = require('../server/glossary');
  assert.equal(lookup('עוף', 'de'), 'Hähnchen');
  assert.equal(lookup('שמן זית', 'de'), 'Olivenöl');
  assert.equal(lookup('בשר טחון', 'de', 'AT'), 'Faschiertes');
  assert.equal(lookup('בשר טחון', 'de', 'DE'), 'Hackfleisch');
  assert.equal(lookup('בשר צלי', 'de'), 'Rinderbraten');
  assert.equal(lookup("קוטג' 5%", 'en'), 'cottage cheese');
  assert.equal(lookup('שוקולד חלב', 'de'), 'Schokolade');
  assert.equal(lookup('משהו אחר', 'de'), null);
  const { plausible } = require('../server/translate');
  assert.ok(!plausible('שמן זית', 'Ah, Wein von Samos.'));
  assert.ok(!plausible('עוף', 'Einfach.'));
  assert.ok(plausible('קולרבי', 'Kohlrabi'));
});

test('marktguru offer → deal, expired dropped', () => {
  const now = new Date('2026-10-16');
  const o = { id: 5, price: 0.99, oldPrice: 1.49, description: 'Aktion', product: { name: 'Vollmilch' }, brand: { name: 'NÖM' },
    advertisers: [{ name: 'SPAR' }], validityDates: [{ from: '2026-10-14T00:00:00Z', to: '2026-10-20T21:59:59Z' }] };
  const d = marktguru.toDeal(o, { text: 'חלב' }, now);
  assert.equal(d.chain, 'SPAR');
  assert.equal(d.product, 'NÖM Vollmilch');
  assert.equal(d.currency, 'EUR');
  assert.equal(marktguru.toDeal({ ...o, validityDates: [{ to: '2026-10-01' }] }, { text: 'x' }, now), null);
});

test('unsupported country → clear message, no paid fallback', async () => {
  const db = require('../server/db');
  const scanner = require('../server/scanner');
  const d = db.newUser('test', {
    list: [{ id: '1', text: 'חלב' }],
    location: { lat: 37.98, lon: 23.72, label: 'Athens', place: { countryCode: 'GR', country: 'Greece', city: 'Athens', postcode: '105 57' } },
  });
  const r = await scanner.scan(d);
  assert.deepEqual(r.sources, []);
  assert.match(r.errors[0], /אין עדיין מקור מבצעים חינמי/);
});

test('weblist finds standard transparency file links (absolute and relative)', () => {
  const { fileLinks } = require('../server/chains/weblist');
  const html = `<a href="/files/Stores7290055700007-000-202610160200.xml">s</a>
    <a href="https://blob.example/PromoFull7290055700007-012-202610160300.gz?sv=1&amp;x=2">p</a>
    <td onclick="x">PriceFull</td><a href='PriceFull7290055700007-012-202610160310.gz'>f</a><a href="/about">no</a>`;
  const l = fileLinks(html, 'https://prices.carrefour.co.il/');
  assert.deepEqual(l.map((x) => [x.kind, x.store]), [['stores', 0], ['promofull', 12], ['pricefull', 12]]);
  assert.equal(l[0].url, 'https://prices.carrefour.co.il/files/Stores7290055700007-000-202610160200.xml');
  assert.equal(l[1].url, 'https://blob.example/PromoFull7290055700007-012-202610160300.gz?sv=1&x=2');
});

test('australia: SaleFinder search → grocery deals only, retailer from catalogue id', async () => {
  const sf = require('../server/providers/salefinder');
  const item = (id, cat, name, price, save, extra = '') => `<div class="item-landscape" data-itemid="${id}" data-itemname="${name}"> <span class="item-details"> <h1><a href="/${cat}/dairy/${id}/" class="item-name"> ${name} </a></h1> <div class="price-options "> ${save ? `Save $${save}<br />` : ''}<span class="price"> $${price} </span> </div> ${extra}</div>`;
  const search = item('1', '68406', 'Coles Full Cream Milk 3L', '4.50', '0.60') + item('2', '67930', 'LittleOak Goat Milk Toddler 800g', '43.99', '4.96')
    + item('3', '68440', 'Woolworths Lite Milk 2L', '3.10') + item('4', '68406', 'Coles Milk Chocolate Block', '2.00');
  const real = global.fetch;
  global.fetch = async (url) => {
    const u = String(url);
    const html = (t) => new Response(t, { status: 200, headers: { 'content-type': 'text/html' } });
    if (u.includes('api.mymemory')) return new Response(JSON.stringify({ responseStatus: 200, responseData: { translatedText: 'milk' } }));
    if (u.endsWith('/coles-catalogue')) return html('<a href="/coles-catalogue/coles-catalogue-nsw-metro/68406/catalogue2">x</a>');
    if (u.endsWith('/woolworths-catalogue')) return html('<a href="/woolworths-catalogue/weekly-catalogue-nsw/68440/catalogue2">x</a>');
    if (u.includes('/search/milk')) return html(search);
    return html('');
  };
  try {
    const report = { chains: [], items: {}, note: '' };
    const deals = await sf.scan({ list: [{ text: 'milk' }], errors: [], report, lang: 'en' });
    // רק רשתות מזון (בלי בית המרקחת), ורק מוצרים שהמילה בשמם
    assert.deepEqual(deals.map((d) => [d.chain, d.product, d.promoPrice, d.regularPrice]), [
      ['Coles', 'Coles Full Cream Milk 3L', 4.5, 5.1],
      ['Woolworths', 'Woolworths Lite Milk 2L', 3.1, null],
      ['Coles', 'Coles Milk Chocolate Block', 2, null],
    ]);
    assert.equal(deals[0].url, 'https://www.salefinder.com.au/68406/dairy/1/');
    assert.deepEqual(report.chains.map((c) => [c.name, c.deals]), [['Coles', 2], ['Woolworths', 1]]);
  } finally {
    global.fetch = real;
  }
});

test('carrefour: embedded "const files" list and 4-part file names', () => {
  const { fileLinks } = require('../server/chains/weblist');
  const html = `<script>
    const path = "20261016"
    const files = [{"name":"Price7290055700007-001-002-20261016-140004.gz","size":536,"modified":"13:58 16-10-2026"},{"name":"PromoFull7290055700007-001-002-20261016-030000.gz","size":9},{"name":"Stores7290055700007-001-20261016-020000.xml","size":5}]
    const file_link = window.location.origin+'/'+path+'/'+filename
  </script><a href="\${file_link}" class="downloadBtn">`;
  const l = fileLinks(html, 'https://prices.carrefour.co.il/');
  assert.deepEqual(l.map((x) => [x.kind, x.store, x.stamp]), [
    ['price', 2, '20261016140004'], ['promofull', 2, '20261016030000'], ['stores', 1, '20261016020000'],
  ]);
  assert.equal(l[0].url, 'https://prices.carrefour.co.il/20261016/Price7290055700007-001-002-20261016-140004.gz');
});

test('marktguru: only products whose main word is the search term', () => {
  const { relevant } = require('../server/providers/marktguru');
  assert.ok(relevant('Butter', 'Teebutter 250 g'));
  assert.ok(relevant('Butter', 'Kerrygold Irische Butter'));
  assert.ok(relevant('Butter', 'Bio-Butter'));
  assert.ok(!relevant('Butter', 'Buttercroissant'));
  assert.ok(!relevant('Butter', 'Butter-Croissant 4 Stück'));
  assert.ok(!relevant('Butter', 'Rama Margarine'));
  assert.ok(!relevant('Butter', 'Butterkekse'));
  assert.ok(relevant('Milch', 'Vollmilch 3,5% 1l'));
  assert.ok(!relevant('Milch', 'Milchschokolade'));
  assert.ok(relevant('Tomate', 'Rispentomaten'));
  assert.ok(relevant('Eier', 'Freilandeier 10 Stk'));
});

test('australia: long item names are searched in shorter forms', () => {
  const { queries, relevant } = require('../server/providers/salefinder');
  assert.deepEqual(queries('Pepsi max 300ml'), ['pepsi max']);
  assert.deepEqual(queries('Bulla dairy low fat cottage cheese original 500g'), ['bulla dairy cottage cheese', 'cottage cheese', 'bulla dairy']);
  assert.deepEqual(queries('Cobs lightly salted slightly sweet popcorn'), ['cobs popcorn']);
  assert.ok(relevant('pepsi max', 'Pepsi Max Cola Soft Drink Bottle 1.25L'));
  assert.ok(!relevant('pepsi max', 'Coca-Cola Classic 1.25L'));
});

test('cerberus: file names with and without a store part', () => {
  const { pickLatest } = require('../server/chains/cerberus');
  const files = ['Stores7290058140886-000-202610240200.xml', 'Stores7290058140886-202610250200.xml', 'PriceFull7290058140886-001-202610250200.gz',
    'PriceFull7290058140886-001-202610240200.gz', 'PromoFull7290058140886-002-202610250100.gz'];
  assert.equal(pickLatest(files, 'Stores'), 'Stores7290058140886-202610250200.xml');
  assert.equal(pickLatest(files, 'PriceFull', 1), 'PriceFull7290058140886-001-202610250200.gz');
  assert.equal(pickLatest(files, 'PromoFull', 1), undefined);
});
