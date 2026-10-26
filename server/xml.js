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

// קובץ ZIP (״PK״): הקובץ הראשון שבתוכו. בלי ספרייה – כותרת הקובץ המקומית ואחריה הנתונים (deflate או בלי דחיסה)
function unzipFirst(buf) {
  if (buf.readUInt32LE(0) !== 0x04034b50) return null;
  const method = buf.readUInt16LE(8);
  let size = buf.readUInt32LE(18);
  const start = 30 + buf.readUInt16LE(26) + buf.readUInt16LE(28);
  // גודל 0 = הגודל רשום רק בסוף (data descriptor) – לוקחים עד סוף הנתונים ומשאירים לזרם הדחוס לעצור לבד
  if (!size) size = buf.length - start;
  const data = buf.subarray(start, start + size);
  if (method === 0) return data;
  if (method === 8) return zlib.inflateRawSync(data, { finishFlush: zlib.constants.Z_SYNC_FLUSH });
  throw new Error(`ZIP בשיטת דחיסה לא נתמכת (${method})`);
}

function decode(buf) {
  if (buf[0] === 0x1f && buf[1] === 0x8b) buf = zlib.gunzipSync(buf);
  else if (buf[0] === 0x50 && buf[1] === 0x4b) buf = unzipFirst(buf) || buf; // ZIP
  else if (buf[0] === 0x78 && [0x01, 0x5e, 0x9c, 0xda].includes(buf[1])) buf = zlib.inflateSync(buf); // zlib
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
  const text = typeof src === 'string' ? src : decode(src);
  let chainId = '';
  try { chainId = findAll(parser.parse(text), 'root')[0]?.chainid || ''; } catch { chainId = (text.match(/<chainid>\s*(\d+)/i) || [])[1] || ''; }
  return nodes(text, 'store').map((s) => ({
    storeId: String(Number(first(s, 'storeid')) || first(s, 'storeid')),
    name: first(s, 'storename'),
    address: first(s, 'address'),
    city: first(s, 'city'),
    chainId: first(s, 'chainid') || String(chainId),
  })).filter((s) => s.storeId);
}

// קריאה סלחנית, כשהקובץ לא XML תקין (למשל תגית שלא נסגרת – כך בסניף האונליין של רמי לוי):
// לוקחים כל בלוק <tag>…</tag> ובתוכו את השדות הפשוטים <שדה>ערך</שדה>. לכל שדה – כל הערכים שלו
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const unescape = (v) => v.replace(/&(amp|lt|gt|quot|apos);/g, (_, e) => ENT[e]).replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).trim();
function blocks(text, tag) {
  const out = [];
  for (const m of text.matchAll(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, 'gi'))) {
    const all = {};
    for (const f of m[1].matchAll(/<([A-Za-z_][\w.-]*)\b[^>]*>([^<]*)<\/\1\s*>/gi)) (all[f[1].toLowerCase()] ||= []).push(unescape(f[2]));
    const one = Object.fromEntries(Object.entries(all).map(([k, v]) => [k, v[0]]));
    out.push({ one, all });
  }
  return out;
}
// הצמתים בשם tag: מהעץ, ואם הקובץ שבור – בקריאה הסלחנית (רק השדות הפשוטים)
function nodes(src, tag) {
  const text = typeof src === 'string' ? src : decode(src);
  try {
    return findAll(parser.parse(text), tag);
  } catch {
    return blocks(text, tag).map((b) => ({ ...b.one, __all: b.all }));
  }
}

function parsePrices(src) {
  const map = new Map();
  for (const it of nodes(src, 'item')) {
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
  return nodes(src, 'promotion').map((p) => {
    const items = p.__all ? p.__all.itemcode || [] : findAll(p, 'item').map((i) => first(i, 'itemcode')).filter(Boolean);
    return {
      promoId: first(p, 'promotionid'),
      description: first(p, 'promotiondescription'),
      start: toDate(first(p, 'promotionstartdate'), first(p, 'promotionstarthour')),
      end: toDate(first(p, 'promotionenddate'), first(p, 'promotionendhour')),
      price: Number(first(p, 'discountedprice')) || null,
      minQty: Number(first(p, 'minqty')) || null,
      // ClubId: 0 = כלל הלקוחות, 1 = חברי מועדון, 2 = כרטיס אשראי, 3 = אחר
      clubOnly: [].concat(p.__all?.clubid ?? p.clubs?.clubid ?? p.clubid ?? '0').every((c) => String(c).trim() !== '0'),
      items,
    };
  }).filter((p) => p.items.length);
}

module.exports = { decode, parse, parseStores, parsePrices, parsePromos };
