const test = require('node:test');
const assert = require('node:assert');
const os = require('os');
const fs = require('fs');
const path = require('path');

// קובץ מהגרסה שצירפה את כולם למשק הבית של המנהל
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mv-hh-'));
fs.writeFileSync(path.join(dir, 'db.json'), JSON.stringify({
  users: {
    'דיקלה': { name: 'דיקלה', admin: true, household: 'h1', list: [{ id: '1', text: 'במבה' }] },
    'יואב': { name: 'יואב', admin: false, household: 'h1', list: [] },
    'רותי': { name: 'רותי', admin: false, household: 'h1', list: [] },
  },
  households: { h1: { id: 'h1', home: [{ id: 'a', text: 'חלב', done: false }] } },
  sessions: {}, storesCache: {}, translations: {},
}));
process.env.DATA_DIR = dir;
const db = require('../server/db');

test('existing family members are split into their own households; home list stays with admin', () => {
  const u = db.get().users;
  assert.equal(u['דיקלה'].household, 'h1');
  assert.notEqual(u['יואב'].household, 'h1');
  assert.notEqual(u['רותי'].household, 'h1');
  assert.notEqual(u['יואב'].household, u['רותי'].household);
  assert.deepEqual(db.householdOf(u['דיקלה']).home.map((x) => x.text), ['חלב']);
  assert.equal(db.householdOf(u['יואב']).home.length, 0);
  assert.equal(u['דיקלה'].list[0].text, 'במבה'); // הרשימה לחיפוש מבצעים לא נפגעה
  assert.ok(Object.values(u).every((x) => x.followLocation === false)); // מיקום בלחיצה כברירת מחדל
  // התיקון רץ פעם אחת בלבד: מי שצורף אחר כך נשאר מצורף
  u['יואב'].household = 'h1';
  db.save(); db.reset();
  assert.equal(db.get().users['יואב'].household, 'h1');
});

test('undo: deleted and cleared items come back in place', async () => {
  const app = require('../server/index.js');
  const auth = require('../server/auth');
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = (method, url, body, token) => fetch(base + url, { method, headers: { 'Content-Type': 'application/json', 'x-app-token': token }, body: body && JSON.stringify(body) }).then((r) => r.json());
  try {
    const t = auth.newSession(db.get().users['דיקלה']);
    let h = (await call('POST', '/api/home', { items: ['א1', 'ב2', 'ג3'] }, t)).home;
    const start = h.map((x) => x.text);
    const idx = h.findIndex((x) => x.text === 'ב2');
    const item = h[idx];
    await call('DELETE', `/api/home/${item.id}`, null, t);
    h = (await call('POST', '/api/home/restore', { items: [{ item, index: idx }] }, t)).home;
    assert.deepEqual(h.map((x) => x.text), start);
    assert.equal(h[idx].id, item.id);
    // ביטול כפול לא יוצר כפילות
    h = (await call('POST', '/api/home/restore', { items: [{ item, index: idx }] }, t)).home;
    assert.equal(h.filter((x) => x.text === 'ב2').length, 1);
    // ניקוי פריטים שנקנו + ביטול
    await call('PATCH', `/api/home/${h[idx].id}`, { done: true }, t);
    h = (await call('GET', '/api/home', null, t)).home;
    const done = h.map((x, index) => ({ item: x, index })).filter((e) => e.item.done);
    await call('POST', '/api/home/clear-done', null, t);
    h = (await call('POST', '/api/home/restore', { items: done }, t)).home;
    assert.deepEqual(h.map((x) => [x.text, x.done]).filter(([x]) => ['א1', 'ב2', 'ג3'].includes(x)), [['א1', false], ['ב2', true], ['ג3', false]]);
  } finally {
    server.close();
  }
});

test('adding an item that is already on the list reports it instead of duplicating', async () => {
  const app = require('../server/index.js');
  const auth = require('../server/auth');
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (token, items) => fetch(base + '/api/home', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-app-token': token }, body: JSON.stringify({ items }) }).then((r) => r.json());
  try {
    const d = db.get();
    d.users['יואב'].household = d.users['דיקלה'].household; // אותו משק בית
    const dikla = auth.newSession(d.users['דיקלה']);
    const yoav = auth.newSession(d.users['יואב']);
    await post(yoav, ["קוטג' 5%", 'לחם']);
    const r = await post(dikla, ['קוטג 5%', 'הלחם', 'עגבניות']);
    assert.deepEqual(r.duplicates.map((x) => [x.text, x.by]), [["קוטג' 5%", 'יואב'], ['לחם', 'יואב']]);
    assert.equal(r.home.filter((x) => /לחם/.test(x.text)).length, 1);
    assert.ok(r.home.some((x) => x.text === 'עגבניות'));
  } finally {
    server.close();
  }
});
