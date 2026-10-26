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
  assert.deepEqual([s.me.name, s.me.admin], ['דיקלה', true]);
  assert.equal(s.list[0].text, 'חלב'); // נתונים ישנים עברו
  assert.equal(s.radiusKm, 7);

  // מנהל מוסיף בן משפחה
  assert.equal((await call('POST', '/api/users', { name: 'יואב', password: '123' }, owner)).status, 400);
  s = (await call('POST', '/api/users', { name: 'יואב', password: 'yoav123' }, owner)).json;
  assert.deepEqual(s.users.map((u) => u.name), ['דיקלה', 'יואב']);

  const yoav = (await call('POST', '/api/login', { name: 'יואב', password: 'yoav123' })).json.token;
  s = (await call('GET', '/api/state', null, yoav)).json;
  assert.deepEqual([s.me.name, s.me.admin], ['יואב', false]);
  assert.ok(s.users.every((u) => !('pass' in u)));
  assert.equal(s.list.length, 0); // רשימה נפרדת

  // משתמש רגיל יכול לשתף בן בית נוסף, אבל לא למחוק משתמשים או לאפס סיסמאות
  assert.equal((await call('POST', '/api/users', { name: 'זר', password: 'zzzzzz' }, yoav)).status, 200);
  assert.equal((await call('DELETE', `/api/users/${encodeURIComponent('זר')}`, null, yoav)).status, 403);
  assert.equal((await call('PUT', `/api/users/${encodeURIComponent('דיקלה')}/password`, { password: 'hacked1' }, yoav)).status, 403);
  await call('DELETE', `/api/users/${encodeURIComponent('זר')}`, null, owner);

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

test('shared "missing at home" list per household; watch list untouched', async () => {
  const owner = (await call('POST', '/api/login', { name: 'דיקלה', password: 'initial123' })).json.token
    || (await call('POST', '/api/login', { name: 'דיקלה', password: 'newowner1' })).json.token;
  assert.ok(owner);
  // משתמש רגיל יכול לשתף מישהו נוסף ממשק הבית שלו
  await call('POST', '/api/users', { name: 'נועה', password: 'noa123' }, owner);
  const noa = (await call('POST', '/api/login', { name: 'נועה', password: 'noa123' })).json.token;
  assert.equal((await call('POST', '/api/users', { name: 'סבתא', password: 'savta1' }, noa)).status, 200);
  const savta = (await call('POST', '/api/login', { name: 'סבתא', password: 'savta1' })).json.token;
  // מנהל יכול ליצור משק בית נפרד
  await call('POST', '/api/users', { name: 'שכן', password: 'shachen1', newHousehold: true }, owner);
  const shachen = (await call('POST', '/api/login', { name: 'שכן', password: 'shachen1' })).json.token;

  const before = (await call('GET', '/api/state', null, owner)).json.list.map((x) => x.text);
  let h = (await call('POST', '/api/home', { items: ['חלב', 'לחם', 'ביצים', 'חלב'] }, savta)).json.home;
  assert.deepEqual(h.map((x) => x.text), ['חלב', 'לחם', 'ביצים']); // בלי כפילות
  assert.equal(h[0].by, 'סבתא');
  assert.equal((await call('GET', '/api/home', null, owner)).json.home.length, 3); // משותף
  assert.equal((await call('GET', '/api/home', null, shachen)).json.home.length, 0); // משק בית אחר

  // בסופר: שני פריטים נקנו, אחד לא
  await call('PATCH', `/api/home/${h[0].id}`, { done: true }, noa);
  await call('PATCH', `/api/home/${h[2].id}`, { done: true }, owner);
  h = (await call('POST', '/api/home/clear-done', null, owner)).json.home;
  assert.deepEqual(h.map((x) => [x.text, x.done]), [['לחם', false]]);
  // הרשימה לחיפוש מבצעים לא השתנתה
  assert.deepEqual((await call('GET', '/api/state', null, owner)).json.list.map((x) => x.text), before);

  // משתמש רגיל רואה רק את בני הבית שלו
  const names = (await call('GET', '/api/state', null, noa)).json.users.map((u) => u.name).sort();
  assert.deepEqual(names, ['דיקלה', 'נועה', 'סבתא'].sort());
});


