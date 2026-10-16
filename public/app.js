const $ = (s) => document.querySelector(s);
let S = null;
const store = {
  get: (k) => { try { return localStorage.getItem(k) || ''; } catch { return ''; } },
  set: (k, v) => { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch { /* מצב פרטי */ } },
};
let token = store.get('session');

async function api(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', 'x-app-token': token },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (res.status === 401 && url !== '/api/login') {
    showLogin();
    throw new Error('נדרשת כניסה');
  }
  if (!res.ok) throw new Error(json.error || 'שגיאה');
  return json;
}

// ---------- כניסה ----------
async function showLogin() {
  document.body.classList.add('logged-out');
  try {
    const { firstRun } = await (await fetch('/api/setup')).json();
    $('#loginHint').textContent = firstRun
      ? 'כניסה ראשונה: בחרו שם, והקלידו את הסיסמה שהוגדרה בהתקנה. החשבון הזה יהיה המנהל.'
      : 'כניסה לחשבון שלך';
  } catch { /* בלי חיבור */ }
}

$('#loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = $('#loginError');
  err.hidden = true;
  try {
    const r = await api('POST', '/api/login', { name: $('#loginName').value, password: $('#loginPass').value });
    token = r.token;
    store.set('session', token);
    $('#loginPass').value = '';
    await boot();
  } catch (ex) {
    err.textContent = ex.message;
    err.hidden = false;
  }
});

const fmtDate = (s) => new Date(s).toLocaleDateString('he-IL', { weekday: 'short', day: 'numeric', month: 'numeric' });
const money = (n, cur = 'ILS') => {
  try { return new Intl.NumberFormat('he-IL', { style: 'currency', currency: cur || 'ILS' }).format(n); } catch { return `${n} ${cur || ''}`; }
};
const daysLeft = (s) => Math.ceil((new Date(s) - Date.now()) / 86400000);

// ---------- לשוניות ----------
document.querySelectorAll('nav button').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));
// כפתור גלגל השיניים פותח את ההגדרות, ולחיצה נוספת חוזרת למבצעים
$('#gear').addEventListener('click', () => showTab($('#gear').getAttribute('aria-pressed') === 'true' ? 'deals' : 'settings'));
function showTab(t) {
  document.querySelectorAll('nav button').forEach((b) => b.setAttribute('aria-selected', b.dataset.tab === t));
  $('#gear').setAttribute('aria-pressed', t === 'settings');
  if (t === 'settings') scrollTo({ top: 0 });
  document.querySelectorAll('main > section').forEach((s) => (s.hidden = s.id !== `tab-${t}`));
}

// ---------- תצוגה ----------
function render() {
  const scanned = S.lastScan ? `נבדק לאחרונה: ${new Date(S.lastScan).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' })}` : 'עוד לא בוצעה בדיקה';
  $('#status').textContent = S.location ? `📍 ${S.location.label} · רדיוס ${S.radiusKm} ק"מ · ${scanned}` : 'יש להגדיר מיקום בלשונית „הגדרות”';
  $('#sources').textContent = S.lastSources.length ? `מקור הנתונים: ${S.lastSources.join(', ')}` : '';
  $('#follow').checked = S.followLocation;
  $('#meName').textContent = S.me.name;
  renderFamily();

  renderDeals();
  renderList();
  renderHome();

  $('#loc').textContent = S.location ? `נוכחי: ${S.location.label}` : 'לא הוגדר מיקום';
  $('#radius').value = S.radiusKm;
  $('#radiusVal').textContent = S.radiusKm;
  $('#chains').replaceChildren(...S.chains.map((c) => {
    const l = document.createElement('label');
    l.innerHTML = `<input type="checkbox" ${c.on ? 'checked' : ''} value="${c.id}"> `;
    l.append(c.name);
    return l;
  }));

  renderReport();
  const errs = S.lastErrors || [];
  $('#errors').hidden = !errs.length;
  $('#errors ul').replaceChildren(...errs.map((e) => Object.assign(document.createElement('li'), { textContent: e })));
}

