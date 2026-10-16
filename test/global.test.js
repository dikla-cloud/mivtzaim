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
  assert.deepEqual(await translate(['חלב 3% | Milch'], 'de'), { 'חלב 3% | Milch': 'Milch' });
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

test('australia: Woolworths + Coles specials, per-retailer errors in report', async () => {
  const au = require('../server/providers/australia');
  const real = global.fetch;
  global.fetch = async (url, opts) => {
    const u = String(url);
    const json = (o) => new Response(JSON.stringify(o), { status: 200, headers: { 'content-type': 'application/json' } });
    if (u.includes('api.mymemory')) return json({ responseStatus: 200, responseData: { translatedText: 'milk' } });
    if (u === 'https://www.woolworths.com.au/') return new Response('ok', { status: 200 });
    if (u.includes('woolworths.com.au/apis/ui/Search/products')) {
      assert.equal(JSON.parse(opts.body).SearchTerm, 'milk');
      return json({ Products: [{ Products: [
        { Stockcode: 1, DisplayName: 'Woolworths Full Cream Milk 3L', Price: 4.5, WasPrice: 5.1, IsOnSpecial: true },
        { Stockcode: 2, DisplayName: 'Other Milk', Price: 3, WasPrice: 3, IsOnSpecial: false },
      ] }] });
    }
    if (u === 'https://www.coles.com.au/') return new Response('<html>blocked</html>', { status: 200 });
    throw new Error('unexpected ' + u);
  };
  try {
    const report = { chains: [], items: {}, note: '' };
    const errors = [];
    const deals = await au.scan({ list: [{ text: 'חלב' }], errors, report });
    assert.equal(deals.length, 1);
    assert.deepEqual([deals[0].chain, deals[0].promoPrice, deals[0].regularPrice, deals[0].currency], ['Woolworths', 4.5, 5.1, 'AUD']);
    assert.equal(report.items['חלב'].term, 'milk');
    assert.equal(report.items['חלב'].offers, 2);
    assert.equal(report.chains[0].deals, 1);
    assert.match(report.chains[1].error, /Coles/);
  } finally {
    global.fetch = real;
  }
});
