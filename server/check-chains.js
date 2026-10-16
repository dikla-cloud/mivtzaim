// בדיקת חיבור לרשתות בישראל, מהשרת:
//   cd /opt/mivtzaim && node server/check-chains.js            (כל הרשתות)
//   cd /opt/mivtzaim && node server/check-chains.js carrefour  (רשת אחת)
const israel = require('./providers/israel');

(async () => {
  const only = process.argv[2];
  for (const chain of israel.chains.filter((c) => !only || c.id === only)) {
    process.stdout.write(`${chain.name} (${chain.id}): `);
    try {
      const stores = await chain.stores();
      const s = stores[0];
      if (!s) throw new Error('קובץ הסניפים ריק');
      if (chain.web) {
        process.stdout.write(`${stores.length} סניפים · קוראת מבצעים מהאתר… `);
        const items = await chain.deals({ onProgress: (n, total, found) => process.stdout.write(`\r${chain.name}: ${stores.length} סניפים · קטגוריות ${n}/${total}, ${found} מוצרים במבצע   `) });
        process.stdout.write('\n');
        console.log(`✔ ${stores.length} סניפים (למשל "${s.name}", ${s.city}) · ${items.length} מוצרים במבצע באתר${items[0] ? `, למשל: ${items[0].name} ${items[0].promoPrice} ₪ במקום ${items[0].regularPrice} ₪` : ''}`);
        continue;
      }
      const files = await chain.storeFiles(s.storeId);
      console.log(`✔ ${stores.length} סניפים · קבצים של "${s.name}" (${s.city}) ירדו: מבצעים ${files.promos.length} בתים, מחירים ${files.prices.length} בתים`);
    } catch (e) {
      console.log(`✘ ${e.message}`);
    }
  }
})();