function renderDeals() {
  const box = $('#deals');
  if (!S.list.length) return (box.innerHTML = '<p class="empty muted">הרשימה ריקה. הוסיפו מוצרים בלשונית „רשימה לחיפוש מבצעים”.</p>');
  if (!S.deals.length) return (box.innerHTML = `<p class="empty muted">${S.lastScan ? 'לא נמצאו כרגע מבצעים על מוצרי הרשימה באזור. למטה אפשר לראות בדיוק מה נבדק.' : 'לחצו „בדיקת מבצעים עכשיו”.'}</p>`);

  const groups = new Map();
  for (const d of S.deals) groups.set(d.listItem, [...(groups.get(d.listItem) || []), d]);
  box.replaceChildren(...[...groups].map(([item, deals]) => {
    const g = document.createElement('div');
    g.className = 'group';
    g.innerHTML = `<h2></h2>`;
    g.firstChild.textContent = `${foodIcon(item)} ${item} (${deals.length})`;
    for (const d of deals) g.append(dealCard(d));
    return g;
  }));
}

// קישור שבו אפשר לראות את המוצר עצמו ולוודא שזה מה שרוצים.
// בישראל המבצעים מגיעים מקובצי השקיפות הרשמיים (לא דף אינטרנט), ולכן מקשרים לחיפוש המוצר לפי ברקוד באתר הרשת.
const SHOP_SEARCH = [
  [/שופרסל/, (q) => `https://www.shufersal.co.il/online/he/search?text=${q}`],
  [/רמי לוי/, (q) => `https://www.rami-levy.co.il/he/online/search?q=${q}`],
];
function dealLink(d) {
  if (d.url) return { href: d.url, label: 'לדף המבצע באתר הרשת ↗' };
  const code = /^\d{7,14}$/.test(d.itemCode || '') ? d.itemCode : '';
  const shop = SHOP_SEARCH.find(([re]) => re.test(d.chain));
  if (shop && code) return { href: shop[1](encodeURIComponent(code)), label: `לחיפוש המוצר באתר ${d.chain} ↗` };
  const q = [d.product, code, d.chain, d.currency === 'EUR' ? 'Angebot' : d.currency === 'AUD' ? 'special' : 'מבצע'].filter(Boolean).join(' ');
  return { href: `https://www.google.com/search?q=${encodeURIComponent(q)}`, label: 'לחיפוש המוצר ברשת ↗' };
}

function dealCard(d) {
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
  el.querySelector('.where').textContent = `${d.store}${d.km != null ? ` · ${d.km} ק"מ` : ''}`;
  el.querySelector('.where').title = d.address;
  const link = dealLink(d);
  const src = el.querySelector('.source');
  if (d.itemCode && /^\d{7,14}$/.test(d.itemCode)) src.append(Object.assign(document.createElement('span'), { className: 'muted', textContent: `ברקוד ${d.itemCode} · ` }));
  src.append(Object.assign(document.createElement('a'), { href: link.href, target: '_blank', rel: 'noopener', textContent: `🔗 ${link.label}` }));
  return el;
}

