const test = require('node:test');
const assert = require('node:assert');
const { parseReceipt, amounts } = require('../public/receipt');

test('receipt: amounts with ₪, commas and trailing minus', () => {
  assert.deepEqual(amounts('הנחת מבצע 3.00-').map((a) => a.value), [-3]);
  assert.deepEqual(amounts('סה"כ ₪1,245.90').map((a) => a.value), [1245.9]);
  assert.deepEqual(amounts('2 X 6,90 13,80').map((a) => a.value), [6.9, 13.8]);
});

test('receipt: total to pay, discounts and coupons, voucher payment, items, date and chain', () => {
  const text = [
    'שופרסל דיל רמת אביב',
    'ח.פ 520022732  טל: 03-1234567',
    '14/11/26  18:42  קופה 3',
    'חלב תנובה 3% 1 ליטר   7290004131074   6.90',
    '2 X 5.90 במבה אסם 80 גרם   11.80',
    'עגבניות שרי   12.40',
    'הנחת מבצע   3.00-',
    'קופון 10 ש"ח   10.00-',
    'סה"כ   31.10',
    'סה"כ לתשלום   18.10',
    'שובר מתנה   10.00',
    'ויזה   8.10',
    'עודף   0.00',
  ].join('\n');
  const r = parseReceipt(text);
  assert.equal(r.date, '2026-11-14');
  assert.equal(r.store, 'שופרסל');
  assert.equal(r.total, 18.1);
  assert.equal(r.discount, 13);
  assert.equal(r.voucher, 10);
  assert.deepEqual(r.items.map((x) => [x.name, x.price, x.qty]), [
    ['חלב תנובה 3% 1 ליטר', 6.9, 1],
    ['במבה אסם 80 גרם', 11.8, 2],
    ['עגבניות שרי', 12.4, 1],
  ]);
});

test('receipt: no "to pay" line – the largest subtotal, or the items minus discounts', () => {
  assert.equal(parseReceipt('לחם 9.90\nחלב 6.10\nסה"כ 16.00').total, 16);
  assert.equal(parseReceipt('לחם 9.90\nחלב 6.10\nהנחה 1.00-').total, 15);
  assert.equal(parseReceipt('שלום').total, null);
});