test('invite limits: max users and who may invite', async () => {
  const owner = (await call('POST', '/api/login', { name: 'דיקלה', password: 'initial123' })).json.token;
  const noa = (await call('POST', '/api/login', { name: 'נועה', password: 'noa123' })).json.token;
  let s = (await call('GET', '/api/state', null, owner)).json;
  assert.equal(s.limits.maxUsers, 20); // ברירת מחדל
  const count = s.limits.count;
  // רק מנהל משנה הגבלות
  assert.equal((await call('PUT', '/api/limits', { maxUsers: 100 }, noa)).status, 403);
  // תקרה מלאה – אף אחד לא יכול להזמין
  await call('PUT', '/api/limits', { maxUsers: count }, owner);
  let r = await call('POST', '/api/users', { name: 'עוד אחד', password: 'abc123' }, noa);
  assert.equal(r.status, 400);
  assert.match(r.json.error, /המקסימלי/);
  assert.equal((await call('POST', '/api/users', { name: 'עוד אחד', password: 'abc123' }, owner)).status, 400);
  // רק המנהל מזמין
  await call('PUT', '/api/limits', { maxUsers: count + 5, membersCanInvite: false }, owner);
  assert.equal((await call('POST', '/api/users', { name: 'עוד אחד', password: 'abc123' }, noa)).status, 403);
  assert.equal((await call('POST', '/api/users', { name: 'עוד אחד', password: 'abc123' }, owner)).status, 200);
  s = (await call('GET', '/api/state', null, noa)).json;
  assert.deepEqual([s.limits.membersCanInvite, s.limits.count], [false, count + 1]);
});

test('invite link: the invited person signs up by themselves', async () => {
  const owner = (await call('POST', '/api/login', { name: 'דיקלה', password: 'initial123' })).json.token;
  const { token } = (await call('POST', '/api/invites', { join: true }, owner)).json;
  const sep = (await call('POST', '/api/invites', { join: false }, owner)).json.token;
  // בלי כניסה: רואים מי הזמין
  assert.deepEqual((await call('GET', `/api/invite/${token}`)).json.by, 'דיקלה');
  assert.equal((await call('GET', '/api/invite/nope')).status, 404);
  // בלי שליחת מייל בשרת – צריך גם סיסמה
  assert.equal((await call('POST', `/api/invite/${token}/join`, { name: 'רותם', email: 'rotem@example.com' })).status, 400);
  const r = await call('POST', `/api/invite/${token}/join`, { name: 'רותם', email: 'rotem@example.com', password: 'rotem123' });
  assert.equal(r.status, 200);
  const me = (await call('GET', '/api/state', null, r.json.token)).json;
  const ownerState = (await call('GET', '/api/state', null, owner)).json;
  assert.equal(me.me.household, ownerState.me.household); // הצטרפה למשק הבית
  assert.equal(ownerState.users.find((u) => u.name === 'רותם').invitedByMe, true);
  // קישור למשתמש נפרד – משק בית חדש
  const r2 = await call('POST', `/api/invite/${sep}/join`, { name: 'Friend2', email: 'f2@example.com', password: 'friend123' });
  const f = (await call('GET', '/api/state', null, r2.json.token)).json;
  assert.notEqual(f.me.household, ownerState.me.household);
  // ביטול קישור
  await call('DELETE', `/api/invites/${token}`, null, owner);
  assert.equal((await call('GET', `/api/invite/${token}`)).status, 404);
});

test('departments: manual department and department order are shared by the household', async () => {
  const token = (await call('POST', '/api/login', { name: 'דיקלה', password: 'initial123' })).json.token;
  let r = (await call('PUT', '/api/home/dept', { text: 'Hummus', dept: 'dry' }, token)).json;
  assert.equal(r.deptOf.hummus, 'dry');
  r = (await call('PUT', '/api/home/dept', { text: 'hummus', dept: '' }, token)).json;
  assert.equal(r.deptOf.hummus, undefined);
  r = (await call('PUT', '/api/home/dept-order', { order: ['bread', 'produce', 'nope'] }, token)).json;
  assert.deepEqual(r.deptOrder.slice(0, 3), ['bread', 'produce', 'dairy']);
  assert.equal(r.deptOrder.length, 16);
  r = (await call('PUT', '/api/home/dept-order', { order: null }, token)).json;
  assert.equal(r.deptOrder, null);
});

test('departments: a household can add and remove its own departments', async () => {
  const token = (await call('POST', '/api/login', { name: 'דיקלה', password: 'initial123' })).json.token;
  let r = (await call('POST', '/api/home/depts', { name: 'לשבת', icon: '🕯️' }, token)).json;
  const d = r.customDepts.find((x) => x.name === 'לשבת');
  assert.equal(d.icon, '🕯️');
  r = (await call('PUT', '/api/home/dept', { text: 'נרות', dept: d.id }, token)).json;
  assert.equal(r.deptOf['נרות'], d.id);
  assert.equal((await call('POST', '/api/home/depts', { name: '  ' }, token)).status, 400);
  r = (await call('POST', '/api/home/depts', { remove: d.id }, token)).json;
  assert.equal(r.customDepts.some((x) => x.id === d.id), false);
  assert.equal(r.deptOf['נרות'], undefined); // הפריט חזר לשיוך האוטומטי
});
