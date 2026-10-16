const $ = (s) => document.querySelector(s);
let S = null;
let token = localStorage.getItem('appToken') || '';

async function api(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', 'x-app-token': token },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) {
    token = prompt('סיסמת האפליקציה:') || '';
    localStorage.setItem('appToken', token);
    return api(method, url, body);
  }
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'שגיאה');
  return json;
}

const fmtDate = (s) => new Date(s).toLocaleDateString('he-IL', { weekday: 'short', day: 'numeric', month: 'numeric' });
const money = (n, cur = 'ILS') => {
  try { return new Intl.NumberFormat('he-IL', { style: 'currency', currency: cur || 'ILS' }).format(n); } catch { return `${n} ${cur || ''}`; }
};
const daysLeft = (s) => Math.ceil((new Date(s) - Date.now()) / 86400000);

// ---------- לשוניות ----------
document.querySelectorAll('nav button').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));
function showTab(t) {
  document.querySelectorAll('nav button').forEach((b) => b.setAttribute('aria-selected', b.dataset.tab === t));
  document.querySelectorAll('main > section').forEach((s) => (s.hidden = s.id !== `tab-${t}`));
}

// ---------- תצוגה ----------
function render() {
  const scanned = S.lastScan ? `נבדק לאחרונה: ${new Date(S.lastScan).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' })}` : 'עוד לא בוצעה בדיקה';
  $('#status').textContent = S.location ? `📍 ${S.location.label} · רדיוס ${S.radiusKm} ק"מ · ${scanned}` : 'יש להגדיר מיקום בלשונית „הגדרות”';
  $('#sources').textContent = S.lastSources.length ? `מקור הנתונים: ${S.lastSources.join(', ')}` : '';
  $('#follow').checked = S.followLocation;

  renderDeals();
  renderList();

  $('#loc').textContent = S.location ? `נוכחי: ${S.location.label}` : 'לא הוגדר מיקום';
  $('#radius').value = S.radiusKm;
  $('#radiusVal').textContent = S.radiusKm;
  $('#chains').replaceChildren(...S.chains.map((c) => {
    const l = document.createElement('label');
    l.innerHTML = `<input type="checkbox" ${c.on ? 'checked' : ''} value="${c.id}"> `;
    l.append(c.name);
    return l;
  }));

  const errs = S.lastErrors || [];
  $('#errors').hidden = !errs.length;
  $('#errors ul').replaceChildren(...errs.map((e) => Object.assign(document.createElement('li'), { textContent: e })));
}

function renderDeals() {
  const box = $('#deals');
  if (!S.list.length) return (box.innerHTML = '<p class="empty muted">הרשימה ריקה. הוסיפו מוצרים בלשונית „רשימת קניות”.</p>');
  if (!S.deals.length) return (box.innerHTML = `<p class="empty muted">${S.lastScan ? 'לא נמצאו כרגע מבצעים על מוצרי הרשימה באזור.' : 'לחצו „בדיקת מבצעים עכשיו”.'}</p>`);

  const groups = new Map();
  for (const d of S.deals) groups.set(d.listItem, [...(groups.get(d.listItem) || []), d]);
  box.replaceChildren(...[...groups].map(([item, deals]) => {
    const g = document.createElement('div');
    g.className = 'group';
    g.innerHTML = `<h2></h2>`;
    g.firstChild.textContent = `${item} (${deals.length})`;
    for (const d of deals) {
      const el = $('#dealTpl').content.cloneNode(true);
      const price = el.querySelector('.price');
      price.textContent = d.promoPrice != null ? `${d.minQty > 1 ? `${d.minQty} ב-` : ''}${money(d.promoPrice, d.currency)}` : 'מבצע';
      if (d.regularPrice) price.append(Object.assign(document.createElement('s'), { textContent: money(d.regularPrice, d.currency) }));
      el.querySelector('.chain').textContent = d.chain;
      const prod = el.querySelector('.product');
      prod.textContent = d.product;
      if (d.clubOnly) prod.append(Object.assign(document.createElement('span'), { className: 'badge', textContent: 'מועדון' }));
      el.querySelector('.desc').textContent = d.description;
      const until = el.querySelector('.until');
      if (d.end) {
        const left = daysLeft(d.end);
        until.textContent = `בתוקף עד ${fmtDate(d.end)}${left <= 2 ? ` · ${left <= 0 ? 'מסתיים היום' : `עוד ${left} ימים`}` : ''}`;
        until.classList.toggle('soon', left <= 2);
      } else until.textContent = 'תאריך סיום לא פורסם';
      if (d.url) {
        const a = Object.assign(document.createElement('a'), { href: d.url, target: '_blank', rel: 'noopener', textContent: 'מקור ↗' });
        el.querySelector('.desc').append(' · ', a);
      }
      el.querySelector('.where').textContent = `${d.store}${d.km != null ? ` · ${d.km} ק"מ` : ''}`;
      el.querySelector('.where').title = d.address;
      g.append(el);
    }
    return g;
  }));
}

function renderList() {
  $('#items').replaceChildren(...S.list.map((it, i) => {
    const li = document.createElement('li');
    const inp = Object.assign(document.createElement('input'), { value: it.text, ariaLabel: 'מוצר' });
    inp.addEventListener('change', () => {
      const items = S.list.map((x) => x.text);
      items[i] = inp.value;
      saveList(items);
    });
    const del = Object.assign(document.createElement('button'), { textContent: '✕', title: 'מחיקה' });
    del.addEventListener('click', () => saveList(S.list.filter((_, j) => j !== i).map((x) => x.text)));
    li.append(inp, del);
    return li;
  }));
}

