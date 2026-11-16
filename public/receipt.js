// קריאת קבלה מהסופר: מהטקסט שזוהה בצילום (OCR, בטלפון עצמו) – תאריך, רשת, סכום לתשלום,
// הנחות וקופונים, תשלום בשובר / תו קנייה, ושורות המוצרים. הכול טיוטה: המשתמש בודק ומתקן לפני השמירה.
(function (root) {
  const CHAINS = [
    ['שופרסל', 'שופרסל'], ['רמי לוי', 'רמי לוי'], ['אושר עד', 'אושר עד'], ['יוחננוף', 'יוחננוף'], ['ויקטורי', 'ויקטורי'],
    ['טיב טעם', 'טיב טעם'], ['יינות ביתן', 'יינות ביתן'], ['מגה', 'מגה'], ['קרפור', 'קרפור'], ['carrefour', 'קרפור'],
    ['חצי חינם', 'חצי חינם'], ['מחסני השוק', 'מחסני השוק'], ['פרשמרקט', 'פרשמרקט'], ['קשת טעמים', 'קשת טעמים'],
    ['סאלח דבאח', 'סאלח דבאח'], ['ניצת הדובדבן', 'ניצת הדובדבן'], ['קינג סטור', 'קינג סטור'], ['זול ובגדול', 'זול ובגדול'],
    ['סופר פארם', 'סופר-פארם'], ['סופר-פארם', 'סופר-פארם'], ['ביתן', 'יינות ביתן'], ['am:pm', 'AM:PM'], ['טיב טעם', 'טיב טעם'],
  ];
  // שורות שאינן מוצר: סיכומים, אמצעי תשלום, פרטי העסק
  const NOT_ITEM = /סה["״'׳]?כ|סהכ|לתשלום|לשלם|תשלום|שולם|עודף|מזומן|אשראי|ויזה|visa|ישראכרט|מאסטר|mastercard|אמריקן|כרטיס|מע["״]?מ|ח\.?פ|עוסק|טל[':.]|טלפון|קופה|קופאי|מס['׳]? ?קבלה|קבלה|חשבונית|עסקה|תאריך|שעה|סניף|כתובת|ברקוד|אסמכתא|יתרה|נקודות|total|subtotal|cash|change|tax|vat/i;
  const DISCOUNT = /הנחה|הנחת|קופון|מבצע|זיכוי|הטבה|מועדון|discount|coupon/i;
  const VOUCHER = /שובר|תו קני|תווי קני|גיפט|gift|תו שי|כרטיס מתנה|באייבי|buyme|סיבוס|cibus|תן ביס|10bis/i;
  const TOTAL = /(?:סה["״'׳]?כ|סהכ)\s*(?:ל?תשלום|לשלם)|לתשלום|סך הכל לתשלום|total\s*(?:due|to pay)?/i;
  const SUBTOTAL = /סה["״'׳]?כ|סהכ|סך הכל|total/i;

  // סכומים בשורה: 12.90 / 12,90 / -3.00 / 3.00- / ₪12.90
  function amounts(line) {
    const out = [];
    const re = /(-?)\s*₪?\s*(\d{1,5}(?:,\d{3})*[.,]\d{2})(?!\d)\s*(-?)/g;
    let m;
    while ((m = re.exec(line))) {
      const raw = m[2].replace(/,(?=\d{3}\b)/g, '').replace(',', '.');
      const v = Number(raw);
      if (!Number.isFinite(v)) continue;
      out.push({ value: m[1] === '-' || m[3] === '-' ? -v : v, index: m.index });
    }
    return out;
  }

  function parseDate(text) {
    const re = /(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/g;
    let m;
    while ((m = re.exec(text))) {
      let [, d, mo, y] = m.map(Number);
      if (y < 100) y += 2000;
      if (d >= 1 && d <= 31 && mo >= 1 && mo <= 12 && y >= 2015 && y <= 2100) {
        return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      }
    }
    return null;
  }

  function parseChain(text) {
    const low = text.toLowerCase();
    let best = null;
    for (const [k, name] of CHAINS) {
      const i = low.indexOf(k.toLowerCase());
      if (i >= 0 && (!best || i < best.i)) best = { i, name };
    }
    return best ? best.name : '';
  }

  const round = (n) => Math.round(n * 100) / 100;
  // סימני כיוון (LRM/RLM) שהזיהוי מוסיף, ותווים שאינם טקסט
  const clean = (s) => s.replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '').replace(/[|_*#=~<>{}[\]]+/g, ' ').replace(/\s+/g, ' ').trim();

  function parseReceipt(text) {
    const lines = String(text || '').split(/\r?\n/).map(clean).filter(Boolean);
    let total = null;
    let subtotalMax = null;
    let discount = 0;
    let voucher = 0;
    const items = [];
    let ended = false; // אחרי שורת הסיכום באים אמצעי התשלום – לא מוצרים
    for (const line of lines) {
      const am = amounts(line);
      if (!am.length) continue;
      const last = am[am.length - 1].value;
      const letters = /[֐-׿a-z]/i.test(line);
      if (TOTAL.test(line)) { total = Math.abs(last); ended = true; continue; }
      if (VOUCHER.test(line)) { voucher += Math.abs(last); continue; }
      if (SUBTOTAL.test(line)) { subtotalMax = Math.max(subtotalMax || 0, Math.abs(last)); ended = true; continue; }
      if (ended) continue;
      if (DISCOUNT.test(line) || (last < 0 && letters && !NOT_ITEM.test(line))) { discount += Math.abs(last); continue; }
      if (!letters || NOT_ITEM.test(line)) continue;
      // שם המוצר: הטקסט בלי הסכומים, בלי ברקוד ובלי כמות; ״2 X 6.90״ – כמות ומחיר ליחידה
      let qty = 1;
      const q = line.match(/(\d+(?:[.,]\d+)?)\s*[xX×*]\s*\d/) || line.match(/\d[.,]\d{2}\s*[xX×*]\s*(\d+(?:[.,]\d+)?)/);
      if (q) qty = Number(q[1].replace(',', '.')) || 1;
      const name = clean(line
        .replace(/-?\s*₪?\s*\d{1,5}(?:,\d{3})*[.,]\d{2}\s*-?/g, ' ')
        .replace(/\b\d{7,14}\b/g, ' ')
        .replace(/(\d+(?:[.,]\d+)?)\s*[xX×*]/g, ' ')
        .replace(/^[\d\s.,:-]+|[\d\s.,:-]+$/g, ''));
      if (name.replace(/[^֐-׿a-z]/gi, '').length < 2 || last <= 0 || last > 5000) continue;
      items.push({ name: name.slice(0, 80), price: round(last), qty });
    }
    const itemsSum = round(items.reduce((a, x) => a + x.price, 0));
    if (total == null) total = subtotalMax ?? (itemsSum ? round(itemsSum - discount) : null);
    return {
      date: parseDate(text),
      store: parseChain(text),
      total: total == null ? null : round(total),
      discount: round(discount),
      voucher: round(voucher),
      items: items.slice(0, 200),
    };
  }

  const api = { parseReceipt, amounts, parseDate, parseChain };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else Object.assign(root, api);
})(typeof window !== 'undefined' ? window : globalThis);
