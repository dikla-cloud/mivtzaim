// חיפוש מילים בקובצי המחירים של הסניפים – כדי לראות איך כל רשת קוראת למוצר (או אם הוא חסר). רק קורא – לא משנה כלום.
//   cd /opt/mivtzaim && node server/find-product.js "פטרוזיל,כוסב,פסטרמ"
//       (בסניפים שנבחרו ב„הסניפים שלי” / בהשוואה האחרונה, של כל המשתמשים)
//   cd /opt/mivtzaim && node server/find-product.js "פטרוזיל" rami          (רק רשת אחת)
//   cd /opt/mivtzaim && node server/find-product.js "פטרוזיל" rami 123      (סניף מסוים)
// מחפש חלק ממילה: „פטרוזיל” מוצא גם „פטרוזיליה”. כמה מילים – מופרדות בפסיק.
const fs = require('fs');
const path = require('path');
const israel = require('./providers/israel');
const xml = require('./xml');

const MAX_LINES = 15;

(async () => {
  const [wordsArg, chainArg, storeArg] = process.argv.slice(2);
  if (!wordsArg) return console.log('שימוש: node server/find-product.js "פטרוזיל,כוסב" [רשת] [מספר סניף]');
  const words = wordsArg.split(',').map((w) => w.trim()).filter(Boolean);
  const chains = israel.chains.filter((c) => typeof c.storeFiles === 'function');
  let stores = [];
  if (storeArg) stores = [{ chain: chainArg, storeId: storeArg, name: '' }];
  else {
    const file = path.join(process.env.DATA_DIR || '/var/lib/mivtzaim', 'db.json');
    try {
      const db = JSON.parse(fs.readFileSync(file, 'utf8'));
      const seen = new Set();
      for (const u of Object.values(db.users || {})) {
        for (const s of [...(u.myStores || []), ...(u.compareStores || [])]) {
          const k = `${s.chain}|${s.storeId}`;
          if (!seen.has(k)) { seen.add(k); stores.push(s); }
        }
      }
    } catch (e) {
      console.log(`לא הצלחתי לקרוא את ${file}: ${e.message}`);
    }
    if (chainArg) stores = stores.filter((s) => s.chain === chainArg);
    // רשת בלי סניף שנבחר – הסניף הראשון שלה
    if (chainArg && !stores.length) {
      const c = chains.find((x) => x.id === chainArg);
      if (!c) return console.log(`רשתות: ${chains.map((x) => x.id).join(', ')}`);
      const first = (await c.stores())[0];
      stores = [{ chain: c.id, storeId: first.storeId, name: first.name }];
    }
  }
  if (!stores.length) return console.log('לא נבחרו סניפים. אפשר לציין רשת: node server/find-product.js "פטרוזיל" rami');
  for (const s of stores.slice(0, 12)) {
    const chain = chains.find((c) => c.id === s.chain);
    if (!chain) continue;
    console.log(`\n=== ${chain.name} · ${s.name || ''} [${s.storeId}]`);
    let prices;
    let raw;
    try {
      raw = (await chain.storeFiles(String(s.storeId))).prices;
      prices = xml.parsePrices(raw);
    } catch (e) {
      console.log(`  ✘ ${e.message}`);
      continue;
    }
    console.log(`  בקובץ המחירים: ${prices.size} מוצרים`);
    // קובץ שלא נקרא ממנו אף מוצר – מציגים את תחילתו, כדי לראות את המבנה שלו
    if (!prices.size) {
      const text = xml.decode(raw);
      const bytes = [...raw.subarray(0, 16)].map((b) => b.toString(16).padStart(2, '0')).join(' ');
      // רק תווים קריאים, כדי שאפשר יהיה להעתיק מהמסוף
      const readable = text.slice(0, 1500).replace(/[^\x20-\x7E\u0590-\u05FF\n]/g, '?');
      console.log(`  גודל הקובץ: ${raw.length} בתים. הבתים הראשונים: ${bytes}\n  תחילת הקובץ:\n${readable}`);
      continue;
    }
    for (const w of words) {
      const hits = [...prices].filter(([, it]) => (it.name || '').includes(w)).sort((a, b) => a[1].price - b[1].price);
      console.log(`  „${w}”: ${hits.length ? `${hits.length} מוצרים` : '✘ לא נמצא'}`);
      for (const [code, it] of hits.slice(0, MAX_LINES)) {
        const unit = [it.qty && it.qty !== '0' && it.qty !== '0.00' ? it.qty : '', it.unit].filter(Boolean).join(' ');
        console.log(`     ${it.price} ₪ · ${it.name}${unit ? ` · ${unit}` : ''}${it.weighted ? ' · ⚖️ במשקל' : ''} · ברקוד ${code}`);
      }
      if (hits.length > MAX_LINES) console.log(`     … ועוד ${hits.length - MAX_LINES}`);
    }
  }
})().catch((e) => console.log('שגיאה:', e.message));
