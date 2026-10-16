// התראות Web Push (עובד באנדרואיד, במחשב, ובאייפון כשהאפליקציה מותקנת למסך הבית – iOS 16.4 ומעלה)
const fs = require('fs');
const path = require('path');
const webpush = require('web-push');
const db = require('./db');

const KEYS = path.join(path.dirname(db.FILE), 'vapid.json');

function keys() {
  let k;
  try { k = JSON.parse(fs.readFileSync(KEYS, 'utf8')); } catch {
    k = webpush.generateVAPIDKeys();
    fs.mkdirSync(path.dirname(KEYS), { recursive: true });
    fs.writeFileSync(KEYS, JSON.stringify(k));
  }
  return k;
}

const k = keys();
webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:admin@example.com', k.publicKey, k.privateKey);

const fmtDate = (s) => (s ? new Date(s).toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' }) : '');
const money = (n, cur) => {
  try { return new Intl.NumberFormat('he-IL', { style: 'currency', currency: cur || 'ILS' }).format(n); } catch { return `${n} ${cur || ''}`.trim(); }
};
const fmtPrice = (x) => (x.promoPrice == null ? x.description || 'מבצע' : `${x.minQty > 1 ? `${x.minQty} ב-` : ''}${money(x.promoPrice, x.currency)}`);

function message(deals) {
  if (deals.length === 1) {
    const x = deals[0];
    return {
      title: `מבצע על ${x.listItem} – ${x.chain}`,
      body: `${x.product}: ${fmtPrice(x)}${x.end ? ` · עד ${fmtDate(x.end)}` : ''}\n${x.store}${x.km != null ? ` (${x.km} ק"מ)` : ''}`,
    };
  }
  const lines = deals.slice(0, 4).map((x) => `${x.listItem}: ${fmtPrice(x)} ב${x.chain}${x.end ? ` עד ${fmtDate(x.end)}` : ''}`);
  if (deals.length > 4) lines.push(`ועוד ${deals.length - 4}…`);
  return { title: `${deals.length} מבצעים חדשים מהרשימה שלך`, body: lines.join('\n') };
}

// שולח לכל המכשירים של משתמש אחד
async function send(d, payload) {
  const alive = [];
  for (const sub of d.subscriptions) {
    try {
      await webpush.sendNotification(sub, JSON.stringify(payload));
      alive.push(sub);
    } catch (e) {
      if (![404, 410].includes(e.statusCode)) alive.push(sub); // מנוי שפג – מוסר
    }
  }
  d.subscriptions = alive;
  db.save();
}

module.exports = {
  money,
  publicKey: k.publicKey,
  message,
  notifyDeals: (d, deals) => send(d, { ...message(deals), url: '/' }),
  send,
};
