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
  const d = db.get();
  d.list = [{ id: '1', text: 'חלב' }];
  d.location = { lat: -33.87, lon: 151.21, label: 'Sydney', place: { countryCode: 'AU', country: 'Australia', city: 'Sydney', postcode: '2000' } };
  const r = await scanner.scan();
  assert.deepEqual(r.sources, []);
  assert.match(r.errors[0], /אין עדיין מקור מבצעים חינמי/);
});
