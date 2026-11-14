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
    // ״סלט טחינה מוכן״ הוא מוצר אחר – לא מופיע כשמחפשים טחינה
    assert.deepEqual(o.items[0].options.map((x) => [x.code, x.n]), [['1001', 2], ['1003', 1]]);
    // כבר נבחר מוצר – לא שואלים שוב (אלא אם מבקשים לשנות)
    assert.equal((await options(['טחינה'], stores, { 'טחינה': 'auto' })).items.length, 0);
    assert.equal((await options(['טחינה'], stores, { 'טחינה': '1001' }, { all: true })).items[0].pin, '1001');
    const pinned = await compare(['טחינה'], stores, { pins: { 'טחינה': '1001' } });
    assert.deepEqual(pinned.stores.map((s) => s.lines[0].price), [14, 15]);
    const any = await compare(['טחינה'], stores, { pins: { 'טחינה': 'any' } });
    // הזול ל-100 גרם מבין הטחינות (בלי הסלט): בסניף 2 – 500 גרם ב-11
    assert.deepEqual(any.stores.map((s) => [s.lines[0].code, s.lines[0].any]), [['1001', true], ['1003', true]]);
    // מי שמחפש סלט טחינה – מקבל סלט
    const salad = await compare(['סלט טחינה'], stores);
    assert.deepEqual(salad.stores.map((s) => s.lines[0].code), ['1002', '1002']);
    assert.deepEqual(any.stores[1].lines[0].unit, { value: 2.2, label: '100 גרם' });
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

test('cart compare: coupon placeholder items are not real products', async () => {
  const israel = require('../server/providers/israel');
  const { compare } = require('../server/compare');
  const files = '<Root><Items><Item><ItemCode>1</ItemCode><ItemName>ה.נ קופון יוגורט חלב מתנה</ItemName><ItemPrice>0.01</ItemPrice></Item><Item><ItemCode>2</ItemCode><ItemName>יוגורט חלב 3%</ItemName><ItemPrice>4.5</ItemPrice></Item></Items></Root>';
  const fake = { id: 'faketest3', name: 'בדיקה', stores: async () => [], storeFiles: async () => ({ prices: Buffer.from(files), promos: Buffer.from('<Root/>') }) };
  israel.chains.push(fake);
  try {
    const r = await compare([{ text: 'יוגורט' }], [{ chain: 'faketest3', storeId: '1' }], { pins: { 'יוגורט': 'any' } });
    assert.equal(r.stores[0].lines[0].code, '2');
  } finally {
    israel.chains.splice(israel.chains.indexOf(fake), 1);
  }
});

test('abbreviations: ללג = ללא גלוטן (deals and cart)', () => {
  const { matches } = require('../server/match');
  const { candidates } = require('../server/compare');
  assert.ok(matches('לחם ללא גלוטן', 'לחם ללג אחיד 500 גר'));
  assert.ok(matches('פסטה ללג', 'פסטה ללא גלוטן 400 גרם'));
  assert.ok(matches('עוגיות ללא גלוטן', 'עוגיות ל.ג שוקולד'));
  const its = [item('41', 'לחם ללג אחיד', 20), item('42', 'לחם אחיד פרוס', 8)];
  assert.deepEqual([...candidates('לחם ללא גלוטן', { items: its }).keys()], ['41']);
});