// „מה נבדק בסריקה האחרונה”: מיקום שזוהה, מקור נתונים, רשתות וסניפים, ומה חופש לכל מוצר
function renderReport() {
  const R = S.lastReport;
  const box = $('#report');
  box.hidden = !R;
  if (!R) return;
  if (!S.deals.length) box.open = true;
  const el = (tag, text, cls) => Object.assign(document.createElement(tag), { textContent: text, className: cls || '' });
  const body = $('#reportBody');
  body.replaceChildren();

  const p = R.place || {};
  const where = [p.city, p.country].filter(Boolean).join(', ') || 'לא זוהה';
  body.append(el('p', `📍 מיקום שזוהה: ${where}${p.postcode ? ` · מיקוד ${p.postcode}` : ''} · רדיוס ${R.radiusKm} ק"מ`));

  if (!R.providers.length) {
    body.append(el('p', `⚠️ אין עדיין מקור מבצעים חינמי ל${p.country || 'מדינה הזו'}. נתמכות כרגע: ישראל, אוסטריה, גרמניה ואוסטרליה.`, 'warn'));
    return;
  }
  for (const pr of R.providers) {
    body.append(el('p', pr.error ? `✘ מקור הנתונים: ${pr.name} – נכשל: ${pr.error}` : `✔ מקור הנתונים: ${pr.name}`, pr.error ? 'warn' : ''));
  }
  if (R.note) body.append(el('p', R.note, 'muted small'));

  body.append(el('h4', 'רשתות'));
  const chains = el('ul', '', 'report-list');
  if (!R.chains.length) chains.append(el('li', 'לא הופיעה אף רשת עם מבצע על מוצרי הרשימה.', 'muted'));
  for (const c of R.chains) {
    let line;
    if (c.error) line = `✘ ${c.name} – לא הצלחנו לבדוק: ${c.error}`;
    else if (c.nearby === 0) line = `– ${c.name} – אין סניף ברדיוס ${R.radiusKm} ק"מ`;
    else if (c.nearby == null) line = `✔ ${c.name} – ${c.deals} מבצעים מהרשימה`;
    else {
      const st = c.stores.map((s) => (s.error ? `${s.name} (${s.km} ק"מ, שגיאה)` : `${s.name} (${s.km} ק"מ, ${s.promos} מבצעים בסניף)`)).join(' · ');
      line = `✔ ${c.name} – ${c.nearby} סניפים ברדיוס, נבדקו: ${st} – ${c.deals} התאמות לרשימה`;
    }
    chains.append(el('li', line, c.error ? 'warn' : c.nearby === 0 ? 'muted' : ''));
  }
  body.append(chains);

  body.append(el('h4', 'מוצרים'));
  const items = el('ul', '', 'report-list');
  const abroad = p.countryCode && p.countryCode !== 'IL';
  for (const it of R.items) {
    let line = `${foodIcon(it.text)} ${it.text}`;
    if (it.term && it.term !== it.text) line += ` → חיפוש „${it.term}”${it.how === 'online' ? ' (תרגום אוטומטי – אם הוא שגוי, אפשר לתקן עם |)' : it.how === 'manual' ? ' (תרגום ידני)' : ''}`;
    if (it.offers != null) line += ` · ${it.offers} תוצאות בעלונים`;
    line += ` · ${it.found ? `${it.found} מבצעים בתוקף` : 'אין מבצע כרגע'}`;
    const li = el('li', line);
    if (it.error) li.append(el('div', `שגיאה: ${it.error}`, 'warn small'));
    else if (abroad && it.offers != null && !it.translated && !/[a-zà-ÿ]/i.test(it.term || '')) {
      li.append(el('div', 'לא תורגם לשפה המקומית. אפשר להוסיף תרגום ידני: למשל „חלב | Milch”', 'muted small'));
    }
    items.append(li);
  }
  body.append(items);
}

function renderList() {
  $('#items').replaceChildren(...S.list.map((it, i) => {
    const li = document.createElement('li');
    const icon = Object.assign(document.createElement('span'), { className: 'food', textContent: foodIcon(it.text), ariaHidden: 'true' });
    const inp = Object.assign(document.createElement('input'), { value: it.text, ariaLabel: 'מוצר' });
    inp.addEventListener('input', () => (icon.textContent = foodIcon(inp.value)));
    inp.addEventListener('change', () => {
      const items = S.list.map((x) => x.text);
      items[i] = inp.value;
      saveList(items);
    });
    const del = Object.assign(document.createElement('button'), { textContent: '✕', title: 'מחיקה' });
    del.addEventListener('click', () => saveList(S.list.filter((_, j) => j !== i).map((x) => x.text)));
    li.append(icon, inp, del);
    return li;
  }));
}

