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
    // כמות כבר בהוספה
    let h = (await call('POST', '/api/home', { items: [{ text: 'קפה', qty: 3 }, { text: 'עגבניות', kg: 1.5 }, { text: 'במבה', qty: 0 }] }, t)).home;
    assert.deepEqual(['קפה', 'עגבניות', 'במבה'].map((n) => { const x = h.find((i) => i.text === n); return [x.qty ?? null, x.kg ?? null]; }), [[3, null], [null, 1.5], [null, null]]);
    for (const x of h.filter((i) => ['קפה', 'עגבניות', 'במבה'].includes(i.text))) await call('DELETE', `/api/home/${x.id}`, null, t);
    h = (await call('POST', '/api/home', { items: ['א1', 'ב2', 'ג3'] }, t)).home;
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

test('receipts: saved per household, cleaned, edited and deleted; the tesseract files are served', async () => {
  const app = require('../server/index.js');
  const auth = require('../server/auth');
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = (method, url, body, token) => fetch(base + url, { method, headers: { 'Content-Type': 'application/json', 'x-app-token': token }, body: body && JSON.stringify(body) }).then((r) => r.json());
  try {
    const t = auth.newSession(db.get().users['דיקלה']);
    assert.ok((await call('POST', '/api/receipts', { date: '2026-11-10', total: 0, items: [] }, t)).error); // בלי סכום ובלי מוצרים
    let r = (await call('POST', '/api/receipts', { date: '2026-11-10', store: 'שופרסל', total: 245.3, discount: 12.5, voucher: 50, items: [{ name: 'חלב 3%', price: 6.9 }, { name: '', price: 3 }], evil: '<x>' }, t)).receipts;
    assert.equal(r.length, 1);
    assert.deepEqual([r[0].store, r[0].total, r[0].discount, r[0].voucher, r[0].items.length, r[0].by, r[0].evil], ['שופרסל', 245.3, 12.5, 50, 1, 'דיקלה', undefined]);
    r = (await call('PUT', `/api/receipts/${r[0].id}`, { voucher: 0, date: 'bad' }, t)).receipts;
    assert.deepEqual([r[0].voucher, r[0].date, r[0].total], [0, '2026-11-10', 245.3]);
    // הנחה על השובר באחוזים, וברקוד למוצר
    r = (await call('PUT', `/api/receipts/${r[0].id}`, { voucher: 100, voucherPct: '12.5', items: [{ name: 'חלב', price: 6.9, code: '7290004131074' }, { name: 'לחם', price: 9, code: 'abc' }] }, t)).receipts;
    assert.deepEqual([r[0].voucherPct, r[0].items[0].code, r[0].items[1].code], [12.5, '7290004131074', undefined]);
    r = (await call('PUT', `/api/receipts/${r[0].id}`, { voucherPct: '' }, t)).receipts;
    assert.equal(r[0].voucherPct, null);
    assert.deepEqual((await call('POST', '/api/receipts/names', { codes: ['x'] }, t)).names, {});
    // משק בית אחר לא רואה
    const other = auth.newSession(db.get().users['רותי']);
    const mine = db.get().users['רותי'].household === db.get().users['דיקלה'].household;
    if (!mine) assert.equal((await call('GET', '/api/receipts', null, other)).receipts.length, 0);
    r = (await call('DELETE', `/api/receipts/${r[0].id}`, null, t)).receipts;
    assert.equal(r.length, 0);
    for (const f of ['/vendor/tesseract/tesseract.min.js', '/vendor/tesseract/worker.min.js', '/vendor/tesseract/core/tesseract-core-simd-lstm.wasm.js', '/vendor/tesseract/lang/heb.traineddata.gz']) {
      assert.equal((await fetch(base + f)).status, 200, f);
    }
    assert.equal((await fetch(`${base}/vendor/tesseract/lang/xxx.traineddata.gz`)).status, 404);
  } finally {
    server.close();
  }
});