test('cart compare: loose (by weight) produce is compared per kg, not a packaged product with a shared barcode', async () => {
  const israel = require('../server/providers/israel');
  const { compare, options } = require('../server/compare');
  const xmlItems = (its) => Buffer.from(`<Root><Items>${its.map(([c, n, p, w]) => `<Item><ItemCode>${c}</ItemCode><ItemName>${n}</ItemName><ItemPrice>${p}</ItemPrice><bIsWeighted>${w ? 1 : 0}</bIsWeighted></Item>`).join('')}</Items></Root>`);
  const files = {
    a: [['7290000000500', 'עגבניות שרי ארוז 500 גרם', 9, false], ['111', 'עגבניה במשקל', 6, true]],
    b: [['7290000000500', 'עגבניות שרי ארוז 500 גרם', 10, false], ['222', 'עגבניות', 5, true]],
  };
  const fake = { id: 'faketest4', name: 'בדיקה', stores: async () => [], storeFiles: async (id) => ({ prices: xmlItems(files[id]), promos: Buffer.from('<Root/>') }) };
  israel.chains.push(fake);
  try {
    const stores = [{ chain: 'faketest4', storeId: 'a' }, { chain: 'faketest4', storeId: 'b' }];
    const r = await compare([{ text: 'עגבניות', kg: 1 }], stores);
    assert.deepEqual(r.stores.map((s) => [s.lines[0].code, s.lines[0].cost, s.lines[0].loose]), [['111', 6, true], ['222', 5, true]]);
    // בלי כמות: ההתאמה הטובה ביותר היא במשקל – גם אז בתפזורת (חצי ק"ג כברירת מחדל)
    const auto = await compare(['עגבניות'], stores);
    assert.deepEqual(auto.stores.map((s) => s.lines[0].code), ['111', '222']);
    // ביחידות – אריזה עם ברקוד משותף
    const pcs = await compare([{ text: 'עגבניות', qty: 2 }], stores);
    assert.deepEqual(pcs.stores.map((s) => s.lines[0].code), ['7290000000500', '7290000000500']);
    assert.equal((await options(['עגבניות'], stores)).items.length, 0); // לא שואלים „למה התכוונת” על בתפזורת
  } finally {
    israel.chains.splice(israel.chains.indexOf(fake), 1);
  }
});

test('cart compare: plural item also finds the singular loose product', () => {
  const { candidates } = require('../server/compare');
  const its = [item('51', 'מלפפונים בייבי ארוז 500 גרם', 8), { ...item('52', 'מלפפון', 4), weighted: true }];
  assert.deepEqual([...candidates('מלפפונים', { items: its }).keys()].sort(), ['51', '52']);
});

test('cart compare: choosing "loose" for an item compares by weight even when a quantity in units was set', async () => {
  const israel = require('../server/providers/israel');
  const { compare } = require('../server/compare');
  const xmlItems = (its) => Buffer.from(`<Root><Items>${its.map(([c, n, p, w]) => `<Item><ItemCode>${c}</ItemCode><ItemName>${n}</ItemName><ItemPrice>${p}</ItemPrice><bIsWeighted>${w ? 1 : 0}</bIsWeighted></Item>`).join('')}</Items></Root>`);
  const files = { a: [['7290000000600', 'גזר ארוז 1 ק"ג', 7, false], ['61', 'גזר', 4, true]], b: [['7290000000600', 'גזר ארוז 1 ק"ג', 8, false], ['62', 'גזר', 3, true]] };
  const fake = { id: 'faketest5', name: 'בדיקה', stores: async () => [], storeFiles: async (id) => ({ prices: xmlItems(files[id]), promos: Buffer.from('<Root/>') }) };
  israel.chains.push(fake);
  try {
    const stores = [{ chain: 'faketest5', storeId: 'a' }, { chain: 'faketest5', storeId: 'b' }];
    const r = await compare([{ text: 'גזר', qty: 2 }], stores, { pins: { 'גזר': 'loose' } });
    assert.deepEqual(r.stores.map((s) => s.lines[0].code), ['61', '62']);
  } finally {
    israel.chains.splice(israel.chains.indexOf(fake), 1);
  }
});

test('product types: raw tahini without salads, dry chickpeas, coffee without cakes, milk without chocolate', () => {
  const { candidates } = require('../server/compare');
  const d = (...its) => ({ items: its.map(([c, n, p]) => item(c, n, p)), byCode: new Map(), promoByCode: new Map() });
  const keys = (q, data) => [...candidates(q, data).keys()].sort();
  assert.deepEqual(keys('טחינה', d(['1', 'טחינה גולמית סלה 500 גרם', 10], ['2', 'סלט טחינה 400 גרם', 8], ['3', 'חלבה בטעם טחינה', 6])), ['1']);
  assert.deepEqual(keys('גרגרי חומוס', d(['4', 'גרגרי חומוס סוגת 1 ק"ג', 9], ['5', 'חומוס מוכן צבר', 7], ['6', 'גרגירי חומוס יבשים', 8])), ['4', '6']);
  assert.deepEqual(keys('קפה', d(['7', 'קפה טחון לוואצה 250 גרם', 25], ['8', 'קפה נמס עלית', 20], ['9', 'עוגת קפה', 15], ['10', 'קפה קר בטעם וניל', 6])), ['7', '8']);
  assert.deepEqual(keys('חלב', d(['11', 'חלב טרי 3% 1 ליטר', 7], ['12', 'שוקולד חלב 100 גרם', 5])), ['11']);
});