function renderFamily() {
  $('#familyCard').hidden = false;
  $('#newHouseholdWrap').hidden = !S.me.admin;
  $('#appUrl').textContent = location.origin;
  $('#family').replaceChildren(...S.users.map((u) => {
    const li = document.createElement('li');
    const who = Object.assign(document.createElement('span'), { className: 'who' });
    who.append(Object.assign(document.createElement('b'), { textContent: u.name }));
    who.append(Object.assign(document.createElement('span'), {
      className: 'muted small',
      textContent: ` ${u.household === S.me.household ? '· 🏠 משק הבית שלך' : '· משק בית אחר'}${u.admin ? ' · מנהל' : ''}${u.location ? ` · 📍 ${u.location}` : ' · עוד לא נכנס'}`,
    }));
    li.append(who);
    if (!S.me.admin) return li; // ניהול סיסמאות ומחיקה – למנהל בלבד
    const reset = Object.assign(document.createElement('button'), { textContent: 'סיסמה חדשה' });
    reset.addEventListener('click', async () => {
      const p = prompt(`סיסמה חדשה עבור ${u.name} (לפחות 6 תווים):`);
      if (!p) return;
      try { S = await api('PUT', `/api/users/${encodeURIComponent(u.name)}/password`, { password: p }); render(); toast(`הסיסמה של ${u.name} עודכנה`); } catch (e) { alert(e.message); }
    });
    const acts = Object.assign(document.createElement('span'), { className: 'acts' });
    acts.append(reset);
    if (u.name !== S.me.name) {
      const mine = u.household === S.me.household;
      const hh = Object.assign(document.createElement('button'), { textContent: mine ? 'הפרדה ממשק הבית שלי' : 'צירוף למשק הבית שלי' });
      hh.addEventListener('click', async () => {
        const q = mine
          ? `להפריד את ${u.name} ממשק הבית שלך? רשימת „חסר בבית” שלך תישאר אצלך, ו${u.name} יקבל רשימה ריקה משלו.`
          : `לצרף את ${u.name} למשק הבית שלך? הוא יראה ויעדכן את רשימת „חסר בבית” שלך.`;
        if (!confirm(q)) return;
        try { S = await api('PUT', `/api/users/${encodeURIComponent(u.name)}/household`, { join: !mine }); render(); } catch (e) { alert(e.message); }
      });
      acts.append(hh);
    }
    li.append(acts);
    if (u.name !== S.me.name) {
      const del = Object.assign(document.createElement('button'), { textContent: 'מחיקה' });
      del.addEventListener('click', async () => {
        if (!confirm(`למחוק את החשבון של ${u.name}? הרשימה וההגדרות שלו יימחקו.`)) return;
        try { S = await api('DELETE', `/api/users/${encodeURIComponent(u.name)}`); render(); } catch (e) { alert(e.message); }
      });
      acts.append(del);
    }
    return li;
  }));
}

$('#addUser').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    S = await api('POST', '/api/users', { name: $('#newUserName').value, password: $('#newUserPass').value, newHousehold: $('#newHousehold').checked });
    toast(`${$('#newUserName').value} נוסף/ה`);
    $('#addUser').reset();
    render();
  } catch (ex) { alert(ex.message); }
});

$('#passForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  if ($('#passNew').value !== $('#passNew2').value) return alert('הסיסמאות החדשות לא זהות');
  try {
    await api('PUT', '/api/password', { current: $('#passCur').value, next: $('#passNew').value });
    $('#passForm').reset();
    $('#passForm').closest('details').open = false;
    toast('הסיסמה הוחלפה ✔ שאר המכשירים יתבקשו להיכנס מחדש');
  } catch (ex) { alert(ex.message); }
});

$('#logout').addEventListener('click', async () => {
  // ההתראות במכשיר הזה שייכות לחשבון שיוצא – מבטלים אותן
  try { const reg = await navigator.serviceWorker?.ready; await (await reg?.pushManager.getSubscription())?.unsubscribe(); } catch { /* */ }
  await api('POST', '/api/logout').catch(() => {});
  token = '';
  store.set('session', '');
  S = null;
  showLogin();
});

