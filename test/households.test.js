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
  // התיקון רץ פעם אחת בלבד: מי שצורף אחר כך נשאר מצורף
  u['יואב'].household = 'h1';
  db.save(); db.reset();
  assert.equal(db.get().users['יואב'].household, 'h1');
});

test('voice note: upload, play back for household only, removed on clear', async () => {
  process.env.APP_TOKEN = 'x';
  const app = require('../server/index.js');
  const auth = require('../server/auth');
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const d = db.get();
    const owner = auth.newSession(d.users['דיקלה']);
    const other = auth.newSession(d.users['רותי']); // משק בית אחר
    const audio = Buffer.from('fake-webm-audio');
    let r = await fetch(base + '/api/home/voice', { method: 'POST', headers: { 'Content-Type': 'audio/webm;codecs=opus', 'x-voice-seconds': '4', 'x-app-token': owner }, body: audio });
    const item = (await r.json()).home.find((x) => x.voice);
    assert.equal(item.voice.seconds, 4);
    r = await fetch(`${base}/api/home/${item.id}/voice`, { headers: { 'x-app-token': owner } });
    assert.equal(Buffer.from(await r.arrayBuffer()).toString(), 'fake-webm-audio');
    assert.equal((await fetch(`${base}/api/home/${item.id}/voice`, { headers: { 'x-app-token': other } })).status, 404);
    assert.equal((await fetch(base + '/api/home/voice', { method: 'POST', headers: { 'Content-Type': 'audio/x-evil', 'x-app-token': owner }, body: audio })).status, 400);
    const file = path.join(dir, 'voice', `${item.id}.webm`);
    assert.ok(fs.existsSync(file));
    await fetch(`${base}/api/home/${item.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'x-app-token': owner }, body: JSON.stringify({ done: true }) });
    await fetch(base + '/api/home/clear-done', { method: 'POST', headers: { 'x-app-token': owner } });
    await new Promise((res) => setTimeout(res, 100));
    assert.ok(!fs.existsSync(file));
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