test('cart compare: choose by rule – type, size and brands – cheapest per 100 g in each store', async () => {
  const israel = require('../server/providers/israel');
  const { compare, options } = require('../server/compare');
  const xmlItems = (its) => Buffer.from(`<Root><Items>${its.map(([c, n, p, m]) => `<Item><ItemCode>${c}</ItemCode><ItemName>${n}</ItemName><ItemPrice>${p}</ItemPrice><ManufacturerName>${m}</ManufacturerName></Item>`).join('')}</Items></Root>`);
  const files = {
    a: [['71', 'קפסולות קפה לוואצה 10 יח\'', 20, 'לוואצה'], ['72', 'קפה טחון עלית 250 גרם', 15, 'עלית'], ['73', 'קפסולות קפה נטול קפאין 10 יח\'', 22, 'נספרסו']],
    b: [['74', 'קפסולות קפה פרטי 20 יח\'', 30, 'פרטי'], ['72', 'קפה טחון עלית 250 גרם', 14, 'עלית']],
  };
  const fake = { id: 'faketest6', name: 'בדיקה', stores: async () => [], storeFiles: async (id) => ({ prices: xmlItems(files[id]), promos: Buffer.from('<Root/>') }) };
  israel.chains.push(fake);
  try {
    const stores = [{ chain: 'faketest6', storeId: 'a' }, { chain: 'faketest6', storeId: 'b' }];
    const o = await options(['קפה'], stores, {}, { all: true });
    const f = o.items[0].facets;
    assert.ok(f.subs.some((x) => x.id === 'caps' && x.n === 3));
    assert.ok(f.brands.some((x) => x.label === 'עלית'));
    // קפסולות, כל מותג: הזול ליחידה (בסניף b – 20 יח' ב-30 = 1.5 ליח')
    const caps = await compare(['קפה'], stores, { pins: { 'קפה': 'rule:{"sub":"caps"}' } });
    assert.deepEqual(caps.stores.map((s) => [s.lines[0].code, s.lines[0].rule]), [['71', true], ['74', true]]);
    // רק לוואצה: בסניף b אין – מחיר משוער
    const lav = await compare(['קפה'], stores, { pins: { 'קפה': 'rule:{"brands":["לוואצה"]}' } });
    assert.deepEqual([lav.stores[0].lines[0].code, lav.stores[1].lines[0].estimated], ['71', true]);
  } finally {
    israel.chains.splice(israel.chains.indexOf(fake), 1);
  }
});

test('units: package size and price per 100 g / liter / roll / meter', () => {
  const u = require('../server/units');
  assert.deepEqual(u.sizeOf({ name: 'טחינה סלה', qty: '500', unit: 'גרם' }), { amount: 0.5, base: 'kg' });
  assert.deepEqual(u.sizeOf({ name: 'קולה 1.5 ל\'', qty: '1500', unit: 'מיליליטרים' }), { amount: 1.5, base: 'l' });
  assert.deepEqual(u.sizeOf({ name: 'נייר טואלט 32 גלילים 25 מ\'', qty: '1', unit: 'יחידה' }), { amount: 32, base: 'roll', meters: 800 });
  assert.deepEqual(u.perUnit(10, { amount: 0.5, base: 'kg' }), { value: 2, label: '100 גרם' });
  // גלילים ארוכים יותר – זולים יותר למטר, גם אם יקרים יותר לגליל
  const a = { price: 40, size: { amount: 32, base: 'roll', meters: 800 } };
  const b = { price: 30, size: { amount: 32, base: 'roll', meters: 480 } };
  assert.equal(u.cheaper(a, b), true);
});

