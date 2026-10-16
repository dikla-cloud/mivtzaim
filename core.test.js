const test = require('node:test');
const assert = require('node:assert');
const zlib = require('zlib');
const xml = require('../server/xml');
const { matches } = require('../server/match');
const { pickLatest } = require('../server/chains/cerberus');
const { findDeals } = require('../server/scanner');
const geo = require('../server/geo');

test('parses uppercase Shufersal-style stores file (gzipped)', () => {
  const src = `<?xml version="1.0"?><asx:abap><asx:values><CHAINID>7290027600007</CHAINID><STORES>
  <STORE><STOREID>1</STOREID><STORENAME>שלי ת"א</STORENAME><ADDRESS>בן יהודה 79</ADDRESS><CITY>תל אביב</CITY></STORE>
  <STORE><STOREID>002</STOREID><STORENAME>דיל חולון</STORENAME><ADDRESS>המרכבה 4</ADDRESS><CITY>חולון</CITY></STORE>
  </STORES></asx:values></asx:abap>`;
  const stores = xml.parseStores(zlib.gzipSync(Buffer.from(src)));
  assert.equal(stores.length, 2);
  assert.deepEqual([stores[1].storeId, stores[1].city], ['2', 'חולון']);
});

test('parses promos with dates, price, club flag', () => {
  const src = `<Root><Promotions><Promotion><PromotionId>9</PromotionId><PromotionDescription>2 ב-10</PromotionDescription>
  <PromotionEndDate>2030-01-31</PromotionEndDate><PromotionEndHour>23:59:00</PromotionEndHour><DiscountedPrice>10.00</DiscountedPrice>
  <MinQty>2</MinQty><Clubs><ClubId>1</ClubId></Clubs><PromotionItems><Item><ItemCode>123</ItemCode></Item><Item><ItemCode>456</ItemCode></Item></PromotionItems>
  </Promotion></Promotions></Root>`;
  const [p] = xml.parsePromos(src);
  assert.deepEqual(p.items, ['123', '456']);
  assert.equal(p.price, 10);
  assert.equal(p.minQty, 2);
  assert.equal(p.end, '2030-01-31T23:59:00');
  assert.equal(p.clubOnly, true);
});

test('matching Hebrew list items to product names', () => {
  assert.ok(matches('חלב 3%', 'חלב טרי 3% בקרטון 1 ליטר', '1'));
  assert.ok(matches("קוטג'", 'קוטג׳ 5% תנובה', '1'));
  assert.ok(matches('שמן', 'השמן של מרים', '1'));
  assert.ok(matches('7290000066318', 'whatever', '7290000066318'));
  assert.ok(!matches('חלב', 'שוקולד מריר', '1'));
  assert.ok(!matches('חלב 1%', 'חלב טרי 3%', '1'));
});

test('cerberus picks latest file per store', () => {
  const files = ['PromoFull7290058140886-001-202610150300.gz', 'PromoFull7290058140886-001-202610160300.gz', 'PromoFull7290058140886-002-202610170300.gz'];
  assert.equal(pickLatest(files, 'PromoFull', 1), files[1]);
});

test('findDeals skips expired promos and joins names', () => {
  const prices = new Map([['1', { name: 'במבה אסם', price: 5 }]]);
  const promos = [
    { promoId: 'a', items: ['1'], price: 4, end: '2099-01-01' },
    { promoId: 'b', items: ['1'], price: 3, end: '2000-01-01' },
  ];
  const deals = findDeals({ list: [{ text: 'במבה' }], promos, prices, chain: { id: 'c', name: 'C' }, store: { storeId: '1', name: 'S' } });
  assert.equal(deals.length, 1);
  assert.equal(deals[0].promoPrice, 4);
});

test('haversine distance Tel Aviv – Ramat Gan ≈ 3.7km', () => {
  const km = geo.haversineKm({ lat: 32.0779, lon: 34.7745 }, { lat: 32.0823, lon: 34.8136 });
  assert.ok(km > 3 && km < 4.5);
});
