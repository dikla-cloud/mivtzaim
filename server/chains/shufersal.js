// שופרסל – פורטל prices.shufersal.co.il
// catID: 2 = PriceFull, 4 = PromoFull, 5 = Stores
const { Session } = require('../http');
const xml = require('../xml');

const BASE = 'https://prices.shufersal.co.il/FileObject/UpdateCategory';

async function latestLink(s, catID, storeId = 0) {
  const html = await s.text(`${BASE}?catID=${catID}&storeId=${storeId}&page=1`);
  const links = [...html.matchAll(/href="(https?:\/\/[^"]+?\.(?:gz|xml)[^"]*)"/gi)]
    .map((m) => m[1].replace(/&amp;/g, '&'));
  if (!links.length) throw new Error(`שופרסל: לא נמצא קובץ (catID=${catID}, store=${storeId})`);
  // הקבצים בטבלה ממוינים מהחדש לישן; שם הקובץ מכיל חותמת זמן – נמיין ליתר ביטחון
  const stamp = (u) => (u.match(/-(\d{12})\./) || [])[1] || '';
  return links.sort((a, b) => stamp(b).localeCompare(stamp(a)))[0];
}

module.exports = {
  id: 'shufersal',
  name: 'שופרסל',
  async stores() {
    const s = new Session();
    return xml.parseStores(await s.buffer(await latestLink(s, 5)));
  },
  async storeFiles(storeId) {
    const s = new Session();
    const [promo, price] = await Promise.all([latestLink(s, 4, storeId), latestLink(s, 2, storeId)]);
    return { promos: await s.buffer(promo), prices: await s.buffer(price) };
  },
};
