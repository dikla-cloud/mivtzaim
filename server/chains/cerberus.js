// פורטל Cerberus (url.publishedprices.co.il) – משמש את רמי לוי, אושר עד, יוחננוף, טיב טעם ועוד.
// הכניסה היא עם שם משתמש ציבורי של הרשת וסיסמה ריקה.
const { Session } = require('../http');
const xml = require('../xml');

const BASE = 'https://url.publishedprices.co.il';

const csrf = (html) => (html.match(/name="csrftoken"\s+content="([^"]+)"/) || [])[1] || '';

async function login(username) {
  const s = new Session();
  const token = csrf(await s.text(`${BASE}/login`));
  const body = new URLSearchParams({ r: '', username, password: '', Submit: 'Sign in', csrftoken: token });
  const page = await s.text(`${BASE}/login/user`, {
    method: 'POST', body, headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  s.csrftoken = csrf(page) || csrf(await s.text(`${BASE}/file`));
  return s;
}

async function listFiles(s, search) {
  const body = new URLSearchParams({
    sEcho: '1', iColumns: '5', sColumns: ',,,,', iDisplayStart: '0', iDisplayLength: '100000',
    sSearch: search, cd: '/', csrftoken: s.csrftoken,
  });
  const res = await s.fetch(`${BASE}/file/json/dir`, {
    method: 'POST', body, headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  const json = await res.json();
  return (json.aaData || []).map((f) => f.fname).filter(Boolean);
}

// בחירת הקובץ העדכני ביותר מסוג מסוים לסניף מסוים.
// שמות אפשריים: Stores7290058140886-000-202610250200.xml / Stores7290058140886-202610250200.xml /
// PriceFull7290058140886-001-202610250200.gz / PriceFull7290058140886-001-000-20261025-020000.gz
function parseCerberusName(f, prefix) {
  const m = String(f).match(new RegExp(`^${prefix}(\\d{13})-(\\d{3})(?:-(\\d{3}))?-?(\\d{8})-?(\\d{4,6})`, 'i'))
    || String(f).match(new RegExp(`^${prefix}(\\d{13})-()()(\\d{8})(\\d{4,6})`, 'i'));
  if (!m) return null;
  return { store: m[3] ?? m[2], stamp: m[4] + m[5].padEnd(6, '0') };
}
function pickLatest(files, prefix, storeId) {
  return files
    .map((f) => ({ f, p: parseCerberusName(f, prefix) }))
    .filter(({ p }) => p && (storeId == null || Number(p.store) === Number(storeId)))
    .sort((a, b) => b.p.stamp.localeCompare(a.p.stamp))[0]?.f;
}
const sample = (files) => `${files.length} ${files.slice(0, 4).join(', ')}`;

function chain(id, name, username) {
  return {
    id, name,
    async stores() {
      const s = await login(username);
      const files = await listFiles(s, 'Stores');
      const f = pickLatest(files, 'Stores');
      // לאבחון: כמה קבצים חזרו ואיך נקראים הראשונים
      if (!f) throw new Error(`${name}: לא נמצא קובץ סניפים (קבצים: ${sample(files.length ? files : await listFiles(s, ''))})`);
      return xml.parseStores(await s.buffer(`${BASE}/file/d/${f}`));
    },
    async storeFiles(storeId) {
      const s = await login(username);
      const promo = pickLatest(await listFiles(s, 'PromoFull'), 'PromoFull', storeId);
      const price = pickLatest(await listFiles(s, 'PriceFull'), 'PriceFull', storeId);
      if (!promo || !price) throw new Error(`${name}: חסרים קבצים לסניף ${storeId}`);
      return {
        promos: await s.buffer(`${BASE}/file/d/${promo}`),
        prices: await s.buffer(`${BASE}/file/d/${price}`),
      };
    },
  };
}

module.exports = {
  parseCerberusName,
  pickLatest,
  chains: [
    chain('ramilevy', 'רמי לוי', 'RamiLevi'),
    chain('osherad', 'אושר עד', 'osherad'),
    chain('yohananof', 'יוחננוף', 'yohananof'),
    chain('tivtaam', 'טיב טעם', 'TivTaam'),
    chain('keshet', 'קשת טעמים', 'Keshet'),
    chain('freshmarket', 'פרשמרקט', 'freshmarket'),
    chain('salachdabach', 'סאלח דבאח', 'SalachD'),
    chain('doralon', 'דור אלון (אלונית)', 'doralon'),
  ],
};
