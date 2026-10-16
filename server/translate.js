// תרגום פריטי הרשימה לשפה המקומית (לחיפוש בעלונים), בשירות התרגום החינמי MyMemory.
// נשמר במטמון כדי לא לתרגם שוב. אפשר גם לכתוב תרגום ידני ברשימה: "חלב 3% | Milch"
const db = require('./db');

const latinAlt = (text) => text.split('|').map((s) => s.trim()).find((s) => /[a-zà-ÿ]/i.test(s));

async function translateOne(text, lang) {
  const url = `https://api.mymemory.translated.net/get?langpair=he|${lang}&q=${encodeURIComponent(text)}${process.env.VAPID_SUBJECT ? `&de=${encodeURIComponent(process.env.VAPID_SUBJECT.replace(/^mailto:/, ''))}` : ''}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  const json = await res.json();
  const t = json?.responseData?.translatedText;
  return json?.responseStatus === 200 && t && !/MYMEMORY WARNING/i.test(t) ? t : null;
}

module.exports = async function translate(items, lang) {
  const d = db.get();
  const cache = (d.translations ||= {})[lang] ||= {};
  const out = {};
  let changed = false;
  for (const t of items) {
    const manual = latinAlt(t);
    if (manual) { out[t] = manual; continue; }
    if (!cache[t]) {
      try {
        const tr = await translateOne(t.split('|')[0].trim(), lang);
        if (tr) { cache[t] = tr; changed = true; }
      } catch { /* בלי תרגום – נחפש בטקסט המקורי */ }
    }
    if (cache[t]) out[t] = cache[t];
  }
  if (changed) db.save();
  return out;
};
