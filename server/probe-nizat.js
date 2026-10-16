// בדיקה חד-פעמית: איך בנויים דף המבצעים ודף הסניפים של ניצת הדובדבן.
// רק קוראת מהאתר ומדפיסה קטעים קצרים – לא משנה כלום בשרת.
// הרצה: node server/probe-nizat.js
const BASE = 'https://www.nizat.com/';
const UA = { 'User-Agent': 'Mozilla/5.0' };

const get = async (u) => (await fetch(u, { headers: UA, signal: AbortSignal.timeout(30000) })).text();
const flat = (s) => s.replace(/\s+/g, ' ');
const text = (s) => flat(s.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' '));

(async () => {
  const promo = await get(BASE + encodeURI('מבצעי-מועדון'));
  const cats = [...new Set([...promo.matchAll(/href="([^"]*catid=\d+)"/g)].map((m) => m[1].replace(/&amp;/g, '&')))];
  console.log(`### קטגוריות: ${cats.length}`, cats[0] || '');
  const catUrl = cats[0] ? new URL(cats[0], BASE).href : null;
  if (catUrl) {
    const html = flat(await get(catUrl));
    const i = html.indexOf('₪');
    console.log(`### מוצר (גודל ${html.length}, שקלים ${html.split('₪').length - 1})`);
    console.log(i < 0 ? '(לא נמצא ₪)' : html.slice(Math.max(0, i - 1800), i + 700));
    const dates = html.match(/\d{1,2}[./]\d{1,2}[./]\d{2,4}/g) || [];
    console.log(`### תאריכים בדף: ${dates.length}`, [...new Set(dates)].slice(0, 5).join(' '));
    const pages = [...new Set([...html.matchAll(/href="([^"]*(?:page|pg)=\d+[^"]*)"/gi)].map((m) => m[1]))];
    console.log(`### עמודים נוספים: ${pages.length}`, pages.slice(0, 3).join(' '));
  }
  const snif = await get(BASE + 'snifim.aspx');
  const coords = flat(snif).match(/3[0-3]\.\d{4,}[^0-9]{1,40}3[45]\.\d{4,}/g) || [];
  console.log(`\n### סניפים (גודל ${snif.length}), זוגות קואורדינטות: ${coords.length}`);
  console.log(coords.slice(0, 3).join('\n'));
  const t = text(snif);
  const j = t.search(/כתובת|רחוב|סניף/);
  console.log(t.slice(Math.max(0, j - 200), j + 1500));
  const k = flat(snif).search(/כתובת|רחוב/);
  console.log('\n### קוד סביב כתובת');
  console.log(k < 0 ? '(לא נמצא)' : flat(snif).slice(Math.max(0, k - 600), k + 600));
})().catch((e) => console.log('שגיאה:', e.message));
