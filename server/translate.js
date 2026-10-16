// תרגום פריטי הרשימה לשפה המקומית (לחיפוש בעלונים ובאתרי הרשתות). סדר העדיפויות:
// 1. תרגום ידני ברשימה: "חלב 3% | Milch"
// 2. מילון מוצרי המכולת המובנה (glossary.js)
// 3. שירות התרגום החינמי MyMemory – רק אם התשובה נראית כמו שם מוצר (בלי משפטים ופיסוק)
const db = require('./db');
const glossary = require('./glossary');

const HEB = /[\u0590-\u05FF]/;
const ARAB = /[\u0600-\u06FF]/;
// תרגום ידני אחרי קו: לעברית מחפשים חלופה בעברית, ולשפות אחרות – חלופה באותיות לטיניות
const manualAlt = (text, lang) => text.split('|').map((s) => s.trim()).find((s) => (lang === 'he' ? HEB.test(s) : /[a-zà-ÿ]/i.test(s)));
const sourceLang = (text) => (ARAB.test(text) && !HEB.test(text) ? 'ar' : 'he');

// MyMemory מחזיר לפעמים "תרגומים" מזיכרון משותף שאינם קשורים ("Ah, Wein von Samos.")
const plausible = (src, t, lang = 'de') => t && !/[.!?"“”„:;()]/.test(t) && t.split(/\s+/).length <= Math.max(3, src.split(/\s+/).length + 1)
  && (lang === 'he' ? HEB.test(t) : !HEB.test(t) && !ARAB.test(t));

async function translateOne(text, lang) {
  const url = `https://api.mymemory.translated.net/get?langpair=${sourceLang(text)}|${lang}&q=${encodeURIComponent(text)}${process.env.VAPID_SUBJECT ? `&de=${encodeURIComponent(process.env.VAPID_SUBJECT.replace(/^mailto:/, ''))}` : ''}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  const json = await res.json();
  const t = json?.responseData?.translatedText?.trim();
  return json?.responseStatus === 200 && !/MYMEMORY WARNING/i.test(t || '') && plausible(text, t, lang) ? t : null;
}

// מחזיר { [פריט]: { term, how } } – how: manual / glossary / online
module.exports = async function translate(items, lang, country) {
  const d = db.get();
  const cache = (d.translations ||= {})[`${lang}:v2`] ||= {}; // v2: מטמון חדש, בלי התרגומים השגויים מהגרסה הקודמת
  const out = {};
  let changed = false;
  for (const t of items) {
    const manual = manualAlt(t, lang);
    if (manual) { out[t] = { term: manual, how: 'manual' }; continue; }
    const g = sourceLang(t) === 'he' && glossary.lookup(t, lang, country);
    if (g) { out[t] = { term: g, how: 'glossary' }; continue; }
    if (!(t in cache)) {
      try {
        cache[t] = await translateOne(t.split('|')[0].trim(), lang);
        changed = true;
      } catch { /* בלי תרגום – נחפש בטקסט המקורי */ }
    }
    if (cache[t]) out[t] = { term: cache[t], how: 'online' };
  }
  if (changed) db.save();
  return out;
};

module.exports.plausible = plausible;
module.exports.sourceLang = sourceLang;
