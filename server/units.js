// גודל המוצר ומחיר ליחידת מידה – כדי להשוות 500 גרם מול 1 ק"ג, או 24 גלילים מול 32.
// מקור: שדות הקובץ (Quantity + UnitQty), ואם חסרים – מהשם (״500 גרם״, ״1 ליטר״, ״32 גלילים״).
// base: kg (משקל) · l (נפח) · unit (יחידות) · roll (גלילים). meters: אורך כולל, אם כתוב בשם (נייר טואלט)
const num = (s) => Number(String(s).replace(',', '.'));

const UNIT_RULES = [
  [/^(גר|גרם|גרמים|ג'?|gr?|gram)/i, 'kg', 1 / 1000],
  [/^(ק"?ג|קג|קילו|קילוגרם|kg)/i, 'kg', 1],
  [/^(מ"?ל|מל|מיליליטר|מיליליטרים|ml)/i, 'l', 1 / 1000],
  [/^(ליטר|ליטרים|ל'|ל|l|lt)$/i, 'l', 1],
  [/^(יח'?|יחידה|יחידות|יח|unit|pcs|מארז)/i, 'unit', 1],
];
const unitOf = (u) => UNIT_RULES.find(([re]) => re.test(String(u || '').trim().replace(/[״”]/g, '"').replace(/[׳’]/g, "'")));

function fromName(name) {
  const n = String(name || '').replace(/[״”]/g, '"').replace(/[׳’]/g, "'");
  const rolls = n.match(/(\d+)\s*(?:גלילים|גליל|רולים)/);
  if (rolls) {
    const per = n.match(/(\d+(?:[.,]\d+)?)\s*(?:מ'|מטר|מטרים)(?![א-ת])/);
    return { amount: num(rolls[1]), base: 'roll', ...(per ? { meters: num(per[1]) * num(rolls[1]) } : {}) };
  }
  const m = n.match(/(\d+(?:[.,]\d+)?)\s*(ק"ג|קג|קילו|גרם|גר'|גר|ג'|מ"ל|מל|ליטר|ל'|יח'|יחידות|קפסולות|שקיות|kg|g|ml|l)(?![א-תa-z])/i);
  if (!m) return null;
  const word = m[2];
  if (/קפסולות|שקיות/.test(word)) return { amount: num(m[1]), base: 'unit' };
  const rule = unitOf(word === 'g' ? 'gr' : word);
  return rule ? { amount: num(m[1]) * rule[2], base: rule[1] } : null;
}

// גודל המוצר: { amount, base, meters? } או null כשלא ידוע
function sizeOf(it) {
  if (it.weighted) return { amount: 1, base: 'kg' }; // מחיר לק"ג
  const named = fromName(it.name);
  if (named?.base === 'roll') return named; // גלילים – רק מהשם
  const q = num(it.qty);
  const rule = unitOf(it.unit);
  if (q > 0 && rule) {
    // ״יחידה״ עם כמות 1 לא אומרת הרבה – עדיף מה שכתוב בשם, אם יש
    if (rule[1] === 'unit' && q <= 1 && named) return named;
    return { amount: q * rule[2], base: rule[1] };
  }
  return named;
}

// מחיר ליחידת המידה שמוצגת בחנויות: ל-100 גרם, ל-100 מ"ל, ליחידה, לגליל (ולמטר אם ידוע)
function perUnit(price, size) {
  if (!size || !(size.amount > 0) || !(price > 0)) return null;
  const per = price / size.amount;
  if (size.base === 'kg') return { value: per / 10, label: '100 גרם' };
  if (size.base === 'l') return { value: per / 10, label: '100 מ"ל' };
  if (size.base === 'roll') return { value: per, label: 'גליל', ...(size.meters ? { perMeter: price / size.meters } : {}) };
  return { value: per, label: 'יח\'' };
}

// תיאור קצר של הגודל: ״500 גרם״, ״1 ק"ג״, ״32 גלילים״
function sizeLabel(size) {
  if (!size) return '';
  const r = (x) => Math.round(x * 100) / 100;
  if (size.base === 'kg') return size.amount < 1 ? `${r(size.amount * 1000)} גרם` : `${r(size.amount)} ק"ג`;
  if (size.base === 'l') return size.amount < 1 ? `${r(size.amount * 1000)} מ"ל` : `${r(size.amount)} ליטר`;
  if (size.base === 'roll') return `${size.amount} גלילים${size.meters ? ` (${r(size.meters)} מ')` : ''}`;
  return `${r(size.amount)} יח'`;
}

// מפתח להשוואה בין שני מוצרים: מחיר לכמות בסיס, כששניהם באותה יחידה; אחרת – מחיר האריזה
function cheaper(a, b, priceA = a.price, priceB = b.price) {
  // נייר טואלט: כשלשניהם יש אורך – לפי מטר (גלילים באורכים שונים), אחרת לפי גליל
  if (a.size?.meters && b.size?.meters) return priceA / a.size.meters < priceB / b.size.meters;
  if (a.size && b.size && a.size.base === b.size.base) return priceA / a.size.amount < priceB / b.size.amount;
  return priceA < priceB;
}

module.exports = { sizeOf, perUnit, sizeLabel, fromName, cheaper };