// ---------- חסר בבית (משותף לבני הבית) ----------
const plain = (s) => String(s).split('|')[0].replace(/[׳'"״]/g, '').trim().toLowerCase();

// מבצע מהסריקה האחרונה שמתאים לפריט (לפי הרשימה לחיפוש מבצעים)
function dealsFor(text) {
  const t = plain(text);
  return S.deals
    .filter((d) => {
      const w = plain(d.listItem);
      return w && (w.includes(t) || t.includes(w));
    })
    .sort((a, b) => (a.promoPrice ?? 1e9) - (b.promoPrice ?? 1e9));
}
const dealFor = (text) => dealsFor(text)[0];

// חלון פרטי המבצעים על פריט מ„חסר בבית”, עם קישור לבדיקה
function openDealSheet(text) {
  const ds = dealsFor(text);
  $('#sheetTitle').textContent = `${foodIcon(text)} מבצעים על „${text}”`;
  $('#sheetBody').replaceChildren(...ds.map(dealCard));
  $('#dealSheet').showModal();
}
$('#sheetClose').addEventListener('click', () => $('#dealSheet').close());
$('#dealSheet').addEventListener('click', (e) => { if (e.target === $('#dealSheet')) $('#dealSheet').close(); });

function renderHome() {
  const items = [...(S.home || [])].sort((a, b) => a.done - b.done);
  const open = items.filter((x) => !x.done).length;
  $('#homeCount').hidden = !open;
  $('#homeCount').textContent = open;
  const others = S.users.filter((u) => u.household === S.me.household && u.name !== S.me.name).map((u) => u.name);
  $('#homeShared').textContent = others.length ? `🏠 משותף עם: ${others.join(', ')}` : '🏠 כרגע רק את/ה ברשימה הזו. אפשר לשתף בני בית בהגדרות ← „בני הבית”.';
  $('#homeEmpty').hidden = items.length > 0;
  $('#homeActions').hidden = !items.some((x) => x.done);
  const watched = new Set(S.list.map((x) => plain(x.text)));

  $('#homeList').replaceChildren(...items.map((it) => {
    const li = document.createElement('li');
    li.className = 'homeitem' + (it.done ? ' done' : '');
    const toggle = Object.assign(document.createElement('button'), { className: 'check', ariaLabel: it.done ? 'סימון כלא נקנה' : 'סימון כנקנה', textContent: it.done ? '✔' : '' });
    const body = Object.assign(document.createElement('span'), { className: 'hbody' });
    body.append(Object.assign(document.createElement('span'), { className: 'food', textContent: it.voice ? '🎙️' : foodIcon(it.text) }));
    const txt = Object.assign(document.createElement('span'), { className: 'htext' });
    txt.append(Object.assign(document.createElement('span'), { textContent: it.voice ? `הודעה קולית${it.voice.seconds ? ` · ${it.voice.seconds} שנ׳` : ''}` : it.text }));
    const meta = [it.by && it.by !== S.me.name ? `הוסיף/ה ${it.by}` : '', it.done && it.doneBy ? `נקנה ע״י ${it.doneBy}` : ''].filter(Boolean).join(' · ');
    if (meta) txt.append(Object.assign(document.createElement('small'), { className: 'muted', textContent: meta }));
    const d = !it.done && !it.voice && dealFor(it.text);
    if (d) {
      const n = dealsFor(it.text).length;
      const sale = Object.assign(document.createElement('button'), {
        type: 'button',
        className: 'onsale',
        textContent: `🏷️ במבצע: ${d.promoPrice != null ? `${d.minQty > 1 ? `${d.minQty} ב-` : ''}${money(d.promoPrice, d.currency)}` : d.description} ב${d.chain}${n > 1 ? ` (ועוד ${n - 1})` : ''} · פרטים וקישור ‹`,
      });
      sale.addEventListener('click', (e) => { e.stopPropagation(); openDealSheet(it.text); });
      txt.append(sale);
    }
    body.append(txt);
    const flip = async () => {
      it.done = !it.done; // עדכון מיידי במסך, ואז בשרת
      renderHome();
      try { Object.assign(S, await api('PATCH', `/api/home/${it.id}`, { done: it.done })); } catch (e) { toast(e.message); }
      renderHome();
    };
    toggle.addEventListener('click', flip);
    body.addEventListener('click', flip);
    li.append(toggle, body);
    if (it.voice) {
      const play = Object.assign(document.createElement('button'), { className: 'mini play', textContent: '▶', title: 'השמעה' });
      play.addEventListener('click', () => playVoice(it.id, play));
      li.append(play);
    } else if (!watched.has(plain(it.text))) {
      const star = Object.assign(document.createElement('button'), { className: 'mini', textContent: '⭐', title: 'להוסיף לרשימה לחיפוש מבצעים' });
      star.addEventListener('click', async () => {
        await saveList([...S.list.map((x) => x.text), it.text]);
        toast(`„${it.text}” נוסף לרשימה לחיפוש מבצעים`);
      });
      li.append(star);
    }
    const del = Object.assign(document.createElement('button'), { className: 'mini', textContent: '✕', title: 'מחיקה' });
    del.addEventListener('click', async () => { Object.assign(S, await api('DELETE', `/api/home/${it.id}`)); renderHome(); });
    li.append(del);
    return li;
  }));
}

// פריט שכבר ברשימה: אזהרה כבר בזמן ההקלדה, והודעה אחרי ההוספה
const sameItem = (a, b) => {
  const n = (s) => String(s).replace(/[׳'"״.,]/g, '').replace(/\s+/g, ' ').trim().toLowerCase().replace(/^ה(?=[\u05D0-\u05EA]{2})/, '');
  return n(a) === n(b);
};
const whoAdded = (x) => (x.by && x.by !== S.me.name ? ` (הוסיף/ה ${x.by})` : x.by ? ' (הוספת בעצמך)' : '');

function showDuplicates(dups) {
  const hint = $('#dupHint');
  hint.hidden = !dups.length;
  if (!dups.length) return;
  hint.textContent = dups.length === 1
    ? `ℹ️ „${dups[0].text}” כבר ברשימה${whoAdded(dups[0])}`
    : `ℹ️ כבר ברשימה: ${dups.map((d) => `„${d.text}”`).join(', ')}`;
}

$('#homeItem').addEventListener('input', () => {
  const open = (S.home || []).filter((x) => !x.done && !x.voice);
  showDuplicates(splitItems($('#homeItem').value).map((t) => open.find((x) => sameItem(x.text, t))).filter(Boolean));
});

$('#homeAdd').addEventListener('submit', async (e) => {
  e.preventDefault();
  const items = splitItems($('#homeItem').value);
  if (!items.length) return;
  $('#homeItem').value = '';
  const r = await api('POST', '/api/home', { items });
  Object.assign(S, { home: r.home });
  renderHome();
  showDuplicates(r.duplicates || []);
  const added = items.length - (r.duplicates || []).length;
  if (r.duplicates?.length) {
    const dupText = r.duplicates.length === 1 ? `„${r.duplicates[0].text}” כבר ברשימה ולא נוסף שוב` : `${r.duplicates.length} פריטים כבר ברשימה ולא נוספו שוב`;
    const addedText = added === 1 ? 'נוסף פריט אחד' : `נוספו ${added} פריטים`;
    toast(added ? `${addedText}. ${dupText}` : (r.duplicates.length === 1 ? dupText : 'כל הפריטים כבר ברשימה'));
    // הדגשת הפריטים שכבר קיימים
    for (const d of r.duplicates) {
      const li = [...document.querySelectorAll('#homeList .homeitem')].find((el) => el.querySelector('.htext > span')?.textContent === d.text);
      if (li) { li.classList.add('flash'); setTimeout(() => li.classList.remove('flash'), 2000); }
    }
  }
});

// קישור לאפליקציה: העתקה / שליחה
$('#copyLink').addEventListener('click', async () => {
  const url = location.origin;
  try {
    await navigator.clipboard.writeText(url);
  } catch {
    const r = document.createRange(); r.selectNodeContents($('#appUrl'));
    getSelection().removeAllRanges(); getSelection().addRange(r);
    document.execCommand('copy');
  }
  $('#copyLink').textContent = '✔ הועתק';
  setTimeout(() => ($('#copyLink').textContent = '📋 העתקת הקישור'), 2000);
});
if (navigator.share) {
  $('#shareLink').hidden = false;
  $('#shareLink').addEventListener('click', () => navigator.share({ title: 'מבצעים ליד הבית', text: 'הצטרפות לאפליקציה „מבצעים ליד הבית”:', url: location.origin }).catch(() => {}));
}

// ---------- קול: הכתבה (דיבור ← טקסט) והודעה קולית ----------
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
const STOP_WORDS = new Set(['צריך', 'צריכים', 'צריכה', 'לקנות', 'תקנה', 'תקנו', 'חסר', 'חסרה', 'חסרים', 'גם', 'וגם', 'עוד', 'בבקשה', 'ו']);
const COMPOUNDS = ['שמן זית', 'שמן קנולה', 'בשר טחון', 'חזה עוף', 'שוקי עוף', 'נייר טואלט', 'מגבות נייר', 'אבקת כביסה', 'נוזל כלים',
  'משחת שיניים', 'תפוחי אדמה', 'גבינה צהובה', 'גבינה לבנה', 'גבינה בולגרית', 'שמנת חמוצה', 'דגני בוקר', 'שיבולת שועל', 'חמאת בוטנים',
  'מזון לחתולים', 'מזון לכלבים', 'מיץ תפוזים', 'לחם אחיד', 'שוקולד חלב', 'מים מינרליים', 'נייר כסף', 'שקיות זבל'];
const isProduct = (w) => foodIcon(w) !== '🛒';

// „חלב לחם וביצים” ← ['חלב', 'לחם', 'ביצים']. הפרדה לפי ו' החיבור ולפי שמות מוצרים מוכרים, בלי לשבור צירופים כמו „שמן זית”.
function splitSpoken(text) {
  const items = [];
  let cur = [];
  const push = () => { if (cur.length) items.push(cur.join(' ')); cur = []; };
  for (const w of text.replace(/[.,،;]/g, ' , ').split(/\s+/).filter(Boolean)) {
    if (w === ',') { push(); continue; }
    if (STOP_WORDS.has(w)) continue;
    let word = w;
    let conj = false;
    if (/^ו[\u05D0-\u05EA]{2,}/.test(w) && !/^(וניל|ופל|וופל|וודקה|ויטמין|וואפל)/.test(w)) { conj = true; word = w.slice(1); }
    const phrase = cur.length ? `${cur[cur.length - 1]} ${word}` : '';
    const compound = phrase && COMPOUNDS.some((c) => c === phrase || c.startsWith(phrase + ' '));
    if (cur.length && !compound && (conj || (isProduct(word) && cur.some(isProduct)))) push();
    cur.push(word);
  }
  push();
  return items;
}

// אייקון מיקרופון אחד: הכתבה (דיבור ← פריטים). במכשיר שלא תומך בהכתבה – נשמרת הודעה קולית.
if (SR) {
  $('#mic').hidden = false;
  let rec = null;
  $('#mic').addEventListener('click', () => {
    if (rec) return rec.stop();
    rec = new SR();
    rec.lang = 'he-IL';
    rec.interimResults = true;
    rec.continuous = false;
    const before = $('#homeItem').value.trim();
    $('#mic').classList.add('live');
    $('#mic').textContent = '⏹';
    $('#voiceHint').textContent = 'אמרו מה חסר, למשל: „חלב, לחם וביצים”';
    rec.onresult = (e) => {
      const said = [...e.results].map((r) => r[0].transcript).join(' ');
      const items = splitSpoken(said);
      $('#homeItem').value = [before, items.join(', ')].filter(Boolean).join(', ');
    };
    rec.onerror = (e) => { $('#voiceHint').textContent = e.error === 'not-allowed' ? 'צריך לאשר גישה למיקרופון' : `ההכתבה נכשלה (${e.error})`; };
    rec.onend = () => {
      rec = null;
      $('#mic').classList.remove('live');
      $('#mic').textContent = '🎤';
      if ($('#homeItem').value.trim() !== before) {
        $('#voiceHint').textContent = 'בדקו את הפריטים ותקנו אם צריך, ואז „הוספה”';
        $('#homeItem').focus();
      }
    };
    rec.start();
  });
}

if (!SR && window.MediaRecorder && navigator.mediaDevices?.getUserMedia) {
  $('#mic').hidden = false;
  $('#mic').title = 'הקלטת הודעה קולית';
  let mr = null;
  let timer = null;
  const MAX = 30;
  $('#mic').addEventListener('click', async () => {
    if (mr) return mr.stop();
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch { return alert('צריך לאשר גישה למיקרופון'); }
    const type = ['audio/webm', 'audio/mp4', 'audio/ogg'].find((t) => MediaRecorder.isTypeSupported(t)) || '';
    mr = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
    const chunks = [];
    const t0 = Date.now();
    mr.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    mr.onstop = async () => {
      clearInterval(timer);
      stream.getTracks().forEach((t) => t.stop());
      const seconds = Math.round((Date.now() - t0) / 1000);
      const blob = new Blob(chunks, { type: (mr.mimeType || type || 'audio/webm').split(';')[0] });
      mr = null;
      $('#mic').classList.remove('live');
      $('#mic').textContent = '🎤';
      if (seconds < 1 || !blob.size) return;
      $('#voiceHint').textContent = 'שומר…';
      try {
        const res = await fetch('/api/home/voice', { method: 'POST', headers: { 'Content-Type': blob.type, 'x-voice-seconds': seconds, 'x-app-token': token }, body: blob });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error);
        Object.assign(S, json);
        renderHome();
        $('#voiceHint').textContent = 'ההודעה הקולית נוספה לרשימה';
      } catch (e) { $('#voiceHint').textContent = `השמירה נכשלה: ${e.message}`; }
    };
    mr.start();
    $('#mic').classList.add('live');
    timer = setInterval(() => {
      const s = Math.round((Date.now() - t0) / 1000);
      $('#mic').textContent = `⏹ ${s}`;
      if (s >= MAX) mr?.stop();
    }, 250);
    $('#voiceHint').textContent = 'מקליט… לחצו שוב לעצירה';
  });
}

const voiceUrls = new Map();
async function playVoice(id, btn) {
  try {
    if (!voiceUrls.has(id)) {
      const res = await fetch(`/api/home/${id}/voice`, { headers: { 'x-app-token': token } });
      if (!res.ok) throw new Error('ההקלטה לא נמצאה');
      voiceUrls.set(id, URL.createObjectURL(await res.blob()));
    }
    const a = new Audio(voiceUrls.get(id));
    btn.textContent = '🔊';
    a.onended = () => (btn.textContent = '▶');
    await a.play();
  } catch (e) { toast(e.message); btn.textContent = '▶'; }
}

$('#clearDone').addEventListener('click', async () => {
  const n = S.home.filter((x) => x.done).length;
  if (!confirm(`למחוק מהרשימה ${n} פריטים שנקנו? מה שלא נקנה יישאר.`)) return;
  Object.assign(S, await api('POST', '/api/home/clear-done'));
  renderHome();
  toast('הרשימה נוקתה – נשארו רק הפריטים שעוד לא נקנו');
});

// סנכרון עם בני הבית: בזמן שהרשימה פתוחה מתעדכנים כל כמה שניות
async function refreshHome() {
  if (!S || document.visibilityState !== 'visible') return;
  try { Object.assign(S, await api('GET', '/api/home')); renderHome(); } catch { /* */ }
}
setInterval(() => { if (!$('#tab-home').hidden) refreshHome(); }, 10000);
document.addEventListener('visibilitychange', refreshHome);
document.querySelector('nav [data-tab=home]').addEventListener('click', refreshHome);

// ---------- רשימה לחיפוש מבצעים ----------
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
// עדכון מיקום בלחיצה (ברירת המחדל): לוקחים את המיקום הנוכחי ובודקים מבצעים מחדש
function updateMyLocation() {
  if (!navigator.geolocation) return alert('הדפדפן לא תומך באיתור מיקום');
  const btns = [$('#locBtn'), $('#gps')];
  btns.forEach((b) => { b.disabled = true; });
  $('#locBtn').textContent = '📍 מאתר…';
  const done = () => { btns.forEach((b) => { b.disabled = false; }); $('#locBtn').textContent = '📍 עדכון מיקום'; };
  navigator.geolocation.getCurrentPosition(
    async (p) => {
      try {
        const prev = S.lastScan;
        S = await api('PUT', '/api/settings', { lat: p.coords.latitude, lon: p.coords.longitude });
        render();
        toast(`📍 המיקום עודכן: ${S.location.label} – בודק מבצעים באזור…`);
        waitForScan(prev);
      } catch (e) { alert(e.message); } finally { done(); }
    },
    (err) => { done(); alert(err.code === 1 ? 'צריך לאשר לאפליקציה גישה למיקום' : 'לא ניתן לקבל מיקום: ' + err.message); },
    { enableHighAccuracy: false, timeout: 20000, maximumAge: 0 },
  );
}
$('#gps').addEventListener('click', updateMyLocation);
$('#locBtn').addEventListener('click', updateMyLocation);
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
async function boot() {
  S = await api('GET', '/api/state');
  document.body.classList.remove('logged-out');
  render();
  updateLocation();
  if (!S.location && !S.followLocation) showTab('settings');
  else if (!S.list.length) showTab('list');
  updatePushState();
}

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
if (token) boot().catch(() => {}); else showLogin();
