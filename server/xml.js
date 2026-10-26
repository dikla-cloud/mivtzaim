// פענוח קבצי XML לפי פורמט חוק שקיפות המחירים (Stores / PriceFull / PromoFull).
// כל רשת כותבת את התגיות באותיות שונות (StoreId / STOREID / storeid), לכן הכול מנורמל לאותיות קטנות.
const zlib = require('zlib');
const { XMLParser } = require('fast-xml-parser');

const parser = new XMLParser({
  ignoreAttributes: true,
  parseTagValue: false,
  trimValues: true,
  transformTagName: (t) => t.toLowerCase(),
});

function decode(buf) {
  if (buf[0] === 0x1f && buf[1] === 0x8b) buf = zlib.gunzipSync(buf);
  // חלק מהרשתות שומרות ב-UTF-16
  if (buf[0] === 0xff && buf[1] === 0xfe) return buf.toString('utf16le').replace(/^﻿/, '');
  return buf.toString('utf8').replace(/^﻿/, '');
}

function parse(bufOrString) {
  const text = typeof bufOrString === 'string' ? bufOrString : decode(bufOrString);
  return parser.parse(text);
}

// מחזיר את כל הצמתים בשם tag בכל עומק
function findAll(node, tag, out = []) {
  if (Array.isArray(node)) { for (const n of node) findAll(n, tag, out); return out; }
  if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      if (k === tag) {
        for (const x of [].concat(v)) if (x && typeof x === 'object') out.push(x);
      } else findAll(v, tag, out);
    }
  }
  return out;
}

const first = (obj, ...keys) => {
  for (const k of keys) if (obj[k] != null && obj[k] !== '') return String(obj[k]);
  return '';
};

function parseStores(src) {
  const doc = parse(src);
  const chainId = findAll(doc, 'root')[0]?.chainid || '';
  return findAll(doc, 'store').map((s) => ({
    storeId: String(Number(first(s, 'storeid')) || first(s, 'storeid')),
    name: first(s, 'storename'),
    address: first(s, 'address'),
    city: first(s, 'city'),
    chainId: first(s, 'chainid') || String(chainId),
  })).filter((s) => s.storeId);
}

function parsePrices(src) {
  const doc = parse(src);
  const map = new Map();
  for (const it of findAll(doc, 'item')) {
    const code = first(it, 'itemcode');
    if (!code) continue;
    map.set(code, {
      name: first(it, 'itemname', 'itemnm', 'manufactureritemdescription'),
      price: Number(first(it, 'itemprice')) || null,
      manufacturer: first(it, 'manufacturername'),
      unit: first(it, 'unitqty', 'unitofmeasure'),
      qty: first(it, 'quantity'),
      weighted: first(it, 'bisweighted', 'blsweighted') === '1',
    });
  }
  return map;
}

function toDate(d, h) {
  if (!d) return null;
  const date = d.trim().replace(/\//g, '-').slice(0, 10);
  const hour = (h || '23:59:59').trim().slice(-8);
  const iso = `${date}T${hour.length === 5 ? hour + ':00' : hour}`;
  return isNaN(Date.parse(iso)) ? date : iso;
}

function parsePromos(src) {
  const doc = parse(src);
  return findAll(doc, 'promotion').map((p) => {
    const items = findAll(p, 'item').map((i) => first(i, 'itemcode')).filter(Boolean);
    return {
      promoId: first(p, 'promotionid'),
      description: first(p, 'promotiondescription'),
      start: toDate(first(p, 'promotionstartdate'), first(p, 'promotionstarthour')),
      end: toDate(first(p, 'promotionenddate'), first(p, 'promotionendhour')),
      price: Number(first(p, 'discountedprice')) || null,
      minQty: Number(first(p, 'minqty')) || null,
      // ClubId: 0 = כלל הלקוחות, 1 = חברי מועדון, 2 = כרטיס אשראי, 3 = אחר
      clubOnly: [].concat(p.clubs?.clubid ?? p.clubid ?? '0').every((c) => String(c).trim() !== '0'),
      items,
    };
  }).filter((p) => p.items.length);
}

module.exports = { decode, parse, parseStores, parsePrices, parsePromos };
