// בדיקה חד-פעמית: איך כתובים מוצרים ומחירים בעמוד ההדפסה של קטלוג SaleFinder ובעמוד החיפוש.
// רק קוראת ומדפיסה – לא משנה כלום. הרצה: node server/probe-salefinder.js
const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36' };
const get = async (u, ms = 40000) => {
  const res = await fetch(u, { headers: UA, redirect: 'follow', signal: AbortSignal.timeout(ms) });
  return { status: res.status, text: await res.text() };
};
const flat = (s) => s.replace(/\s+/g, ' ');

async function show(label, url) {
  try {
    const r = await get(url);
    const html = flat(r.text);
    const prices = html.match(/\$\s?\d+(?:\.\d\d)?/g) || [];
    console.log(`\n##### ${label} → ${r.status} · ${html.length} תווים · ${prices.length} מחירים`);
    const i = html.search(/\$\s?\d+\.\d\d/);
    if (i >= 0) console.log(html.slice(Math.max(0, i - 900), i + 500));
    const classes = [...new Set([...html.matchAll(/class="([^"]*(?:price|item|product|sale|name)[^"]*)"/gi)].map((m) => m[1]))].slice(0, 25);
    console.log('classes:', classes.join(' | '));
  } catch (e) {
    console.log(`\n##### ${label} → שגיאה: ${e.message}`);
  }
}

(async () => {
  const list = flat((await get('https://www.salefinder.com.au/coles-catalogue')).text);
  const id = (list.match(/\/coles-catalogue\/coles-catalogue[^"'\s#]*\/(\d+)\//) || [])[1];
  console.log('Coles catalogue id:', id);
  if (id) await show('עמוד הדפסה של הקטלוג', `https://salefinder.com.au/catalogue/printpage/${id}/?all=1`);
  await show('חיפוש milk', 'https://www.salefinder.com.au/search/milk?qs=1');
})();
