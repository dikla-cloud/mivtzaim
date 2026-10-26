// בדיקות למנהל: חיבור לרשתות, סניפים של רשת, וחיפוש מוצר בקובץ המחירים של סניף.
// אותו קוד רץ גם מהמסוף (check-chains.js, list-stores.js, find-product.js) וגם ממסך הבדיקות באפליקציה.
// כל בדיקה כותבת שורות דרך log(line). הבדיקות רק קוראות – לא משנות כלום.
const fs = require('fs');
const path = require('path');
const israel = require('./providers/israel');
const geo = require('./geo');
const xml = require('./xml');

const MAX_LINES = 15;

// כל הרשתות (או רשת אחת): קובץ סניפים, וקובצי המחירים והמבצעים של הסניף הראשון
async function checkChains(log, only) {
  for (const chain of israel.chains.filter((c) => !only || c.id === only)) {
    try {
      const stores = await chain.stores();
      const s = stores[0];
      if (!s) throw new Error('קובץ הסניפים ריק');
      if (chain.web) {
        const items = await chain.deals();
        log(`✔ ${chain.name} (${chain.id}): ${stores.length} סניפים (למשל "${s.name}", ${s.city}) · ${items.length} מוצרים במבצע באתר${items[0] ? `, למשל: ${items[0].name} ${items[0].promoPrice} ₪ במקום ${items[0].regularPrice} ₪` : ''}`);
        continue;
      }
      const files = await chain.storeFiles(s.storeId);
      const n = xml.parsePrices(files.prices).size;
      log(`✔ ${chain.name} (${chain.id}): ${stores.length} סניפים · קבצים של "${s.name}" (${s.city}) ירדו: מבצעים ${files.promos.length} בתים, מחירים ${files.prices.length} בתים (${n} מוצרים)`);
    } catch (e) {
      log(`✘ ${chain.name} (${chain.id}): ${e.message}`);
    }
  }
}

// כל הסניפים של רשת, כמו שהם בקובץ שלה, ואיך השרת מאתר כל אחד. filter – רק סניפים שהשם/הכתובת מכילים אותו
async function listStores(log, id, filter) {
  const chain = israel.chains.find((c) => c.id === id);
  if (!chain) return log(`רשתות: ${israel.chains.map((c) => c.id).join(', ')}`);
  const stores = await chain.stores();
  const list = stores.filter((s) => !filter || `${s.name} ${s.address} ${s.city}`.includes(filter));
  log(`${chain.name}: ${stores.length} סניפים${filter ? `, מתאימים ל-"${filter}": ${list.length}` : ''}`);
  for (const s of list) {
    const city = await geo.storeCity(s);
    const online = geo.isOnline(s);
    // איתור על המפה לוקח שנייה לכתובת – רק כשמסננים (רשימה קצרה)
    const pos = !online && filter ? await geo.storePosition(s) : null;
    log(`  [${s.storeId}] ${s.name} | עיר: "${s.city}"${city && city !== s.city ? ` ← ${city}` : ''} | כתובת: "${s.address}"${online ? ' | 🛒 אונליין' : ''}${pos ? ` | מיקום: ${pos.lat.toFixed(4)},${pos.lon.toFixed(4)} (${pos.how})` : filter && !online ? ' | לא אותר על המפה' : ''}`);
  }
}

// הסניפים שנבחרו אצל כל המשתמשים („סניפים לבדיקה והשוואה” וההשוואה האחרונה)
function chosenStores() {
  const file = path.join(process.env.DATA_DIR || '/var/lib/mivtzaim', 'db.json');
  const out = [];
  const seen = new Set();
  try {
    const db = JSON.parse(fs.readFileSync(file, 'utf8'));
    for (const u of Object.values(db.users || {})) {
      for (const s of [...(u.myStores || []), ...(u.compareStores || [])]) {
        const k = `${s.chain}|${s.storeId}`;
        if (!seen.has(k)) { seen.add(k); out.push(s); }
      }
    }
  } catch { /* אין קובץ נתונים */ }
  return out;
}

// חיפוש מילים בקובצי המחירים: איך כל רשת קוראת למוצר (או אם הוא חסר). חלק ממילה: „פטרוזיל” מוצא גם „פטרוזיליה”
async function findProduct(log, wordsArg, chainArg, storeArg) {
  const words = String(wordsArg || '').split(',').map((w) => w.trim()).filter(Boolean);
  if (!words.length) return log('כתבו מילה לחיפוש');
  const chains = israel.chains.filter((c) => typeof c.storeFiles === 'function');
  let stores = storeArg ? [{ chain: chainArg, storeId: storeArg, name: '' }] : chosenStores();
  if (!storeArg && chainArg) stores = stores.filter((s) => s.chain === chainArg);
  // רשת בלי סניף שנבחר – הסניף הראשון שלה
  if (chainArg && !stores.length) {
    const c = chains.find((x) => x.id === chainArg);
    if (!c) return log(`רשתות: ${chains.map((x) => x.id).join(', ')}`);
    const first = (await c.stores())[0];
    stores = [{ chain: c.id, storeId: first.storeId, name: first.name }];
  }
  if (!stores.length) return log('לא נבחרו סניפים. אפשר לבחור רשת.');
  for (const s of stores.slice(0, 12)) {
    const chain = chains.find((c) => c.id === s.chain);
    if (!chain) continue;
    log(`=== ${chain.name} · ${s.name || ''} [${s.storeId}]`);
    let prices;
    let raw;
    try {
      raw = (await chain.storeFiles(String(s.storeId))).prices;
      prices = xml.parsePrices(raw);
    } catch (e) {
      log(`  ✘ ${e.message}`);
      continue;
    }
    log(`  בקובץ המחירים: ${prices.size} מוצרים`);
    // קובץ שלא נקרא ממנו אף מוצר – מציגים את תחילתו, כדי לראות את המבנה שלו
    if (!prices.size) {
      const text = xml.decode(raw);
      const bytes = [...raw.subarray(0, 16)].map((b) => b.toString(16).padStart(2, '0')).join(' ');
      // רק תווים קריאים, כדי שאפשר יהיה להעתיק
      const readable = text.slice(0, 1500).replace(/[^\x20-\x7E֐-׿\n]/g, '?');
      log(`  גודל הקובץ: ${raw.length} בתים. הבתים הראשונים: ${bytes}\n  תחילת הקובץ:\n${readable}`);
      continue;
    }
    for (const w of words) {
      const hits = [...prices].filter(([, it]) => (it.name || '').includes(w)).sort((a, b) => a[1].price - b[1].price);
      log(`  „${w}”: ${hits.length ? `${hits.length} מוצרים` : '✘ לא נמצא'}`);
      for (const [code, it] of hits.slice(0, MAX_LINES)) {
        const unit = [it.qty && it.qty !== '0' && it.qty !== '0.00' ? it.qty : '', it.unit].filter(Boolean).join(' ');
        log(`     ${it.price} ₪ · ${it.name}${unit ? ` · ${unit}` : ''}${it.weighted ? ' · ⚖️ במשקל' : ''} · ברקוד ${code}`);
      }
      if (hits.length > MAX_LINES) log(`     … ועוד ${hits.length - MAX_LINES}`);
    }
  }
}

// הרצה מהמסוף: node server/<script>.js …
const cli = (fn) => fn((line) => console.log(line), ...process.argv.slice(2)).catch((e) => console.log('שגיאה:', e.message));

module.exports = { checkChains, listStores, findProduct, cli };
