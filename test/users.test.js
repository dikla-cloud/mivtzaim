const test = require('node:test');
const assert = require('node:assert');
const os = require('os');
const fs = require('fs');
const path = require('path');

// קובץ נתונים מהגרסה הקודמת (משתמש יחיד) – צריך לעבור לחשבון המנהל
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mv-users-'));
fs.writeFileSync(path.join(dir, 'db.json'), JSON.stringify({ list: [{ id: 'x', text: 'חלב' }], radiusKm: 7, storesCache: {} }));
process.env.DATA_DIR = dir;
process.env.APP_TOKEN = 'initial123';

const app = require('../server/index.js');
let base;
const server = app.listen(0);
test.before(() => { base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => server.close());

async function call(method, url, body, token) {
  const res = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', 'x-app-token': token || '' }, body: body && JSON.stringify(body) });
  return { status: res.status, json: await res.json() };
}

test('family accounts end to end', async () => {
  assert.equal((await call('GET', '/api/state')).status, 401);
  assert.equal((await call('GET', '/api/setup')).json.firstRun, true);

  // כניסה ראשונה רק עם הסיסמה מההתקנה
  assert.equal((await call('POST', '/api/login', { name: 'דיקלה', password: 'wrong' })).status, 401);
  const owner = (await call('POST', '/api/login', { name: 'דיקלה', password: 'initial123' })).json.token;
  let s = (await call('GET', '/api/state', null, owner)).json;
  assert.deepEqual(s.me, { name: 'דיקלה', admin: true });
  assert.equal(s.list[0].text, 'חלב'); // נתונים ישנים עברו
  assert.equal(s.radiusKm, 7);

  // מנהל מוסיף בן משפחה
  assert.equal((await call('POST', '/api/users', { name: 'יואב', password: '123' }, owner)).status, 400);
  s = (await call('POST', '/api/users', { name: 'יואב', password: 'yoav123' }, owner)).json;
  assert.deepEqual(s.users.map((u) => u.name), ['דיקלה', 'יואב']);

  const yoav = (await call('POST', '/api/login', { name: 'יואב', password: 'yoav123' })).json.token;
  s = (await call('GET', '/api/state', null, yoav)).json;
  assert.deepEqual(s.me, { name: 'יואב', admin: false });
  assert.equal(s.users, undefined);
  assert.equal(s.list.length, 0); // רשימה נפרדת

  // משתמש רגיל לא יכול לנהל משתמשים
  assert.equal((await call('POST', '/api/users', { name: 'זר', password: 'zzzzzz' }, yoav)).status, 403);

  // הרשימה של יואב לא משפיעה על דיקלה
  await call('PUT', '/api/list', { items: ['במבה'] }, yoav);
  assert.equal((await call('GET', '/api/state', null, owner)).json.list[0].text, 'חלב');

  // החלפת סיסמה: הישנה מפסיקה לעבוד, המכשיר הנוכחי נשאר מחובר
  assert.equal((await call('PUT', '/api/password', { current: 'bad', next: 'newpass1' }, yoav)).status, 400);
  assert.equal((await call('PUT', '/api/password', { current: 'yoav123', next: 'newpass1' }, yoav)).status, 200);
  assert.equal((await call('POST', '/api/login', { name: 'יואב', password: 'yoav123' })).status, 401);
  assert.equal((await call('POST', '/api/login', { name: 'יואב', password: 'newpass1' })).status, 200);
  assert.equal((await call('GET', '/api/state', null, yoav)).status, 200);

  // הסיסמה מההתקנה כבר לא פותחת כלום
  assert.equal((await call('POST', '/api/login', { name: 'מישהו', password: 'initial123' })).status, 401);

  // מחיקה מנתקת
  await call('DELETE', `/api/users/${encodeURIComponent('יואב')}`, null, owner);
  assert.equal((await call('GET', '/api/state', null, yoav)).status, 401);
  assert.equal((await call('DELETE', `/api/users/${encodeURIComponent('דיקלה')}`, null, owner)).status, 400);

  // הסיסמאות לא נשמרות כטקסט גלוי
  const raw = fs.readFileSync(path.join(dir, 'db.json'), 'utf8');
  assert.ok(!raw.includes('initial123') && !raw.includes('newpass1'));
});
