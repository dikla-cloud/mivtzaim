// בדיקה חד-פעמית: מאיפה SaleFinder (אוסטרליה) טוען את המוצרים בקטלוגים של Coles / Woolworths / ALDI.
// רק קוראת ומדפיסה – לא משנה כלום. הרצה: node server/probe-salefinder.js
const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36' };
const get = async (u, ms = 25000) => {
  const res = await fetch(u, { headers: UA, redirect: 'follow', signal: AbortSignal.timeout(ms) });
  return { status: res.status, type: res.headers.get('content-type'), text: await res.text() };
};
const show = (label, r) => console.log(`\n### ${label} → ${r.status} · ${r.text.length} תווים · ${r.type}\n${r.text.replace(/\s+/g, ' ').slice(0, 400)}`);

(async () => {
  try {
    const home = await get('https://www.salefinder.com.au/');
    const cats = [...new Set([...home.text.matchAll(/https?:\/\/(?:www\.)?salefinder\.com\.au\/((?:coles|woolworths|aldi|iga)[^"'\s]*catalogue[^"'\s]*)/gi)].map((m) => m[0]))];
    console.log(`### קטלוגים של סופרים בדף הבית: ${cats.length}\n${cats.slice(0, 6).join('\n')}`);
    const retailerPages = ['https://www.salefinder.com.au/coles-catalogue', 'https://www.salefinder.com.au/woolworths-catalogue'];
    for (const u of retailerPages) {
      try {
        const r = await get(u);
        const links = [...new Set([...r.text.matchAll(/\/(?:coles|woolworths)-catalogue\/[^"'\s#]+\/(\d+)\/[^"'\s#]*/gi)].map((m) => m[0]))];
        const embeds = [...new Set([...r.text.matchAll(/(?:https?:)?\/\/embed\.salefinder\.com\.au\/[^"'\s)]+/gi)].map((m) => m[0]))];
        console.log(`\n### ${u} → ${r.status} · קטלוגים: ${links.length}\n${links.slice(0, 4).join('\n')}\nembed: ${embeds.slice(0, 6).join(' ')}`);
        const id = links[0]?.match(/\/(\d+)\//)?.[1];
        if (id) {
          const page = await get(`https://www.salefinder.com.au${links[0].split('#')[0]}`);
          const urls = [...new Set([...page.text.matchAll(/(?:https?:)?\/\/[a-z.]*salefinder\.com\.au\/[^"'\s)]*(?:json|productlist|catalogue|svgData|items)[^"'\s)]*/gi)].map((m) => m[0]))];
          console.log(`### דף הקטלוג ${id}: ${urls.slice(0, 10).join('\n') || '(אין)'}`);
          for (const c of [
            `https://embed.salefinder.com.au/productlist/view/${id}/?format=json`,
            `https://embed.salefinder.com.au/catalogue/getAreaSVG/${id}/?format=json`,
            `https://embed.salefinder.com.au/catalogues/view/${id}/?format=json`,
          ]) {
            try { show(c, await get(c)); } catch (e) { console.log(`\n### ${c} → שגיאה: ${e.message}`); }
          }
        }
      } catch (e) { console.log(`\n### ${u} → שגיאה: ${e.message}`); }
    }
    for (const u of ['https://www.salefinder.com.au/search?q=milk', 'https://www.salefinder.com.au/search/milk?qs=1']) {
      try { const r = await get(u, 40000); console.log(`\n### ${u} → ${r.status} · ${r.text.length} תווים`); } catch (e) { console.log(`\n### ${u} → שגיאה: ${e.message}`); }
    }
  } catch (e) { console.log('שגיאה:', e.message); }
})();
