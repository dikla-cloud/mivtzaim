const test = require('node:test');
const assert = require('node:assert');
const http = require('http');

// קטעים אמיתיים מהאתר של ניצת הדובדבן (אוקטובר 2026)
const card = (n, name, id, priceHtml) => `<div style="" class="productcubepname"> <a id="ContentPlaceHolder1_products_rptproducts_hplpname_${n}" class="" href="%d7%a1%d7%a4%d7%99%d7%a8-i${id}">${name}</a> </div> <div style="height:32px; text-align:center; overflow:hidden"> <span id="ContentPlaceHolder1_products_rptproducts_productprice_${n}" class="productcubeprice">${priceHtml}</span><span id="ContentPlaceHolder1_products_rptproducts_lblpricefor100gram_${n}" class="productcubepricefor100gram"> 12.8 ל 100 גרם</span> </div> <div style="height:20px">`;
const CAT = `<html>${card(0, 'ספיר גלילית בסגנון לאבנה עם שמן זית וזעתר - אוטופי', 23157, `<span style='text-decoration:line-through; font-size:16px;'>28.8 ₪<span class='hidden-xs' style='font-size:11px;'></span></span> <span style='color:#A61D22;'>23.04</span>`)}
${card(1, 'טחינה גולמית אורגנית', 555, `<span>19.9 ₪</span>`)}
${card(2, 'חלב שקדים &quot;טבעי&quot;', 777, `<span style='text-decoration:line-through; font-size:16px;'>14.9 ₪</span> <span style='color:#A61D22;'>11.92</span>`)}</html>`;
const PROMO = `<a href="productslist.aspx?offerid=-1&amp;catid=4">פסטה</a><a href="productslist.aspx?offerid=-1&amp;catid=7">משקאות</a>`;
const SNIF = `<script type="application/ld+json">{"@context":"https://schema.org","@type":"ItemList","itemListElement":[
{ "@type": "ListItem", "position": 36, "item": { "@type": "HealthAndBeautyBusiness", "name": "ניצת הדובדבן - מבשרת", "telePhone": "02-5636178", "address": { "@type": "PostalAddress", "streetAddress": "שד' החוצבים 28", "addressLocality": "מבשרת ציון", "addressCountry": "IL" } } },
{ "@type": "ListItem", "position": 37, "item": { "@type": "HealthAndBeautyBusiness", "name": "ניצת הדובדבן - מודיעין", "address": { "@type": "PostalAddress", "streetAddress": "עברנו לכתובת החדשה: החרט 7, מרכז רמי לוי", "addressLocality": "מודיעין", "addressCountry": "IL" } } }]}</script>`;

let hits = 0;
const server = http.createServer((req, res) => {
  hits++;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  if (req.url.startsWith('/snifim.aspx')) return res.end(SNIF);
  if (req.url.startsWith('/productslist.aspx')) return res.end(req.url.includes('catid=4') ? CAT : '<html></html>');
  if (decodeURI(req.url) === '/מבצעי-מועדון') return res.end(PROMO);
  res.statusCode = 404; res.end();
});
let nizat;
test.before(async () => {
  await new Promise((r) => server.listen(0, r));
  process.env.NIZAT_BASE = `http://127.0.0.1:${server.address().port}/`;
  nizat = require('../server/chains/nizat');
});
test.after(() => server.close());

test('nizat: only struck-through prices are deals', () => {
  const ps = nizat.parseProducts(CAT);
  assert.deepEqual(ps.map((p) => [p.id, p.name, p.regularPrice, p.promoPrice]), [
    ['23157', 'ספיר גלילית בסגנון לאבנה עם שמן זית וזעתר - אוטופי', 28.8, 23.04],
    ['777', 'חלב שקדים "טבעי"', 14.9, 11.92],
  ]);
  assert.equal(ps[0].per100, '12.8 ל 100 גרם');
});

test('nizat: stores from JSON-LD, address cleaned', async () => {
  const st = await nizat.stores();
  assert.deepEqual(st.map((s) => [s.storeId, s.address, s.city]), [['מבשרת', "שד' החוצבים 28", 'מבשרת ציון'], ['מודיעין', 'החרט 7', 'מודיעין']]);
});

test('nizat: deals from all categories, cached, matched to list', async () => {
  const items = await nizat.deals();
  assert.equal(items.length, 2);
  const before = hits;
  await nizat.deals();
  assert.equal(hits, before); // מהמטמון
  const { findWebDeals } = require('../server/providers/israel');
  const found = findWebDeals({ list: [{ text: 'חלב שקדים' }, { text: 'במבה' }], items, chain: nizat, store: { name: 'ניצת הדובדבן - מודיעין', city: 'מודיעין', address: 'החרט 7', km: 2.1 } });
  assert.equal(found.length, 1);
  assert.equal(found[0].promoPrice, 11.92);
  assert.equal(found[0].end, null);
  assert.match(found[0].description, /20% הנחה/);
  assert.match(found[0].url, /-i777$/);
});

test('geo: street with the same name in another city is not trusted', async () => {
  const geo = require('../server/geo');
  assert.ok(geo.inCity('קריית אונו, מחוז תל אביב, ישראל', 'קרית אונו'));
  assert.ok(!geo.inCity('הרצל, רמת השרון, מחוז תל אביב, ישראל', 'נוף הגליל'));
  assert.ok(geo.inCity('Tel Aviv', 'Tel Aviv'));
  assert.equal(await geo.storePosition({ city: '7900', address: 'קק"ל 10' }), null);
});
