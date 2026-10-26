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

test('price file names: Victory StoresFull and the chain code', () => {
  const { parseName } = require('../server/chains/weblist');
  assert.deepEqual(parseName('StoresFull7290696200003-000-202610250200.xml.gz'), { kind: 'stores', code: '7290696200003', store: 0, stamp: '20261025020000' });
  assert.equal(parseName('PriceFull7290696200003-031-202610250200-001.xml.gz').store, 31);
});

test('cart compare: "what did you mean?" options and pinned choices (barcode / any brand)', async () => {
  const israel = require('../server/providers/israel');
  const { options, compare } = require('../server/compare');
  const xmlItems = (its) => Buffer.from(`<Root><Items>${its.map(([c, n, p]) => `<Item><ItemCode>${c}</ItemCode><ItemName>${n}</ItemName><ItemPrice>${p}</ItemPrice></Item>`).join('')}</Items></Root>`);
  const files = {
    1: [['1001', 'טחינה גולמית הר ברכה 500 גרם', 14], ['1002', 'סלט טחינה מוכן 400 גרם', 9]],
    2: [['1001', 'טחינה גולמית הר ברכה 500 גרם', 15], ['1002', 'סלט טחינה מוכן 400 גרם', 10], ['1003', 'טחינה גולמית פרטי 500 גרם', 11]],
  };
  const fake = { id: 'faketest', name: 'בדיקה', stores: async () => [], storeFiles: async (id) => ({ prices: xmlItems(files[id]), promos: Buffer.from('<Root/>') }) };
  israel.chains.push(fake);
  try {
    const stores = [{ chain: 'faketest', storeId: '1' }, { chain: 'faketest', storeId: '2' }];
    const o = await options(['טחינה', 'אבוקדו'], stores, {});
    assert.equal(o.items.length, 1);
    assert.equal(o.items[0].text, 'טחינה');
    assert.deepEqual(o.items[0].options.map((x) => [x.code, x.n]), [['1002', 2], ['1001', 2], ['1003', 1]]);
    // כבר נבחר מוצר – לא שואלים שוב (אלא אם מבקשים לשנות)
    assert.equal((await options(['טחינה'], stores, { 'טחינה': 'auto' })).items.length, 0);
    assert.equal((await options(['טחינה'], stores, { 'טחינה': '1001' }, { all: true })).items[0].pin, '1001');
    const pinned = await compare(['טחינה'], stores, { pins: { 'טחינה': '1001' } });
    assert.deepEqual(pinned.stores.map((s) => s.lines[0].price), [14, 15]);
    const any = await compare(['טחינה'], stores, { pins: { 'טחינה': 'any' } });
    assert.deepEqual(any.stores.map((s) => [s.lines[0].code, s.lines[0].any]), [['1002', true], ['1002', true]]);
  } finally {
    israel.chains.splice(israel.chains.indexOf(fake), 1);
  }
});

test('cart cost: quantity, multi-buy deals, club deals and weighted products', () => {
  const { lineCost } = require('../server/compare');
  const it = { code: '5', price: 8 };
  const d = (...ps) => ({ promos: new Map([['5', ps]]) });
  // „3 ב-20”: שלוש יחידות ב-20, הרביעית במחיר רגיל
  const multi = d({ price: 20, minQty: 3, description: '3 ב-20', clubOnly: false });
  assert.equal(lineCost(it, multi, { qty: 4 }).cost, 28);
  // פחות מהכמות במבצע – מחיר רגיל, עם רמז למבצע
  const two = lineCost(it, multi, { qty: 2 });
  assert.deepEqual([two.cost, Boolean(two.hint)], [16, true]);
  // מחיר ליחידה בקובץ (6.5 לכל אחת מ-2)
  assert.equal(lineCost(it, d({ price: 6.5, minQty: 2, description: 'מבצע זוגות' }), { qty: 2 }).cost, 13);
  // מבצע מועדון – רק למי שחבר
  const club = d({ price: 6, minQty: 1, clubOnly: true });
  assert.equal(lineCost(it, club, { qty: 2, club: true }).cost, 12);
  assert.equal(lineCost(it, club, { qty: 2, club: false }).cost, 16);
  // מוצר במשקל: מחיר לק"ג × משקל (ברירת מחדל חצי ק"ג)
  const kgItem = { code: '6', price: 60, weighted: true };
  assert.equal(lineCost(kgItem, { promos: new Map() }, {}).cost, 30);
  assert.equal(lineCost(kgItem, { promos: new Map() }, { kg: 0.3 }).cost, 18);
});

