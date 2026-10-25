const test = require('node:test');
const assert = require('node:assert');
const { pick } = require('../server/compare');
const { variantsOf } = require('../server/match');

const item = (code, name, price) => ({ code, name, price, variants: variantsOf(name) });
const items = [
  item('1', 'שוקו בטעם חלב 200 מ"ל', 3.5),
  item('2', 'חלב טרי 3% 1 ליטר', 7.1),
  item('3', 'חלב טרי 1% 1 ליטר', 6.9),
  item('7290011194246', 'במבה אסם 80 גרם', 5.2),
];
const data = { items, byCode: new Map(items.map((i) => [i.code, i])), promoByCode: new Map([['7290011194246', { price: 3.9, clubOnly: true }]]) };

test('cart compare: product whose name starts with the item wins over a cheaper loose match', () => {
  assert.equal(pick('חלב', data).code, '3');
  assert.equal(pick('חלב 3%', data).code, '2');
});
test('cart compare: barcode wins, single-unit deal price is used', () => {
  const p = pick('במבה | 7290011194246', data);
  assert.deepEqual([p.code, p.regularPrice, p.price, p.promo.clubOnly], ['7290011194246', 5.2, 3.9, true]);
  assert.equal(pick('אבוקדו', data), null);
});

test('cart compare: exact first word beats a longer word with the same start', () => {
  const its = [item('9', 'חלבה בטעם וניל', 4), item('2', 'חלב טרי 3% 1 ליטר', 7.1)];
  assert.equal(pick('חלב', { items: its, byCode: new Map(), promoByCode: new Map() }).code, '2');
});

const { commonCode, pinKey } = require('../server/compare');
const store = (...its) => ({ items: its, byCode: new Map(its.map((i) => [i.code, i])), promoByCode: new Map() });

test('cart compare: the same barcode is compared in all stores, not each store\'s cheapest', () => {
  const a = store(item('500', 'שוקולית קופסה 500 גרם', 15), item('850', 'שוקולית שקית 850 גרם', 22));
  const b = store(item('850', 'שוקולית שקית 850 גרם', 21), item('x', 'שוקולית פרטי 400 גרם', 9));
  const c = store(item('850', 'שוקולית שקית 850 גרם', 23));
  assert.equal(commonCode('שוקולית', [a, b, c]), '850');
});
test('cart compare: a better name match wins over a product found in more stores', () => {
  const a = store(item('h', 'חלבה בטעם וניל', 4), item('m', 'חלב טרי 3% 1 ליטר', 7.1));
  const b = store(item('h', 'חלבה בטעם וניל', 4), item('m', 'חלב טרי 3% 1 ליטר', 7.1));
  const c = store(item('h', 'חלבה בטעם וניל', 4));
  assert.equal(commonCode('חלב', [a, b, c]), 'm');
  assert.equal(commonCode('אבוקדו', [a, b]), null);
  assert.equal(pinKey('  Tahini   Raw | 123'), 'tahini raw');
});
