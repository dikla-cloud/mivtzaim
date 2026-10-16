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
