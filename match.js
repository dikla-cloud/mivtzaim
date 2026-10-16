// התאמת פריט מרשימת הקניות לשם מוצר מקובץ המחירים
const FINALS = { 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' };

function normalize(s) {
  return String(s || '')
    .replace(/[֑-ׇ]/g, '') // ניקוד וטעמים
    .replace(/[״"׳'`]/g, '')
    .replace(/[ךםןףץ]/g, (c) => FINALS[c])
    .toLowerCase()
    .replace(/[^\p{L}\p{N}%.]+/gu, ' ')
    .trim();
}

const tokens = (s) => normalize(s).split(' ').filter(Boolean);

// פריט ברשימה מתאים אם כל המילים שלו מופיעות בשם המוצר (כתחילית מילה, גם אחרי ה/ו/ב/ל/מ/ש)
// אפשר לכתוב כמה חלופות מופרדות ב-| (למשל "חלב 3% | Milch")
function matches(query, itemName, itemCode) {
  return String(query).split('|').some((q) => matchOne(q, itemName, itemCode));
}

function matchOne(query, itemName, itemCode) {
  const q = String(query).trim();
  if (/^\d{7,14}$/.test(q)) return q === String(itemCode);
  const words = tokens(itemName);
  const variants = words.flatMap((w) => (/^[הובלמש]/.test(w) && w.length > 2 ? [w, w.slice(1)] : [w]));
  const qt = tokens(q);
  return qt.length > 0 && qt.every((t) => variants.some((w) => w.startsWith(t)));
}

module.exports = { normalize, matches };