test('cart compare: "נענע" (herb) – not mint tea with a shared barcode; produce department skips processed products', async () => {
  // תה נענע משותף לכל הרשתות, והצמח בקוד פנימי שונה בכל רשת – הצמח מנצח
  const a = store(item('7290000000001', 'תה נענע ויסוצקי 25 שקיקים', 12), item('n1', 'נענע', 4));
  const b = store(item('7290000000001', 'תה נענע ויסוצקי 25 שקיקים', 13), item('n2', 'נענע ארוזה', 5));
  assert.equal(commonCode('נענע', [a, b]), null);
  // בחנות שאין בה את הצמח: במחלקת ירקות לא נבחר תה / נענע מיובשת
  const { setDepts } = require('../server/compare');
  const c = store(item('7290000000001', 'תה נענע ויסוצקי 25 שקיקים', 12), item('d1', 'נענע מיובשת 20 גרם', 8));
  try {
    setDepts({ 'נענע': 'produce' });
    assert.equal(pick('נענע', c), null);
    assert.equal(pick('נענע', a).code, 'n1');
    assert.equal(pick('נענע מיובשת', c).code, 'd1'); // מה שכתוב בפריט עצמו לא מוציא
    setDepts({});
    assert.ok(pick('נענע', c)); // בלי מחלקת ירקות – כמו קודם
  } finally { setDepts({}); }
});

test('cart compare: deli counter items are compared per kg when any store sells them by weight', async () => {
  const israel = require('../server/providers/israel');
  const { compare } = require('../server/compare');
  const xmlItems = (its) => Buffer.from(`<Root><Items>${its.map(([c, n, p, w]) => `<Item><ItemCode>${c}</ItemCode><ItemName>${n}</ItemName><ItemPrice>${p}</ItemPrice><bIsWeighted>${w ? 1 : 0}</bIsWeighted></Item>`).join('')}</Items></Root>`);
  const files = {
    a: [['7290000000777', 'פסטרמה מעושנת 200 גרם', 18, false], ['p1', 'פסטרמה מעושנת במשקל', 89, true]],
    b: [['7290000000777', 'פסטרמה מעושנת 200 גרם', 19, false]],
    c: [['7290000000777', 'פסטרמה מעושנת 200 גרם', 17, false]],
  };
  const fake = { id: 'fakedeli', name: 'בדיקה', stores: async () => [], storeFiles: async (id) => ({ prices: xmlItems(files[id]), promos: Buffer.from('<Root/>') }) };
  israel.chains.push(fake);
  try {
    const stores = ['a', 'b', 'c'].map((storeId) => ({ chain: 'fakedeli', storeId }));
    const deli = await compare(['פסטרמה'], stores, { depts: { 'פסטרמה': 'deli' } });
    assert.equal(deli.stores[0].lines[0].code, 'p1');
    assert.equal(deli.stores[0].lines[0].loose, true);
    // בלי מחלקה: רק סניף אחד מתוך שלושה שוקל – אריזה עם ברקוד משותף, כמו קודם
    const plain = await compare(['פסטרמה'], stores);
    assert.deepEqual(plain.stores.map((s) => s.lines[0].code), ['7290000000777', '7290000000777', '7290000000777']);
  } finally {
    israel.chains.splice(israel.chains.indexOf(fake), 1);
  }
});

test('cart compare: chains marked in settings with no branch nearby are reported', () => {
  const { missingChains } = require('../server/compare');
  const israel = require('../server/providers/israel');
  const fake = { id: 'fakemiss', name: 'רשת רחוקה', stores: async () => [], storeFiles: async () => ({}) };
  israel.chains.push(fake);
  try {
    assert.deepEqual(missingChains({ chains: ['fakemiss'] }, []), ['רשת רחוקה']);
    assert.deepEqual(missingChains({ chains: ['fakemiss'] }, [{ chain: 'fakemiss' }]), []);
    assert.deepEqual(missingChains({ chains: null }, []), []); // לא סומנו רשתות – לא מציגים
  } finally {
    israel.chains.splice(israel.chains.indexOf(fake), 1);
  }
});
