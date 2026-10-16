const test = require('node:test');
const assert = require('node:assert');
const os = require('os');
const fs = require('fs');
const path = require('path');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'mv-metrics-'));
process.env.APP_TOKEN = 'initial123';

const app = require('../server/index.js');
const db = require('../server/db');
let base;
const server = app.listen(0);
test.before(() => { base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => server.close());

async function call(method, url, body, token) {
  const res = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', 'x-app-token': token || '' }, body: body && JSON.stringify(body) });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, json, type: res.headers.get('content-type') };
}

test('terms, privacy-preserving metrics and account deletion', async () => {
  const owner = (await call('POST', '/api/login', { name: 'מנהלת', password: 'initial123' })).json.token;
  let s = (await call('GET', '/api/state', null, owner)).json;
  assert.equal(s.needTerms, true);
  s = (await call('POST', '/api/terms/accept', null, owner)).json;
  assert.equal(s.needTerms, false);

  await call('POST', '/api/users', { name: 'בת', password: 'bat1234' }, owner);
  const bat = (await call('POST', '/api/login', { name: 'בת', password: 'bat1234' })).json.token;
  await call('GET', '/api/state', null, bat);
  await call('GET', '/api/state', null, bat); // אותו משתמש פעמיים נספר פעם אחת

  assert.equal((await call('POST', '/api/metrics/event', { type: 'deal_click', chain: 'שופרסל' }, bat)).status, 200);
  assert.equal((await call('POST', '/api/metrics/event', { type: 'whatever' }, bat)).status, 400);
  assert.equal((await call('POST', '/api/metrics/event', { type: 'deal_click' })).status, 401);

  assert.equal((await call('GET', '/api/metrics', null, bat)).status, 403);
  const m = (await call('GET', '/api/metrics', null, owner)).json;
  assert.equal(m.registered, 2);
  assert.equal(m.active.today, 2);
  assert.equal(m.series.length, 30);
  assert.equal(m.totals.deal_click, 1);
  assert.equal(m.totals.signup, 2);
  assert.deepEqual(m.chains.map((c) => [c.name, c.clicks]), [['שופרסל', 1]]);

  // בנתונים השמורים אין שמות משתמשים
  const raw = JSON.stringify(db.get().metrics);
  assert.ok(!raw.includes('בת') && !raw.includes('מנהלת'));

  const csv = await call('GET', '/api/metrics.csv', null, owner);
  assert.match(csv.type, /text\/csv/);
  assert.match(csv.json, /date,active_users/);

  // מחיקת חשבון: המנהל לא, משתמש רגיל כן
  assert.equal((await call('DELETE', '/api/me', null, owner)).status, 400);
  assert.equal((await call('DELETE', '/api/me', null, bat)).status, 200);
  assert.equal((await call('GET', '/api/state', null, bat)).status, 401);
  assert.equal((await call('POST', '/api/login', { name: 'בת', password: 'bat1234' })).status, 401);
  s = (await call('GET', '/api/state', null, owner)).json;
  assert.deepEqual(s.users.map((u) => u.name), ['מנהלת']);
});