// ---------- רשימת קניות ----------
const splitItems = (txt) => txt.split(/[\n,;]+/).map((s) => s.replace(/^[\s\-*•\d.)]+(?=\D)/, '').trim()).filter(Boolean);

async function saveList(items) {
  const uniq = [...new Map(items.map((x) => [x.trim(), x.trim()])).values()];
  S = await api('PUT', '/api/list', { items: uniq });
  render();
}

$('#add').addEventListener('submit', (e) => {
  e.preventDefault();
  const v = $('#newItem').value.trim();
  if (!v) return;
  $('#newItem').value = '';
  saveList([...S.list.map((x) => x.text), ...splitItems(v)]);
});
$('#bulkAdd').addEventListener('click', () => { saveList([...S.list.map((x) => x.text), ...splitItems($('#bulk').value)]); $('#bulk').value = ''; });
$('#bulkReplace').addEventListener('click', () => {
  if (confirm('להחליף את כל הרשימה הקיימת?')) { saveList(splitItems($('#bulk').value)); $('#bulk').value = ''; }
});
$('#file').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  $('#bulk').value = await f.text();
  e.target.value = '';
});

// ---------- סריקה ----------
$('#scan').addEventListener('click', async () => {
  const b = $('#scan');
  b.disabled = true;
  b.textContent = 'בודק מבצעים… (יכול לקחת כמה דקות)';
  try {
    const r = await api('POST', '/api/scan');
    S = r.state;
    render();
  } catch (e) {
    alert(e.message);
  } finally {
    b.disabled = false;
    b.textContent = 'בדיקת מבצעים עכשיו';
  }
});

// ---------- הגדרות ----------
$('#gps').addEventListener('click', () => {
  if (!navigator.geolocation) return alert('הדפדפן לא תומך באיתור מיקום');
  navigator.geolocation.getCurrentPosition(
    async (p) => {
      await api('PUT', '/api/settings', { followLocation: true });
      await sendLocation(p, true);
    },
    (err) => alert('לא ניתן לקבל מיקום: ' + err.message),
    { enableHighAccuracy: false, timeout: 15000 },
  );
});
$('#addrForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try { S = await api('PUT', '/api/settings', { address: $('#addr').value }); render(); } catch (err) { alert(err.message); }
});
$('#radius').addEventListener('input', (e) => ($('#radiusVal').textContent = e.target.value));
$('#radius').addEventListener('change', async (e) => { S = await api('PUT', '/api/settings', { radiusKm: Number(e.target.value) }); render(); });
$('#chains').addEventListener('change', async () => {
  const on = [...document.querySelectorAll('#chains input:checked')].map((i) => i.value);
  S = await api('PUT', '/api/settings', { chains: on });
  render();
});

$('#follow').addEventListener('change', async (e) => {
  S = await api('PUT', '/api/settings', { followLocation: e.target.checked });
  render();
  if (S.followLocation) updateLocation();
});

// ---------- מעקב מיקום ----------
// בכל פתיחה של האפליקציה (ובזמן שהיא פתוחה) נשלח המיקום לשרת. אם זזת – השרת מזהה מדינה ובודק מבצעים מחדש.
async function sendLocation(p, manual = false) {
  const r = await api('POST', '/api/location', { lat: p.coords.latitude, lon: p.coords.longitude });
  S = r.state;
  render();
  if (r.moved) {
    toast(`📍 ${S.location.label} – בודק מבצעים באזור…`);
    waitForScan(S.lastScan);
  } else if (manual) toast(`📍 ${S.location.label}`);
}

function updateLocation() {
  if (!S?.followLocation || !navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition((p) => sendLocation(p).catch(() => {}), () => {}, { timeout: 20000, maximumAge: 60000 });
}

async function waitForScan(prev) {
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    const s = await api('GET', '/api/state');
    if (s.lastScan !== prev) { S = s; render(); toast(`📍 ${S.location.label}: נמצאו ${S.deals.length} מבצעים`); return; }
  }
}

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), 6000);
}

document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') updateLocation(); });
setInterval(updateLocation, 10 * 60000);

// ---------- התראות ----------
const b64ToBytes = (b64) => {
  const s = atob((b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
};

async function updatePushState() {
  const el = $('#pushState');
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    el.textContent = /iPhone|iPad/.test(navigator.userAgent)
      ? 'באייפון: קודם מוסיפים את האפליקציה למסך הבית ופותחים אותה משם.'
      : 'הדפדפן הזה לא תומך בהתראות.';
    $('#enablePush').hidden = true;
    return;
  }
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  el.textContent = sub ? 'ההתראות פעילות במכשיר הזה ✔' : Notification.permission === 'denied' ? 'ההתראות נחסמו בהגדרות הדפדפן.' : 'ההתראות כבויות במכשיר הזה.';
}

$('#enablePush').addEventListener('click', async () => {
  try {
    if ((await Notification.requestPermission()) !== 'granted') return updatePushState();
    const reg = await navigator.serviceWorker.ready;
    const sub = (await reg.pushManager.getSubscription()) ||
      (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(S.vapidKey) }));
    await api('POST', '/api/subscribe', sub.toJSON());
    updatePushState();
  } catch (e) { alert('הפעלת ההתראות נכשלה: ' + e.message); }
});
$('#testPush').addEventListener('click', () => api('POST', '/api/test-push'));

let installEvt;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvt = e; $('#install').hidden = false; });
$('#install').addEventListener('click', () => installEvt?.prompt());

// ---------- הפעלה ----------
(async () => {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
  S = await api('GET', '/api/state');
  render();
  updateLocation();
  if (!S.location && !S.followLocation) showTab('settings');
  else if (!S.list.length) showTab('list');
  updatePushState();
})();
