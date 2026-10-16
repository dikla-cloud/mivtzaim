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

// בחירת הקובץ העדכני ביותר מסוג מסוים לסניף מסוים
function pickLatest(files, prefix, storeId) {
  const re = new RegExp(`^${prefix}\\d+-(\\d+)-(\\d{12})`, 'i');
  return files
    .map((f) => ({ f, m: f.match(re) }))
    .filter(({ m }) => m && (storeId == null || Number(m[1]) === Number(storeId)))
    .sort((a, b) => b.m[2].localeCompare(a.m[2]))[0]?.f;
}

function chain(id, name, username) {
  return {
    id, name,
    async stores() {
      const s = await login(username);
      const f = pickLatest(await listFiles(s, 'Stores'), 'Stores');
      if (!f) throw new Error(`${name}: לא נמצא קובץ סניפים`);
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
