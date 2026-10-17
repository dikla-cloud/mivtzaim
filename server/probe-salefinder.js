// בדיקה חד-פעמית: מה האתר SaleFinder (אוסטרליה) מחזיר לשרת, ואיפה נמצאים נתוני הקטלוגים.
// רק קוראת ומדפיסה – לא משנה כלום. הרצה: node server/probe-salefinder.js
const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36' };
const URLS = [
  'https://www.salefinder.com.au/',
  'https://www.salefinder.com.au/search/milk',
  'https://embed.salefinder.com.au/',
];

(async () => {
  for (const u of URLS) {
    try {
      const res = await fetch(u, { headers: UA, redirect: 'follow', signal: AbortSignal.timeout(20000) });
      const html = await res.text();
      console.log(`\n### ${u} → ${res.status} · ${html.length} תווים · ${res.headers.get('content-type')}`);
      const hits = [...new Set([...html.matchAll(/["'(]((?:https?:)?\/\/[^"' )]*(?:api|embed|catalogue|search|product)[^"' )]{0,120})/gi)].map((m) => m[1]))].slice(0, 15);
      console.log(hits.join('\n') || '(אין קישורים מעניינים)');
      const scripts = [...html.matchAll(/<script[^>]+src="([^"]+)"/gi)].map((m) => m[1]).slice(0, 8);
      if (scripts.length) console.log('scripts:', scripts.join(' '));
      if (/\$\s*\d+(\.\d\d)?/.test(html)) console.log('דוגמת מחיר:', (html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').match(/.{0,80}\$\s*\d+\.\d\d.{0,40}/) || [''])[0]);
    } catch (e) {
      console.log(`\n### ${u} → שגיאה: ${e.message}`);
    }
  }
})();
