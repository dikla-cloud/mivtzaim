// רשתות שמפרסמות בפורטל laibcatalog.co.il (ויקטורי). רשימת הקבצים מגיעה מה-API של הפורטל:
//   /webapi/api/getfiles?edi=<קוד רשת> → [{ fileName, fileType, fileDate, ... }]
//   והקובץ עצמו: /webapi/<קוד רשת>/<fileName>
// אם ה-API לא עונה – מנסים את עמוד הקבצים הישן (NBCompetitionRegulations.aspx), רק קבצים של קוד הרשת.
const { Session } = require('../http');
const xml = require('../xml');
const { fileLinks, parseName, BROWSER } = require('./weblist');

const BASE = (process.env.LAIB_BASE || 'https://laibcatalog.co.il').replace(/\/$/, '');
const LIST_TTL = 10 * 60000; // רשימת הקבצים נשמרת 10 דקות (לא לבקש אותה לכל סניף מחדש)
const OPTS = { headers: { ...BROWSER, Accept: 'application/json, text/html, */*' }, timeout: 60000 };
// הורדת קובץ: Accept כללי (עם Accept של JSON/HTML השרת עונה 406)
const FILE = { headers: { ...BROWSER, Accept: '*/*' }, timeout: 120000 };

function chain(id, name, codes) {
  let cached = null; // { at, list }
  async function listFiles(s) {
    if (cached && Date.now() - cached.at < LIST_TTL) return cached.list;
    const list = [];
    const errors = [];
    for (const code of codes) {
      try {
        const data = JSON.parse(await s.text(`${BASE}/webapi/api/getfiles?edi=${code}`, OPTS));
        for (const e of Array.isArray(data) ? data : data?.files || data?.data || []) {
          const fileName = String(e.fileName || e.FileName || e.name || '').split('/').pop();
          const f = parseName(fileName);
          if (!f || f.code !== code) continue;
          // אם ה-API מחזיר קישור/נתיב לקובץ – משתמשים בו קודם
          const given = [e.url, e.Url, e.fileUrl, e.downloadUrl, e.filePath, e.path].filter((x) => typeof x === 'string' && x)
            .map((x) => new URL(x, `${BASE}/webapi/${code}/`).href);
          list.push({ ...f, name: fileName, entry: e, urls: [...given, `${BASE}/webapi/${code}/${fileName}`] });
        }
      } catch (e) {
        errors.push(e.message);
      }
    }
    if (!list.length) {
      try {
        const page = `${BASE}/NBCompetitionRegulations.aspx`;
        list.push(...fileLinks(await s.text(page, OPTS), page).filter((f) => codes.includes(f.code)));
      } catch (e) {
        errors.push(e.message);
      }
    }
    if (!list.length) throw new Error(`${name}: לא נמצאו קבצים בפורטל ${BASE}${errors.length ? ` (${errors[0]})` : ''}`);
    cached = { at: Date.now(), list };
    return list;
  }
  // הורדה: כמה כתובות אפשריות, ועם/בלי כותרות דפדפן. אם הכול נכשל – בהודעה גם מה שה-API החזיר על הקובץ
  async function download(s, f) {
    let last;
    for (const url of f.urls || [f.url]) {
      for (const opts of [FILE, { headers: { Accept: '*/*' }, timeout: 120000, tries: 1 }]) {
        try { return await s.buffer(url, opts); } catch (e) { last = e; }
      }
    }
    throw new Error(`${last.message}${f.entry ? ` · ${JSON.stringify(f.entry).slice(0, 300)}` : ''}`);
  }
  const latest = (ls, kind, store) => {
    for (const k of kind === 'stores' ? ['stores'] : [kind, kind.replace('full', '')]) {
      const f = ls.filter((l) => l.kind === k && (store == null || l.store === Number(store))).sort((a, b) => b.stamp.localeCompare(a.stamp))[0];
      if (f) return f;
    }
    return null;
  };
  return {
    id, name,
    async stores() {
      const s = new Session();
      const ls = await listFiles(s);
      // לכל קוד רשת יש קובץ סניפים משלו – מאחדים
      const out = new Map();
      for (const code of codes) {
        const f = latest(ls.filter((l) => l.code === code), 'stores');
        if (!f) continue;
        for (const st of xml.parseStores(await download(s, f))) if (!out.has(String(st.storeId))) out.set(String(st.storeId), st);
      }
      if (!out.size) throw new Error(`${name}: לא נמצא קובץ סניפים`);
      return [...out.values()];
    },
    async storeFiles(storeId) {
      const s = new Session();
      const ls = await listFiles(s);
      const promo = latest(ls, 'promofull', storeId);
      const price = latest(ls, 'pricefull', storeId);
      if (!promo || !price) throw new Error(`${name}: חסרים קבצים לסניף ${storeId}`);
      return { promos: await download(s, promo), prices: await download(s, price) };
    },
  };
}

module.exports = {
  chains: [chain('victory', 'ויקטורי', (process.env.VICTORY_CODES || '7290696200003,7290058103393').split(',').map((x) => x.trim()))],
};
