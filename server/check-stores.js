// בדיקה: אילו סניפים נמצאים ברדיוס ממקום מסוים, ואיך נקבע המיקום של כל אחד.
//   cd /opt/mivtzaim && node server/check-stores.js shufersal "רמת השרון"
//   cd /opt/mivtzaim && node server/check-stores.js nizat "מודיעין" 15
const israel = require('./providers/israel');
const geo = require('./geo');

(async () => {
  const [id, place, radius = '10'] = process.argv.slice(2);
  const chain = israel.chains.find((c) => c.id === id);
  if (!chain || !place) {
    console.log(`שימוש: node server/check-stores.js <רשת> "<עיר או lat,lon>" [רדיוס]\nרשתות: ${israel.chains.map((c) => c.id).join(', ')}`);
    return;
  }
  const ll = place.match(/^\s*(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)\s*$/);
  const center = ll ? { lat: Number(ll[1]), lon: Number(ll[2]) } : await geo.geocode(`${place}, ישראל`);
  if (!center) return console.log('המקום לא זוהה');
  console.log(`מרכז: ${center.label || place} (${center.lat.toFixed(4)}, ${center.lon.toFixed(4)}) · רדיוס ${radius} ק"מ`);
  const stores = await chain.stores();
  console.log(`${stores.length} סניפים ברשת. מאתרת על המפה (בקשה אחת בשנייה, בפעם הראשונה זה לוקח כמה דקות)…`);
  const sample = [];
  for (const s of stores.slice(0, 4)) sample.push(`${s.name} | עיר בקובץ: "${s.city}" ← "${await geo.cityName(s.city)}" | כתובת: "${s.address}"`);
  console.log('דוגמאות:\n  ' + sample.join('\n  '));
  const near = await geo.storesWithin(stores, center, Number(radius));
  const how = { file: 'מהקובץ', address: 'לפי כתובת', city: 'לפי מרכז העיר' };
  console.log(`${chain.name}: ${near.length} סניפים ברדיוס (מתוך ${stores.length})`);
  for (const s of near) console.log(`  ${s.km} ק"מ · ${s.name} · עיר: "${s.city}" · כתובת: "${s.address}" · ${how[s.geo] || s.geo}`);
})().catch((e) => console.log('שגיאה:', e.message));
