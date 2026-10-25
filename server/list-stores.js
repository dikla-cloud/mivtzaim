// כל הסניפים של רשת, כמו שהם בקובץ שלה, ואיך השרת מאתר כל אחד. רק קורא – לא משנה כלום.
//   cd /opt/mivtzaim && node server/list-stores.js tivtaam
//   cd /opt/mivtzaim && node server/list-stores.js nizat "טופ"      (רק סניפים שהשם/הכתובת מכילים את המילה)
const israel = require('./providers/israel');
const geo = require('./geo');

(async () => {
  const [id, filter] = process.argv.slice(2);
  const chain = israel.chains.find((c) => c.id === id);
  if (!chain) return console.log(`רשתות: ${israel.chains.map((c) => c.id).join(', ')}`);
  const stores = await chain.stores();
  const list = stores.filter((s) => !filter || `${s.name} ${s.address} ${s.city}`.includes(filter));
  console.log(`${chain.name}: ${stores.length} סניפים${filter ? `, מתאימים ל-"${filter}": ${list.length}` : ''}`);
  for (const s of list) {
    const city = await geo.storeCity(s);
    const pos = !geo.isOnline(s) && filter ? await geo.storePosition(s) : null;
    console.log(`  [${s.storeId}] ${s.name} | עיר: "${s.city}"${city && city !== s.city ? ` ← ${city}` : ''} | כתובת: "${s.address}"${geo.isOnline(s) ? ' | 🛒 אונליין' : ''}${pos ? ` | מיקום: ${pos.lat.toFixed(4)},${pos.lon.toFixed(4)} (${pos.how})` : filter && !geo.isOnline(s) ? ' | לא אותר על המפה' : ''}`);
  }
})().catch((e) => console.log('שגיאה:', e.message));
