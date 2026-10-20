const test = require('node:test');
const assert = require('node:assert');
const os = require('os');
const fs = require('fs');
const path = require('path');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'mv-email-'));
process.env.APP_TOKEN = 'initial123';

const mail = require('../server/mail');
const sent = [];
mail._setOverride(async (m) => { sent.push(m); });
const app = require('../server/index.js');
let base;
const server = app.listen(0);
test.before(() => { base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => server.close());

async function call(method, url, body, token) {
  const res = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', 'x-app-token': token || '' }, body: body && JSON.stringify(body) });
  return { status: res.status, json: await res.json() };
}
const lastCode = () => sent[sent.length - 1].text.match(/\b(\d{6})\b/)[1];

test('email sign-in: no passwords, one-time code', async () => {
  assert.equal((await call('GET', '/api/setup')).json.emailLogin, true);
  // כניסה ראשונה: סיסמת ההתקנה + המייל של המנהלת
  const admin = (await call('POST', '/api/login', { name: 'מנהלת', password: 'initial123', email: 'boss@example.com' })).json.token;
  let s = (await call('GET', '/api/state', null, admin)).json;
  assert.equal(s.me.email, 'boss@example.com');
  assert.equal(s.emailLogin, true);

  // הוספת משתמשת: רק שם ומייל
  assert.equal((await call('POST', '/api/users', { name: 'נועה' }, admin)).status, 400);
  assert.equal((await call('POST', '/api/users', { name: 'נועה', email: 'BOSS@example.com' }, admin)).status, 400); // תפוס
  s = (await call('POST', '/api/users', { name: 'נועה', email: 'noa@example.com' }, admin)).json;
  assert.equal(s.users.find((u) => u.name === 'נועה').email, 'noa@example.com');

  assert.equal((await call('POST', '/api/login/code', { email: 'nobody@example.com' })).status, 400);
  const r = await call('POST', '/api/login/code', { email: 'Noa@Example.com' });
  assert.equal(r.json.to, 'n***@example.com');
  assert.equal(sent[0].to, 'noa@example.com');
  assert.equal((await call('POST', '/api/login/code', { email: 'noa@example.com' })).status, 429);
  assert.equal((await call('POST', '/api/login/verify', { email: 'noa@example.com', code: '000000' })).status, 400);
  const code = lastCode();
  const ok = await call('POST', '/api/login/verify', { email: 'noa@example.com', code });
  assert.ok(ok.json.token);
  assert.equal((await call('GET', '/api/state', null, ok.json.token)).json.me.name, 'נועה');
  assert.equal((await call('POST', '/api/login/verify', { email: 'noa@example.com', code })).status, 400); // חד-פעמי

  // לא אפשר להישאר בלי מייל; המנהלת יכולה לעדכן מייל של אחרים
  assert.equal((await call('PUT', '/api/me/email', { email: '' }, ok.json.token)).status, 400);
  assert.equal((await call('PUT', `/api/users/${encodeURIComponent('נועה')}/email`, { email: 'noa2@example.com' }, admin)).status, 200);
  assert.equal((await call('PUT', `/api/users/${encodeURIComponent('נועה')}/email`, { email: 'x@y.com' }, ok.json.token)).status, 403);
});
