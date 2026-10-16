// התראות Web Push (עובד באנדרואיד, במחשב, ובאייפון כשהאפליקציה מותקנת למסך הבית – iOS 16.4 ומעלה)
const fs = require('fs');
const path = require('path');
const webpush = require('web-push');
const db = require('./db');
const { tr, LOCALE, pick, dir } = require('./i18n');

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

function message(deals, lang) {
  const L = pick(lang);
  const t = (he, v) => tr(L, he, v);
  const fmtDate = (s) => (s ? new Date(s).toLocaleDateString(LOCALE[L], { day: 'numeric', month: 'numeric' }) : '');
  const money = (n, cur) => {
    try { return new Intl.NumberFormat(LOCALE[L], { style: 'currency', currency: cur || 'ILS' }).format(n); } catch { return `${n} ${cur || ''}`.trim(); }
  };
  const fmtPrice = (x) => (x.promoPrice == null ? x.description || t('מבצע') : `${x.minQty > 1 ? t('{n} ב-', { n: x.minQty }) : ''}${money(x.promoPrice, x.currency)}`);
  if (deals.length === 1) {
    const x = deals[0];
    return {
      title: t('מבצע על {item} – {chain}', { item: x.listItem, chain: x.chain }),
      body: `${x.product}: ${fmtPrice(x)}${x.end ? t(' · עד {date}', { date: fmtDate(x.end) }) : ''}\n${x.store}${x.km != null ? t(' ({km} ק"מ)', { km: x.km }) : ''}`,
    };
  }
  const lines = deals.slice(0, 4).map((x) => `${t('{item}: {price} ב{chain}', { item: x.listItem, price: fmtPrice(x), chain: x.chain })}${x.end ? t(' עד {date}', { date: fmtDate(x.end) }) : ''}`);
  if (deals.length > 4) lines.push(t('ועוד {n}…', { n: deals.length - 4 }));
  return { title: t('{n} מבצעים חדשים מהרשימה שלך', { n: deals.length }), body: lines.join('\n') };
}

async function send(d, payload) {
  const alive = [];
  for (const sub of d.subscriptions) {
    try {
      await webpush.sendNotification(sub, JSON.stringify({ lang: pick(d.lang), dir: dir(d.lang), ...payload }));
      alive.push(sub);
    } catch (e) {
      if (![404, 410].includes(e.statusCode)) alive.push(sub); // מנוי שפג – מוסר
    }
  }
  d.subscriptions = alive;
  db.save();
}

module.exports = {
  publicKey: k.publicKey,
  message,
  notifyDeals: (d, deals) => send(d, { ...message(deals, d.lang), url: '/' }),
  send,
};
