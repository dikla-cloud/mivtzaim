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

// לשימוש חוזר על הרבה מוצרים (השוואת עגלה): מכינים את מילות שם המוצר פעם אחת
const variantsOf = (name) => tokens(name).flatMap((w) => (/^[הובלמש]/.test(w) && w.length > 2 ? [w, w.slice(1)] : [w]));
const matchVariants = (queryTokens, variants) => queryTokens.length > 0 && queryTokens.every((t) => variants.some((w) => w.startsWith(t)));

// כתיב שונה של אותו מוצר בקובצי הרשתות (בעיקר ירקות ועשבי תיבול, שאין להם ברקוד משותף)
const SPELLING = [
  ['כוסברה', 'כוסבר', 'כסברה'],
  ['עגבנייה', 'עגבניה', 'עגבניות'],
  ['נענע', 'נענה'],
  ['תפוא', 'תפוח אדמה', 'תפוחי אדמה'],
  ['בצל ירוק', 'בצלצל'],
  ['קישוא', 'קישואים', 'זוקיני'],
  ['חציל', 'חצילים'],
  ['פלפל', 'גמבה'],
].map((g) => g.map(normalize));

// חלופות לחיפוש: מה שנכתב (כולל חלופות עם |) ועוד כתיב אחר של אותו מוצר
function alternatives(text) {
  const out = [];
  for (const alt of String(text).split('|').map((x) => x.trim()).filter((x) => x && !/^\d+$/.test(x))) {
    const n = normalize(alt);
    out.push(n);
    for (const g of SPELLING) {
      const hit = g.find((w) => ` ${n} `.includes(` ${w} `));
      if (hit) for (const w of g) if (w !== hit) out.push(` ${n} `.replace(` ${hit} `, ` ${w} `).trim());
    }
  }
  return [...new Set(out)];
}

// אם לא נמצא כלום: בלי סיומת (״כוסברה״ ← ״כוסבר״, ״מלפפונים״ ← ״מלפפונ״), כדי למצוא גם יחיד/רבים. אחרי normalize הסופיות רגילות (ים ← ימ)
const stem = (t) => (t.length >= 5 ? t.replace(/(יות|ות|ימ|יה|ה)$/, '') : t);

module.exports = { normalize, matches, tokens, variantsOf, matchVariants, alternatives, stem };