test('cart compare: whole cart in every store, missing items estimated, shipping added', async () => {
  const israel = require('../server/providers/israel');
  const { compare } = require('../server/compare');
  const xmlItems = (its) => Buffer.from(`<Root><Items>${its.map(([c, n, p]) => `<Item><ItemCode>${c}</ItemCode><ItemName>${n}</ItemName><ItemPrice>${p}</ItemPrice></Item>`).join('')}</Items></Root>`);
  const files = {
    a: [['2001', 'במבה אסם 80 גרם', 5], ['2002', 'פטרוזיליה צרור', 4]],
    b: [['2001', 'במבה אסם 80 גרם', 6]],
    c: [['2001', 'במבה אסם 80 גרם', 7], ['2002', 'פטרוזיליה צרור', 6]],
  };
  const fake = { id: 'faketest2', name: 'בדיקה', stores: async () => [], storeFiles: async (id) => ({ prices: xmlItems(files[id]), promos: Buffer.from('<Root/>') }) };
  israel.chains.push(fake);
  try {
    const stores = ['a', 'b', 'c'].map((id) => ({ chain: 'faketest2', storeId: id }));
    const r = await compare([{ text: 'במבה', qty: 2 }, 'פטרוזיליה', 'אבוקדו'], stores, { shipping: { 'faketest2|c': 25 } });
    const [a, b, c] = r.stores;
    assert.deepEqual(r.notFound, ['אבוקדו']);
    assert.equal(r.counted, 2);
    // ב-b אין פטרוזיליה: מחיר משוער = החציון של 4 ו-6
    assert.deepEqual([b.lines[1].estimated, b.lines[1].estCost, b.estimated], [true, 5, 1]);
    assert.deepEqual([a.total, b.total, c.itemsTotal, c.shipping, c.total], [14, 17, 20, 25, 45]);
    assert.equal(r.cheapest, 'faketest2|a');
  } finally {
    israel.chains.splice(israel.chains.indexOf(fake), 1);
  }
});

test('cart compare: other spellings and singular/plural are found', () => {
  const { candidates } = require('../server/compare');
  const its = [item('31', 'כוסבר צרור', 3), item('32', 'מלפפון 1 ק"ג', 5), item('33', 'פטרוזיליה ארוזה', 4)];
  const d = { items: its, byCode: new Map(), promoByCode: new Map() };
  assert.deepEqual([...candidates('כוסברה', d).keys()], ['31']);
  assert.deepEqual([...candidates('כסברה', d).keys()], ['31']);
  assert.deepEqual([...candidates('מלפפונים', d).keys()], ['32']);
  assert.deepEqual([...candidates('פטרוז', d).keys()], ['33']);
});

test('price files: a broken XML file (unclosed tags) is still read', () => {
  const xml = require('../server/xml');
  const open = '<Extra>'.repeat(120); // תגיות שלא נסגרות – יותר מדי קינון לקורא הרגיל
  const prices = `<Root><Items>${open}<Item><ItemCode>111</ItemCode><ItemName>חלב טרי 3% &amp; טעים</ItemName><ItemPrice>7.10</ItemPrice><bIsWeighted>0</bIsWeighted></Item><Item><ItemCode>222</ItemCode><ItemName>עגבניות</ItemName><ItemPrice>9.90</ItemPrice><bIsWeighted>1</bIsWeighted></Item></Items></Root>`;
  const m = xml.parsePrices(prices);
  assert.deepEqual([m.get('111').name, m.get('111').price, m.get('222').weighted], ['חלב טרי 3% & טעים', 7.1, true]);
  const promos = `<Root>${open}<Promotions><Promotion><PromotionId>5</PromotionId><PromotionDescription>2 ב-10</PromotionDescription><DiscountedPrice>10</DiscountedPrice><MinQty>2</MinQty><Clubs><ClubId>0</ClubId></Clubs><PromotionItems><Item><ItemCode>111</ItemCode></Item><Item><ItemCode>333</ItemCode></Item></PromotionItems></Promotion></Promotions></Root>`;
  const [p] = xml.parsePromos(promos);
  assert.deepEqual([p.items, p.minQty, p.clubOnly], [['111', '333'], 2, false]);
});
