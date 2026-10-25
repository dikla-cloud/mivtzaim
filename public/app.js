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
    headers: { 'Content-Type': 'application/json', 'x-app-token': token, 'x-app-lang': LANG },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (res.status === 401 && !url.startsWith('/api/login')) {
    showLogin();
    throw new Error(t('נדרשת כניסה'));
  }
  if (!res.ok) throw new Error(json.error || t('שגיאה'));
  return json;
}

// מדידה שומרת פרטיות: רק סוג הפעולה (ושם הרשת בלחיצה על מבצע), בלי שום פרט מזהה
function track(type, chain) {
  fetch('/api/metrics/event', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-app-token': token },
    body: JSON.stringify(chain ? { type, chain } : { type }),
    keepalive: true,
  }).catch(() => {});
}

// ---------- כניסה ----------
let setupInfo = {};
const loginErr = (msg) => { $('#loginError').textContent = msg || ''; $('#loginError').hidden = !msg; };
async function showLogin() {
  document.body.classList.add('logged-out');
  try { setupInfo = await (await fetch('/api/setup')).json(); } catch { /* בלי חיבור */ }
  const first = setupInfo.firstRun;
  const byEmail = !first && setupInfo.emailLogin;
  $('#codeForm').hidden = !byEmail;
  $('#loginForm').hidden = byEmail;
  $('#loginEmailWrap').hidden = !first;
  $('#loginEmail').required = Boolean(first);
  $('#codeStep1').hidden = false;
  $('#codeStep2').hidden = true;
  loginErr('');
  $('#loginHint').textContent = t(first
    ? 'כניסה ראשונה: בחרו שם, כתבו את המייל שלכם והקלידו את הסיסמה שהוגדרה בהתקנה. החשבון הזה יהיה המנהל.'
    : byEmail ? 'כתבו את המייל שלכם, ונשלח אליו קוד כניסה.' : 'כניסה לחשבון שלך');
}

async function loggedIn(tok) {
  token = tok;
  store.set('session', token);
  $('#loginPass').value = '';
  $('#codeValue').value = '';
  await boot();
}

$('#loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  loginErr('');
  try {
    const r = await api('POST', '/api/login', { name: $('#loginName').value, password: $('#loginPass').value, email: $('#loginEmail').value.trim() });
    await loggedIn(r.token);
  } catch (ex) { loginErr(ex.message); }
});

// כניסה עם קוד למייל
async function sendLoginCode() {
  loginErr('');
  const b = $('#codeSend');
  b.disabled = true;
  try {
    const r = await api('POST', '/api/login/code', { email: $('#codeEmail').value.trim() });
    $('#codeSent').textContent = t('שלחנו קוד ל-{to}. אם הוא לא מגיע, כדאי לבדוק גם בדואר הזבל.', { to: r.to });
    $('#codeStep1').hidden = true;
    $('#codeStep2').hidden = false;
    $('#codeValue').focus();
  } catch (ex) { loginErr(ex.message); } finally { b.disabled = false; }
}
$('#codeForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!$('#codeStep1').hidden) return sendLoginCode();
  loginErr('');
  try {
    const r = await api('POST', '/api/login/verify', { email: $('#codeEmail').value.trim(), code: $('#codeValue').value });
    await loggedIn(r.token);
  } catch (ex) { loginErr(ex.message); }
});
$('#codeResend').addEventListener('click', sendLoginCode);
$('#codeChange').addEventListener('click', () => { $('#codeStep1').hidden = false; $('#codeStep2').hidden = true; loginErr(''); $('#codeEmail').focus(); });

const fmtDate = (s) => new Date(s).toLocaleDateString(LOCALE, { weekday: 'short', day: 'numeric', month: 'numeric' });
const money = (n, cur = 'ILS') => {
  try { return new Intl.NumberFormat(LOCALE, { style: 'currency', currency: cur || 'ILS' }).format(n); } catch { return `${n} ${cur || ''}`; }
};
const daysLeft = (s) => Math.ceil((new Date(s) - Date.now()) / 86400000);

// ---------- לשוניות ----------
document.querySelectorAll('nav button').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));
// כפתור גלגל השיניים פותח את ההגדרות, ולחיצה נוספת חוזרת למבצעים
$('#gear').addEventListener('click', () => showTab($('#gear').getAttribute('aria-pressed') === 'true' ? 'deals' : 'settings'));
function showTab(t) {
  document.querySelectorAll('nav button').forEach((b) => b.setAttribute('aria-selected', b.dataset.tab === t));
  $('#gear').setAttribute('aria-pressed', t === 'settings');
  if (t === 'settings') { scrollTo({ top: 0 }); if (S?.me.admin) loadStats(); }
  document.querySelectorAll('main > section').forEach((s) => (s.hidden = s.id !== `tab-${t}`));
}

// ---------- תצוגה ----------
function render() {
  const scanned = S.lastScan ? t('נבדק לאחרונה: {when}', { when: new Date(S.lastScan).toLocaleString(LOCALE, { dateStyle: 'short', timeStyle: 'short' }) }) : t('עוד לא בוצעה בדיקה');
  $('#status').textContent = S.location ? t('📍 {place} · רדיוס {km} ק"מ · {scanned}', { place: S.location.label, km: S.radiusKm, scanned }) : t('לחצו על ״עדכון מיקום״ כדי להתחיל');
  $('#sources').textContent = S.lastSources.length ? t('מקור הנתונים: {src}', { src: S.lastSources.join(', ') }) : '';
  $('#meName').textContent = S.me.name;
  // כניסה עם מייל: בלי סיסמאות. מי שעוד אין לו מייל בחשבון – תזכורת בראש המסך
  $('#passBox').hidden = S.emailLogin;
  $('#emailBanner').hidden = !S.emailLogin || Boolean(S.me.email);
  if (document.activeElement !== $('#myEmail')) $('#myEmail').value = S.me.email || '';
  $('#deleteMeBox').hidden = S.me.admin;
  $('#statsCard').hidden = !S.me.admin;
  renderFamily();
  renderMyStoresInfo();

  renderDeals();
  renderList();
  renderHome();

  $('#loc').textContent = S.location ? t('נוכחי: {place}', { place: S.location.label }) : t('לא הוגדר מיקום');
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
  const empty = (msg) => box.replaceChildren(Object.assign(document.createElement('p'), { className: 'empty muted', textContent: t(msg) }));
  if (!S.list.length) return empty('הרשימה ריקה. הוסיפו מוצרים בלשונית ״רשימה לחיפוש מבצעים״.');
  if (!S.deals.length) return empty(S.lastScan ? 'לא נמצאו כרגע מבצעים על מוצרי הרשימה באזור. למטה אפשר לראות בדיוק מה נבדק.' : 'לחצו ״בדיקת מבצעים עכשיו״.');

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
  if (d.url) return { href: d.url, label: t('לדף המבצע באתר הרשת ↗') };
  const code = /^\d{7,14}$/.test(d.itemCode || '') ? d.itemCode : '';
  const shop = SHOP_SEARCH.find(([re]) => re.test(d.chain));
  if (shop && code) return { href: shop[1](encodeURIComponent(code)), label: t('לחיפוש המוצר באתר {chain} ↗', { chain: d.chain }) };
  const q = [d.product, code, d.chain, d.currency === 'EUR' ? 'Angebot' : d.currency === 'AUD' ? 'special' : 'מבצע'].filter(Boolean).join(' ');
  return { href: `https://www.google.com/search?q=${encodeURIComponent(q)}`, label: t('לחיפוש המוצר ברשת ↗') };
}

function dealCard(d) {
  const el = $('#dealTpl').content.cloneNode(true);
  const price = el.querySelector('.price');
  price.textContent = d.promoPrice != null ? `${d.minQty > 1 ? t('{n} ב-', { n: d.minQty }) : ''}${money(d.promoPrice, d.currency)}` : t('מבצע');
  if (d.regularPrice) price.append(Object.assign(document.createElement('s'), { textContent: money(d.regularPrice, d.currency) }));
  el.querySelector('.chain').textContent = d.chain;
  const prod = el.querySelector('.product');
  prod.textContent = d.product;
  if (d.clubOnly) prod.append(Object.assign(document.createElement('span'), { className: 'badge', textContent: t('מועדון') }));
  el.querySelector('.desc').textContent = d.description;
  const until = el.querySelector('.until');
  if (d.end) {
    const left = daysLeft(d.end);
    until.textContent = `${t('בתוקף עד {date}', { date: fmtDate(d.end) })}${left <= 2 ? ` · ${left <= 0 ? t('מסתיים היום') : t('עוד {n} ימים', { n: left })}` : ''}`;
    until.classList.toggle('soon', left <= 2);
  } else until.textContent = t('תאריך סיום לא פורסם');
  el.querySelector('.where').textContent = `${d.store}${d.km != null ? t(' · {km} ק"מ', { km: d.km }) : ''}`;
  el.querySelector('.where').title = d.address;
  const link = dealLink(d);
  const src = el.querySelector('.source');
  if (d.itemCode && /^\d{7,14}$/.test(d.itemCode)) src.append(Object.assign(document.createElement('span'), { className: 'muted', textContent: t('ברקוד {code} · ', { code: d.itemCode }) }));
  const a = Object.assign(document.createElement('a'), { href: link.href, target: '_blank', rel: 'noopener', textContent: `🔗 ${link.label}` });
  a.addEventListener('click', () => track('deal_click', d.chain));
  src.append(a);
  return el;
}

// ״מה נבדק בסריקה האחרונה״: מיקום שזוהה, מקור נתונים, רשתות וסניפים, ומה חופש לכל מוצר
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
  const where = [p.city, p.country].filter(Boolean).join(', ') || t('לא זוהה');
  body.append(el('p', `${t('📍 מיקום שזוהה: {where}', { where })}${p.postcode ? t(' · מיקוד {zip}', { zip: p.postcode }) : ''}${t(' · רדיוס {km} ק"מ', { km: R.radiusKm })}`));

  if (!R.providers.length) {
    body.append(el('p', t('⚠️ אין עדיין מקור מבצעים חינמי ל{country}. נתמכות כרגע: ישראל, אוסטריה, גרמניה ואוסטרליה.', { country: p.country || t('מדינה הזו') }), 'warn'));
    return;
  }
  for (const pr of R.providers) {
    body.append(el('p', pr.error ? t('✘ מקור הנתונים: {name} – נכשל: {err}', { name: pr.name, err: pr.error }) : t('✔ מקור הנתונים: {name}', { name: pr.name }), pr.error ? 'warn' : ''));
  }
  if (R.note) body.append(el('p', R.note, 'muted small'));

  body.append(el('h4', t('רשתות')));
  const chains = el('ul', '', 'report-list');
  if (!R.chains.length) chains.append(el('li', t('לא הופיעה אף רשת עם מבצע על מוצרי הרשימה.'), 'muted'));
  for (const c of R.chains) {
    let line;
    if (c.error) line = t('✘ {name} – לא הצלחנו לבדוק: {err}', { name: c.name, err: c.error });
    else if (c.nearby === 0) line = t('– {name} – אין סניף ברדיוס {km} ק"מ', { name: c.name, km: R.radiusKm });
    else if (c.skipped) line = t('– {name} – לא נבחר סניף לבדיקה', { name: c.name });
    else if (c.nearby == null) line = t('✔ {name} – {n} מבצעים מהרשימה', { name: c.name, n: c.deals });
    else {
      const st = c.stores.map((s) => {
        const v = { ...s, km: s.km ?? t('אונליין'), n: s.promos };
        return s.error ? t('{name} ({km} ק"מ, שגיאה)', v) : t('{name} ({km} ק"מ, {n} מבצעים בסניף)', v);
      }).join(' · ');
      line = t('✔ {name} – {nearby} סניפים ברדיוס, נבדקו: {stores} – {n} התאמות לרשימה', { name: c.name, nearby: c.nearby, stores: st, n: c.deals });
    }
    chains.append(el('li', line, c.error ? 'warn' : c.nearby === 0 || c.skipped ? 'muted' : ''));
  }
  body.append(chains);

  body.append(el('h4', t('מוצרים')));
  const items = el('ul', '', 'report-list');
  const abroad = p.countryCode && p.countryCode !== 'IL';
  for (const it of R.items) {
    let line = `${foodIcon(it.text)} ${it.text}`;
    if (it.term && it.term !== it.text) line += `${t(' → חיפוש ״{term}״', { term: it.term })}${it.how === 'online' ? t(' (תרגום אוטומטי – אם הוא שגוי, אפשר לתקן עם |)') : it.how === 'manual' ? t(' (תרגום ידני)') : ''}`;
    if (it.offers != null) line += t(' · {n} תוצאות בעלונים', { n: it.offers });
    line += ` · ${it.found ? t('{n} מבצעים בתוקף', { n: it.found }) : t('אין מבצע כרגע')}`;
    const li = el('li', line);
    if (it.error) li.append(el('div', t('שגיאה: {err}', { err: it.error }), 'warn small'));
    else if (abroad && it.offers != null && !it.translated && !/[a-zà-ÿ]/i.test(it.term || '')) {
      li.append(el('div', t('לא תורגם לשפה המקומית. אפשר להוסיף תרגום ידני: למשל ״חלב | Milch״'), 'muted small'));
    }
    items.append(li);
  }
  body.append(items);
}

function renderList() {
  $('#items').replaceChildren(...S.list.map((it, i) => {
    const li = document.createElement('li');
    const icon = Object.assign(document.createElement('span'), { className: 'food', textContent: foodIcon(it.text), ariaHidden: 'true' });
    const inp = Object.assign(document.createElement('input'), { value: it.text, ariaLabel: t('מוצר') });
    inp.addEventListener('input', () => (icon.textContent = foodIcon(inp.value)));
    inp.addEventListener('change', () => {
      const items = S.list.map((x) => x.text);
      items[i] = inp.value;
      saveList(items);
    });
    const del = Object.assign(document.createElement('button'), { textContent: '✕', title: t('מחיקה') });
    del.addEventListener('click', () => saveList(S.list.filter((_, j) => j !== i).map((x) => x.text)));
    li.append(icon, inp, del);
    return li;
  }));
}

function renderFamily() {
  $('#familyCard').hidden = false;
  const L = S.limits;
  const canInvite = S.me.admin || L.membersCanInvite;
  const left = Math.max(L.maxUsers - L.count, 0);
  $('#addUser').hidden = !canInvite || !left;
  $('#limitsBox').hidden = !S.me.admin;
  $('#membersCanInvite').checked = L.membersCanInvite;
  if (document.activeElement !== $('#maxUsers')) $('#maxUsers').value = L.maxUsers;
  $('#maxUsersSave').disabled = Number($('#maxUsers').value) === L.maxUsers;
  $('#limitsInfo').textContent = !canInvite
    ? t('הזמנת משתמשים חדשים נעשית דרך מנהל האפליקציה.')
    : left ? t('באפליקציה {count} משתמשים מתוך {max} אפשריים (נשארו {left}).', { count: L.count, max: L.maxUsers, left }) : `${t('הגעתם למספר המשתמשים המקסימלי ({max}).', { max: L.maxUsers })}${S.me.admin ? t(' אפשר להגדיל אותו למעלה.') : ''}`;
  $('#newHouseholdWrap').hidden = !S.me.admin;
  $('#newUserPassWrap').hidden = S.emailLogin;
  $('#newUserEmail').required = S.emailLogin;
  $('#newUserPass').required = !S.emailLogin;
  $('#inviteHint').textContent = t(S.emailLogin
    ? 'אחרי ההוספה שלחו לו את הקישור לאפליקציה. הוא ייכנס עם המייל שלו, בקוד שיישלח אליו.'
    : 'אחרי ההוספה שלחו לו את הקישור לאפליקציה, את השם ואת הסיסמה. אחרי הכניסה הוא יוכל להחליף את הסיסמה בעצמו.');
  // משתמש רגיל יכול להוסיף רק בן בית למשק הבית שלו
  $('#shareHousehold').disabled = !S.me.admin;
  if (!S.me.admin) { $('#shareHousehold').checked = true; $('#newHousehold').checked = false; }
  $('#appUrl').textContent = location.origin;
  $('#family').replaceChildren(...S.users.map((u) => {
    const li = document.createElement('li');
    const who = Object.assign(document.createElement('span'), { className: 'who' });
    who.append(Object.assign(document.createElement('b'), { textContent: u.name }));
    who.append(Object.assign(document.createElement('span'), {
      className: 'muted small',
      textContent: ` ${t(u.household === S.me.household ? '· 🏠 משק הבית שלך' : '· משק בית אחר')}${u.admin ? t(' · מנהל') : ''}${u.location ? ` · 📍 ${u.location}` : t(' · עוד לא נכנס')}${S.me.admin ? ` · ${u.email ? `📧 ${u.email}` : t('📧 אין מייל')}` : ''}`,
    }));
    li.append(who);
    if (!S.me.admin) return li; // ניהול סיסמאות ומחיקה – למנהל בלבד
    const emailBtn = Object.assign(document.createElement('button'), { textContent: t('📧 מייל') });
    emailBtn.addEventListener('click', async () => {
      const e = prompt(t('המייל של {name} (איתו הוא נכנס לאפליקציה):', { name: u.name }), u.email || '');
      if (!e) return;
      try { S = await api('PUT', `/api/users/${encodeURIComponent(u.name)}/email`, { email: e.trim() }); render(); } catch (ex) { alert(ex.message); }
    });
    const reset = Object.assign(document.createElement('button'), { textContent: t('סיסמה חדשה') });
    reset.addEventListener('click', async () => {
      const p = prompt(t('סיסמה חדשה עבור {name} (לפחות 6 תווים):', { name: u.name }));
      if (!p) return;
      try { S = await api('PUT', `/api/users/${encodeURIComponent(u.name)}/password`, { password: p }); render(); toast(t('הסיסמה של {name} עודכנה', { name: u.name })); } catch (e) { alert(e.message); }
    });
    const acts = Object.assign(document.createElement('span'), { className: 'acts' });
    acts.append(S.emailLogin ? emailBtn : reset);
    if (u.name !== S.me.name) {
      const mine = u.household === S.me.household;
      const hh = Object.assign(document.createElement('button'), { textContent: t(mine ? 'הפרדה ממשק הבית שלי' : 'צירוף למשק הבית שלי') });
      hh.addEventListener('click', async () => {
        const q = t(mine
          ? 'להפריד את {name} ממשק הבית שלך? רשימת ״חסר בבית״ שלך תישאר אצלך, ו{name} יקבל רשימה ריקה משלו.'
          : 'לצרף את {name} למשק הבית שלך? הוא יראה ויעדכן את רשימת ״חסר בבית״ שלך.', { name: u.name });
        if (!confirm(q)) return;
        try { S = await api('PUT', `/api/users/${encodeURIComponent(u.name)}/household`, { join: !mine }); render(); } catch (e) { alert(e.message); }
      });
      acts.append(hh);
    }
    li.append(acts);
    if (u.name !== S.me.name) {
      const del = Object.assign(document.createElement('button'), { textContent: t('מחיקה') });
      del.addEventListener('click', async () => {
        if (!confirm(t('למחוק את החשבון של {name}? הרשימה וההגדרות שלו יימחקו.', { name: u.name }))) return;
        try { S = await api('DELETE', `/api/users/${encodeURIComponent(u.name)}`); render(); } catch (e) { alert(e.message); }
      });
      acts.append(del);
    }
    return li;
  }));
}

$('#membersCanInvite').addEventListener('change', async (e) => { S = await api('PUT', '/api/limits', { membersCanInvite: e.target.checked }); render(); });
// מספר המשתמשים המקסימלי: נשמר בלחיצה על ״שמירה״ (או Enter)
$('#maxUsers').addEventListener('input', () => {
  $('#maxUsersSave').disabled = !$('#maxUsers').value || Number($('#maxUsers').value) === S.limits.maxUsers;
  $('#maxUsersSaved').hidden = true;
});
$('#maxUsersForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    S = await api('PUT', '/api/limits', { maxUsers: Number($('#maxUsers').value) });
    $('#maxUsers').blur();
    render();
    $('#maxUsersSaved').hidden = false;
    setTimeout(() => ($('#maxUsersSaved').hidden = true), 4000);
  } catch (ex) { alert(ex.message); }
});

// ״משק בית נפרד״ ו״שיתוף עם בן בית נוסף״ – בדיוק אחת מהן מסומנת
$('#newHousehold').addEventListener('change', (e) => { $('#shareHousehold').checked = !e.target.checked; });
$('#shareHousehold').addEventListener('change', (e) => { if (S.me.admin) $('#newHousehold').checked = !e.target.checked; else e.target.checked = true; });

$('#addUser').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    S = await api('POST', '/api/users', { name: $('#newUserName').value, password: S.emailLogin ? undefined : $('#newUserPass').value, newHousehold: $('#newHousehold').checked, email: $('#newUserEmail').value.trim() });
    toast(t('{name} נוסף/ה', { name: $('#newUserName').value }));
    $('#addUser').reset();
    $('#shareHousehold').checked = true;
    render();
  } catch (ex) { alert(ex.message); }
});

$('#emailBanner').addEventListener('click', () => { showTab('settings'); $('#myEmail').closest('details').open = true; $('#myEmail').focus(); });
$('#emailForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const email = $('#myEmail').value.trim();
    if (S.emailLogin && email !== S.me.email && !confirm(t('מעכשיו תיכנסו לאפליקציה עם {email}. לוודא שהכתובת נכונה?', { email }))) return;
    S = await api('PUT', '/api/me/email', { email });
    render();
    $('#emailSaved').hidden = false;
    setTimeout(() => ($('#emailSaved').hidden = true), 3000);
  } catch (ex) { alert(ex.message); }
});

$('#passForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  if ($('#passNew').value !== $('#passNew2').value) return alert(t('הסיסמאות החדשות לא זהות'));
  try {
    await api('PUT', '/api/password', { current: $('#passCur').value, next: $('#passNew').value });
    $('#passForm').reset();
    $('#passForm').closest('details').open = false;
    toast(t('הסיסמה הוחלפה ✔ שאר המכשירים יתבקשו להיכנס מחדש'));
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

// מחיקת החשבון שלי (למשתמש שאינו המנהל)
$('#deleteMe').addEventListener('click', async () => {
  if (!confirm(t('למחוק את החשבון לצמיתות? אי אפשר לבטל את זה.'))) return;
  try {
    try { const reg = await navigator.serviceWorker?.ready; await (await reg?.pushManager.getSubscription())?.unsubscribe(); } catch { /* */ }
    await api('DELETE', '/api/me');
    token = '';
    store.set('session', '');
    S = null;
    showLogin();
    alert(t('החשבון נמחק.'));
  } catch (e) { alert(e.message); }
});

// ---------- נתוני שימוש (למנהל) ----------
const EVENT_NAMES = { // מתורגם בתצוגה
  deal_click: 'לחיצות על מבצעים', notification: 'התראות שנשלחו', home_add: 'פריטים שנוספו ל״חסר בבית״',
  home_bought: 'פריטים שסומנו כנקנו', scan: 'סריקות', signup: 'משתמשים חדשים',
};
async function loadStats() {
  let m;
  try { m = await api('GET', '/api/metrics?days=30'); } catch { return; }
  const n = (x) => (x || 0).toLocaleString(LOCALE);
  const tiles = [
    ['רשומים', m.registered], ['משקי בית', m.households], ['פעילים היום', m.active.today],
    ['פעילים ב-7 ימים', m.active.week], ['פעילים ב-30 יום', m.active.month],
    ...Object.entries(EVENT_NAMES).map(([k, label]) => [label, m.totals[k]]),
  ].map(([label, v]) => [t(label), v]);
  $('#kpis').replaceChildren(...tiles.map(([label, v]) => {
    const t = document.createElement('div');
    t.className = 'kpi';
    t.append(Object.assign(document.createElement('b'), { textContent: n(v) }), Object.assign(document.createElement('span'), { textContent: label }));
    return t;
  }));
  renderActiveChart(m.series);
  const rows = m.chains.slice(0, 20);
  const tr = (cells, tag = 'td') => {
    const r = document.createElement('tr');
    r.append(...cells.map((c) => Object.assign(document.createElement(tag), { textContent: c })));
    return r;
  };
  $('#chainStats').replaceChildren(
    tr([t('רשת'), t('מבצעים שהוצגו'), t('לחיצות')], 'th'),
    ...(rows.length ? rows.map((c) => tr([c.name, n(c.shown), n(c.clicks)])) : [tr([t('עוד אין נתונים'), '', ''])]),
  );
}
// גרף עמודות: משתמשים פעילים בכל יום. ריחוף/נגיעה בעמודה מציגים את התאריך והמספר
function renderActiveChart(series) {
  const box = $('#activeChart');
  const max = Math.max(1, ...series.map((d) => d.active));
  const day = (k) => new Date(k + 'T12:00').toLocaleDateString(LOCALE, { day: 'numeric', month: 'numeric' });
  const tip = Object.assign(document.createElement('div'), { className: 'tip', hidden: true });
  const plot = Object.assign(document.createElement('div'), { className: 'plot' });
  for (const d of series) {
    const col = document.createElement('div');
    col.className = 'col';
    col.tabIndex = 0;
    const bar = Object.assign(document.createElement('i'), {});
    bar.style.height = `${(d.active / max) * 100}%`;
    col.append(bar);
    col.setAttribute('aria-label', t('{day}: {n} פעילים', { day: day(d.date), n: d.active }));
    const show = () => {
      tip.textContent = t('{day} · {n} פעילים', { day: day(d.date), n: d.active });
      tip.hidden = false;
      const r = col.getBoundingClientRect(), b = box.getBoundingClientRect();
      tip.style.left = `${Math.min(Math.max(r.left - b.left + r.width / 2, 50), b.width - 50)}px`;
      col.classList.add('on');
    };
    const hide = () => { tip.hidden = true; col.classList.remove('on'); };
    col.addEventListener('pointerenter', show);
    col.addEventListener('pointerleave', hide);
    col.addEventListener('focus', show);
    col.addEventListener('blur', hide);
    plot.append(col);
  }
  const axis = Object.assign(document.createElement('div'), { className: 'axis muted small' });
  axis.append(Object.assign(document.createElement('span'), { textContent: day(series[0].date) }), Object.assign(document.createElement('span'), { textContent: day(series[series.length - 1].date) }));
  const top = Object.assign(document.createElement('div'), { className: 'ymax muted small', textContent: t('עד {max}', { max }) });
  box.setAttribute('aria-label', t('משתמשים פעילים ב-30 הימים האחרונים, מקסימום {max} ביום', { max }));
  box.replaceChildren(top, plot, axis, tip);
}
$('#statsRefresh').addEventListener('click', loadStats);
$('#statsCsv').addEventListener('click', async () => {
  try {
    const res = await fetch('/api/metrics.csv', { headers: { 'x-app-token': token } });
    if (!res.ok) throw new Error(t('ההורדה נכשלה'));
    const url = URL.createObjectURL(await res.blob());
    const a = Object.assign(document.createElement('a'), { href: url, download: `usage-${new Date().toISOString().slice(0, 10)}.csv` });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  } catch (e) { alert(e.message); }
});

// ---------- אישור תנאי שימוש ----------
$('#termsOk').addEventListener('change', (e) => { $('#termsAccept').disabled = !e.target.checked; });
$('#termsDlg').addEventListener('cancel', (e) => e.preventDefault()); // אי אפשר לדלג
$('#termsForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try { S = await api('POST', '/api/terms/accept'); $('#termsDlg').close(); render(); } catch (ex) { alert(ex.message); }
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

// חלון פרטי המבצעים על פריט מ״חסר בבית״, עם קישור לבדיקה
function openDealSheet(text) {
  const ds = dealsFor(text);
  $('#sheetTitle').textContent = `${foodIcon(text)} ${t('מבצעים על ״{item}״', { item: text })}`;
  $('#sheetBody').replaceChildren(...ds.map(dealCard));
  $('#dealSheet').showModal();
  track('deal_sheet');
}
$('#sheetClose').addEventListener('click', () => $('#dealSheet').close());
$('#dealSheet').addEventListener('click', (e) => { if (e.target === $('#dealSheet')) $('#dealSheet').close(); });

function renderHome() {
  // השוואת מחיר העגלה אפשרית רק בישראל (רק שם יש מחירון מלא לכל סניף)
  const cc = S.location?.place?.countryCode;
  $('#cartAbroad').hidden = !cc || cc === 'IL';
  const items = [...(S.home || [])].sort((a, b) => a.done - b.done);
  const open = items.filter((x) => !x.done).length;
  $('#homeCount').hidden = !open;
  $('#homeCount').textContent = open;
  const others = S.users.filter((u) => u.household === S.me.household && u.name !== S.me.name).map((u) => u.name);
  $('#homeShared').textContent = others.length ? t('🏠 משותף עם: {names}', { names: others.join(', ') }) : t('🏠 כרגע רק את/ה ברשימה הזו. אפשר לשתף בני בית בהגדרות ← ״בני הבית״.');
  $('#homeEmpty').hidden = items.length > 0;
  $('#homeActions').hidden = !items.some((x) => x.done);
  const watched = new Set(S.list.map((x) => plain(x.text)));

  $('#homeList').replaceChildren(...items.map((it) => {
    const li = document.createElement('li');
    li.className = 'homeitem' + (it.done ? ' done' : '');
    const toggle = Object.assign(document.createElement('button'), { className: 'check', ariaLabel: t(it.done ? 'סימון כלא נקנה' : 'סימון כנקנה'), textContent: it.done ? '✔' : '' });
    const body = Object.assign(document.createElement('span'), { className: 'hbody' });
    body.append(Object.assign(document.createElement('span'), { className: 'food', textContent: foodIcon(it.text) }));
    const txt = Object.assign(document.createElement('span'), { className: 'htext' });
    txt.append(Object.assign(document.createElement('span'), { textContent: it.text }));
    const meta = [it.by && it.by !== S.me.name ? t('הוסיף/ה {name}', { name: it.by }) : '', it.done && it.doneBy ? t('נקנה ע״י {name}', { name: it.doneBy }) : ''].filter(Boolean).join(' · ');
    if (meta) txt.append(Object.assign(document.createElement('small'), { className: 'muted', textContent: meta }));
    const d = !it.done && dealFor(it.text);
    if (d) {
      const n = dealsFor(it.text).length;
      const sale = Object.assign(document.createElement('button'), {
        type: 'button',
        className: 'onsale',
        textContent: `${t('🏷️ במבצע: {price} ב{chain}', { price: d.promoPrice != null ? `${d.minQty > 1 ? t('{n} ב-', { n: d.minQty }) : ''}${money(d.promoPrice, d.currency)}` : d.description, chain: d.chain })}${n > 1 ? t(' (ועוד {n})', { n: n - 1 }) : ''}${t(' · פרטים וקישור ‹')}`,
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
    if (!watched.has(plain(it.text))) {
      const star = Object.assign(document.createElement('button'), { className: 'mini', textContent: '⭐', title: t('להוסיף לרשימה לחיפוש מבצעים') });
      star.addEventListener('click', async () => {
        await saveList([...S.list.map((x) => x.text), it.text]);
        toast(t('״{item}״ נוסף לרשימה לחיפוש מבצעים', { item: it.text }));
      });
      li.append(star);
    }
    const del = Object.assign(document.createElement('button'), { className: 'mini', textContent: '✕', title: t('מחיקה') });
    del.addEventListener('click', async () => {
      const index = S.home.findIndex((x) => x.id === it.id);
      Object.assign(S, await api('DELETE', `/api/home/${it.id}`));
      renderHome();
      offerUndo(t('״{item}״ נמחק מהרשימה', { item: it.text }), [{ item: it, index }]);
    });
    li.append(del);
    return li;
  }));
}

// פריט שכבר ברשימה: אזהרה כבר בזמן ההקלדה, והודעה אחרי ההוספה
const sameItem = (a, b) => {
  const n = (s) => String(s).replace(/[׳'"״.,]/g, '').replace(/\s+/g, ' ').trim().toLowerCase().replace(/^ה(?=[\u05D0-\u05EA]{2})/, '');
  return n(a) === n(b);
};
const whoAdded = (x) => (x.by && x.by !== S.me.name ? t(' (הוסיף/ה {name})', { name: x.by }) : x.by ? t(' (הוספת בעצמך)') : '');

function showDuplicates(dups) {
  const hint = $('#dupHint');
  hint.hidden = !dups.length;
  if (!dups.length) return;
  hint.textContent = dups.length === 1
    ? t('ℹ️ ״{item}״ כבר ברשימה{who}', { item: dups[0].text, who: whoAdded(dups[0]) })
    : t('ℹ️ כבר ברשימה: {items}', { items: dups.map((d) => `״${d.text}״`).join(', ') });
}

$('#homeItem').addEventListener('input', () => {
  const open = (S.home || []).filter((x) => !x.done);
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
    const dupText = r.duplicates.length === 1 ? t('״{item}״ כבר ברשימה ולא נוסף שוב', { item: r.duplicates[0].text }) : t('{n} פריטים כבר ברשימה ולא נוספו שוב', { n: r.duplicates.length });
    const addedText = added === 1 ? t('נוסף פריט אחד') : t('נוספו {n} פריטים', { n: added });
    toast(added ? `${addedText}. ${dupText}` : (r.duplicates.length === 1 ? dupText : t('כל הפריטים כבר ברשימה')));
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
  track('copy_link');
  $('#copyLink').textContent = t('✔ הועתק');
  setTimeout(() => ($('#copyLink').textContent = t('📋 העתקת הקישור')), 2000);
});
if (navigator.share) {
  $('#shareLink').hidden = false;
  $('#shareLink').classList.add(/iPhone|iPad|Macintosh/.test(navigator.userAgent) ? 'is-ios' : 'is-other');
  $('#shareLink').addEventListener('click', () => navigator.share({ title: t('הקניות שלי'), text: t('הצטרפות לאפליקציה ״הקניות שלי״:'), url: location.origin }).then(() => track('share_link'), () => {}));
}

// ---------- הכתבה (דיבור ← פריטים) ----------
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
const STOP_WORDS = new Set(['نحتاج', 'لازم', 'بدنا', 'شراء', 'اشتري', 'كمان', 'أيضا', 'من فضلك', 'צריך', 'צריכים', 'צריכה', 'לקנות', 'תקנה', 'תקנו', 'חסר', 'חסרה', 'חסרים', 'גם', 'וגם', 'עוד', 'בבקשה', 'ו',
  'wir', 'brauchen', 'brauche', 'kaufen', 'bitte', 'noch', 'auch', 'we', 'need', 'buy', 'please', 'some', 'also']);
const JOINERS = new Set(['und', 'and', 'oder', 'or', 'و']); // ״Milch und Brot״ ← שני פריטים
const COMPOUNDS = ['שמן זית', 'שמן קנולה', 'בשר טחון', 'חזה עוף', 'שוקי עוף', 'נייר טואלט', 'מגבות נייר', 'אבקת כביסה', 'נוזל כלים',
  'משחת שיניים', 'תפוחי אדמה', 'גבינה צהובה', 'גבינה לבנה', 'גבינה בולגרית', 'שמנת חמוצה', 'דגני בוקר', 'שיבולת שועל', 'חמאת בוטנים',
  'מזון לחתולים', 'מזון לכלבים', 'מיץ תפוזים', 'לחם אחיד', 'שוקולד חלב', 'מים מינרליים', 'נייר כסף', 'שקיות זבל'];
const isProduct = (w) => foodIcon(w) !== '🛒';

// ״חלב לחם וביצים״ ← ['חלב', 'לחם', 'ביצים']. הפרדה לפי ו' החיבור (או und/and) ולפי שמות מוצרים מוכרים, בלי לשבור צירופים כמו ״שמן זית״.
function splitSpoken(text) {
  const items = [];
  let cur = [];
  const push = () => { if (cur.length) items.push(cur.join(' ')); cur = []; };
  for (const w of text.replace(/[.,،;]/g, ' , ').split(/\s+/).filter(Boolean)) {
    if (w === ',' || JOINERS.has(w.toLowerCase())) { push(); continue; }
    if (STOP_WORDS.has(w.toLowerCase())) continue;
    let word = w;
    let conj = false;
    if (/^ו[\u05D0-\u05EA]{2,}/.test(w) && !/^(וניל|ופל|וופל|וודקה|ויטמין|וואפל)/.test(w)) { conj = true; word = w.slice(1); }
    else if (/^و[\u0621-\u064A]{2,}/.test(w) && !/^(ورق|وجبة|وافل)/.test(w)) { conj = true; word = w.slice(1); } // و בערבית
    const phrase = cur.length ? `${cur[cur.length - 1]} ${word}` : '';
    const compound = phrase && COMPOUNDS.some((c) => c === phrase || c.startsWith(phrase + ' '));
    if (cur.length && !compound && (conj || (/[א-ת\u0600-\u06FF]/.test(word) && isProduct(word) && cur.some(isProduct)))) push();
    cur.push(word);
  }
  push();
  return items;
}

// אייקון מיקרופון ליד שדה הוספה. במכשיר שלא תומך בהכתבה האייקון לא מופיע
// (אפשר להשתמש במיקרופון של המקלדת בטלפון).
function dictation(btn, input, hintEl, example) {
  if (!SR) return;
  btn.hidden = false;
  let rec = null;
  btn.addEventListener('click', () => {
    if (rec) return rec.stop();
    rec = new SR();
    track('dictation');
    rec.lang = SPEECH[LANG];
    rec.interimResults = true;
    rec.continuous = false;
    const before = input.value.trim();
    btn.classList.add('live');
    btn.textContent = '⏹';
    hintEl.textContent = t(example);
    rec.onresult = (e) => {
      const said = [...e.results].map((r) => r[0].transcript).join(' ');
      input.value = [before, splitSpoken(said).join(', ')].filter(Boolean).join(', ');
    };
    rec.onerror = (e) => { hintEl.textContent = e.error === 'not-allowed' ? t('צריך לאשר גישה למיקרופון') : t('ההכתבה נכשלה ({err})', { err: e.error }); };
    rec.onend = () => {
      rec = null;
      btn.classList.remove('live');
      btn.textContent = '🎤';
      if (input.value.trim() !== before) {
        hintEl.textContent = t('בדקו את הפריטים ותקנו אם צריך, ואז ״הוספה״');
        input.focus();
      }
    };
    rec.start();
  });
}
dictation($('#mic'), $('#homeItem'), $('#voiceHint'), 'אמרו מה חסר, למשל: ״חלב, לחם וביצים״');
dictation($('#micList'), $('#newItem'), $('#listHint'), 'אמרו אילו מוצרים להוסיף, למשל: ״חלב, קפה ושמן זית״');

// ---------- הוספה מצילום: קריאת ברקוד מתמונה (מצלמה, גלריה או קובץ מהמחשב) ----------
// הברקוד נקרא במכשיר עצמו. אם הדפדפן יודע לקרוא ברקודים (BarcodeDetector) – משתמשים בו,
// ואחרת בספריית ZXing שהשרת מגיש. את שם המוצר מחפשים במאגר החופשי Open Food Facts.
const loadScript = (src) => new Promise((ok, fail) => {
  if (document.querySelector(`script[src="${src}"]`)) return ok();
  document.head.append(Object.assign(document.createElement('script'), { src, onload: ok, onerror: fail }));
});

async function imageToCanvas(file, max, rotate = false) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((ok, fail) => Object.assign(new Image(), { onload() { ok(this); }, onerror: fail, src: url }));
    const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.round(img.naturalWidth * k), h = Math.round(img.naturalHeight * k);
    const c = Object.assign(document.createElement('canvas'), { width: rotate ? h : w, height: rotate ? w : h });
    const g = c.getContext('2d', { willReadFrequently: true });
    if (rotate) { g.translate(h, 0); g.rotate(Math.PI / 2); }
    g.drawImage(img, 0, 0, w, h);
    return c;
  } finally { URL.revokeObjectURL(url); }
}

const BARCODE_FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128'];
async function readBarcode(file) {
  if ('BarcodeDetector' in window) {
    try {
      const det = new BarcodeDetector({ formats: BARCODE_FORMATS });
      const [hit] = await det.detect(await imageToCanvas(file, 2000));
      if (hit?.rawValue) return hit.rawValue;
    } catch { /* ננסה בספרייה */ }
  }
  await loadScript('/vendor/zxing.min.js');
  const Z = window.ZXing;
  const hints = new Map([[Z.DecodeHintType.TRY_HARDER, true], [Z.DecodeHintType.POSSIBLE_FORMATS,
    [Z.BarcodeFormat.EAN_13, Z.BarcodeFormat.EAN_8, Z.BarcodeFormat.UPC_A, Z.BarcodeFormat.UPC_E, Z.BarcodeFormat.CODE_128]]]);
  const reader = new Z.MultiFormatReader();
  reader.setHints(hints);
  // כמה ניסיונות: גדלים שונים, וגם מסובב (ברקוד שצולם לאורך)
  for (const [max, rotate] of [[1600, false], [1000, false], [2400, false], [1600, true], [1000, true]]) {
    try {
      const c = await imageToCanvas(file, max, rotate);
      const bmp = new Z.BinaryBitmap(new Z.HybridBinarizer(new Z.HTMLCanvasElementLuminanceSource(c)));
      return reader.decode(bmp).getText();
    } catch { /* לא נמצא בניסיון הזה */ }
  }
  return null;
}

function photoInput(fileInput, input, hintEl, forList) {
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    fileInput.value = '';
    if (!file) return;
    track('photo');
    hintEl.textContent = t('📷 מחפש ברקוד בתמונה…');
    let code = null;
    try { code = await readBarcode(file); } catch { /* */ }
    if (!code || !/^\d{6,14}$/.test(code)) {
      hintEl.textContent = t('לא נמצא ברקוד בתמונה. צלמו את הברקוד של המוצר מקרוב, ישר ובאור טוב.');
      return;
    }
    let name = null;
    try { ({ name } = await api('GET', `/api/product/${code}`)); } catch { /* */ }
    const add = (v) => { input.value = [input.value.trim(), v].filter(Boolean).join(', '); };
    if (name) {
      add(forList ? `${name} | ${code}` : name);
      hintEl.textContent = t('📷 נמצא: {name}. בדקו ותקנו אם צריך, ואז ״הוספה״', { name });
    } else if (forList) {
      add(code);
      hintEl.textContent = t('📷 נמצא ברקוד {code}, אבל שם המוצר לא ידוע. אפשר להוסיף שם לפני הברקוד, למשל: ״קפה | {code}״', { code });
    } else {
      hintEl.textContent = t('📷 נמצא ברקוד {code}, אבל שם המוצר לא ידוע. כתבו את השם בשדה.', { code });
    }
    input.focus();
  });
}
for (const [id, input, hint, forList] of [['photoHome', '#homeItem', '#voiceHint', false], ['photoList', '#newItem', '#listHint', true]]) {
  photoInput($(`#${id}`), $(input), $(hint), forList); // מהגלריה / מהמחשב
  photoInput($(`#${id}Cam`), $(input), $(hint), forList); // צילום עכשיו
}
// כפתור 📷 פותח תפריט קטן: ״צילום עכשיו״ או ״מהגלריה או מהמחשב״
document.querySelectorAll('.photo-wrap').forEach((w) => {
  const btn = w.querySelector('.photo-btn');
  const menu = w.querySelector('.photo-menu');
  const close = () => { menu.hidden = true; btn.setAttribute('aria-expanded', 'false'); };
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    menu.hidden = !menu.hidden;
    btn.setAttribute('aria-expanded', String(!menu.hidden));
  });
  menu.addEventListener('change', close);
  document.addEventListener('click', (e) => { if (!w.contains(e.target)) close(); });
});

// ביטול מחיקה: אחרי מחיקה מופיע כפתור ״ביטול״ שמחזיר את הפריטים למקומם
function offerUndo(msg, entries) {
  toast(msg, {
    label: t('↩ ביטול'),
    async run() {
      Object.assign(S, await api('POST', '/api/home/restore', { items: entries }));
      renderHome();
      toast(entries.length === 1 ? t('״{item}״ הוחזר לרשימה', { item: entries[0].item.text }) : t('{n} פריטים הוחזרו לרשימה', { n: entries.length }));
    },
  });
}

$('#clearDone').addEventListener('click', async () => {
  const entries = S.home.map((item, index) => ({ item, index })).filter((e) => e.item.done);
  Object.assign(S, await api('POST', '/api/home/clear-done'));
  renderHome();
  offerUndo(entries.length === 1 ? t('פריט אחד שנקנה נמחק מהרשימה') : t('{n} פריטים שנקנו נמחקו מהרשימה', { n: entries.length }), entries);
});

// סנכרון עם בני הבית: בזמן שהרשימה פתוחה מתעדכנים כל כמה שניות
async function refreshHome() {
  if (!S || document.visibilityState !== 'visible') return;
  try { Object.assign(S, await api('GET', '/api/home')); renderHome(); } catch { /* */ }
}
setInterval(() => { if (!$('#tab-home').hidden) refreshHome(); }, 10000);
document.addEventListener('visibilitychange', refreshHome);
document.querySelector('nav [data-tab=home]').addEventListener('click', refreshHome);

// ---------- השוואת מחיר העגלה בין סניפים ----------
let cartStores = [];
let cartSel = [];
let cartMax = 12;
const storeKey = (s) => `${s.chain}|${s.storeId}`;
// רשימת סניפים עם תיבות סימון (משותף ל„הסניפים שלי” ולהשוואת העגלה)
function storeList(box, stores, sel, max, onChange) {
  box.replaceChildren(...stores.map((s) => {
    const on = sel.some((x) => storeKey(x) === storeKey(s));
    const l = document.createElement('label');
    l.className = 'cart-store' + (on ? ' on' : '');
    const cb = Object.assign(document.createElement('input'), { type: 'checkbox', checked: on, disabled: !on && sel.length >= max });
    cb.addEventListener('change', () => onChange(cb.checked ? [...sel, s] : sel.filter((x) => storeKey(x) !== storeKey(s))));
    const txt = document.createElement('span');
    txt.append(Object.assign(document.createElement('b'), { textContent: `${s.chainName} · ${s.name}` }),
      Object.assign(document.createElement('small'), { className: 'muted', textContent: s.km == null ? ` ${t('🛒 אונליין · משלוח עד הבית')}` : ` ${s.km} ${t('ק"מ')}${s.address ? ` · ${s.address}` : ''}${s.web ? t(' · מבצעים בלבד') : ''}` }));
    l.append(cb, txt);
    return l;
  }));
}
function renderCartPick() {
  $('#cartPickInfo').textContent = t('נבחרו {n} מתוך {max}', { n: cartSel.length, max: cartMax });
  $('#cartGo').disabled = !cartSel.length;
  storeList($('#cartStores'), cartStores, cartSel, cartMax, (sel) => { cartSel = sel; renderCartPick(); });
}
async function runCompare() {
  const b = $('#cartGo');
  b.disabled = true;
  b.textContent = t('בודק מחירים בסניפים… (עד דקה)');
  $('#cartPickInfo').textContent = t('בודק מחירים בסניפים… (עד דקה)');
  try {
    renderCart(await api('POST', '/api/compare', { stores: cartSel }));
    track('cart_compare');
  } catch (e) { alert(e.message); } finally {
    b.disabled = !cartSel.length;
    b.textContent = t('השוואה');
  }
}
$('#cartBtn').addEventListener('click', async () => {
  $('#cartPick').hidden = false;
  $('#cartResult').hidden = true;
  $('#cartStores').replaceChildren();
  $('#cartPickInfo').className = 'small';
  $('#cartPickInfo').textContent = t('טוען את הסניפים באזור…');
  $('#cartGo').disabled = true;
  $('#cartDlg').showModal();
  try {
    const r = await api('GET', '/api/compare/stores');
    cartStores = r.stores.filter((s) => !s.web); // להשוואה צריך מחירון מלא
    cartMax = r.max;
    const pickFrom = (list) => list.map((x) => cartStores.find((s) => storeKey(s) === storeKey(x))).filter(Boolean);
    // ברירת מחדל: הסניפים שבחרת לבדיקת מבצעים; אחרת הבחירה הקודמת בהשוואה
    const mine = pickFrom(r.mine);
    cartSel = mine.length ? mine : pickFrom(r.selected);
    if (!cartStores.length) return ($('#cartPickInfo').textContent = t('לא נמצאו סניפים ברדיוס החיפוש. אפשר להגדיל את הרדיוס בהגדרות.'));
    renderCartPick();
    if (mine.length) runCompare(); // יש „סניפים שלי” – משווים מיד
  } catch (e) {
    $('#cartPickInfo').textContent = e.message;
    $('#cartPickInfo').className = 'note-warn';
  }
});

// ---------- „הסניפים שלי”: באילו סניפים לבדוק מבצעים ----------
let myAll = [];
let mySel = [];
function renderMyStoresInfo() {
  const n = (S.myStores || []).length;
  $('#myStoresInfo').textContent = n
    ? t('נבדקים מבצעים ב-{n} סניפים שבחרת: {names}', { n, names: S.myStores.map((s) => `${s.chainName || ''} ${s.name}`.trim()).join(' · ') })
    : t('לא נבחרו סניפים – נבדקים 3 הסניפים הקרובים מכל רשת.');
}
function renderMyPick() {
  $('#myStoresCount').textContent = t('נבחרו {n} מתוך {max}', { n: mySel.length, max: cartMax });
  storeList($('#myStoresList'), myAll, mySel, cartMax, (sel) => { mySel = sel; renderMyPick(); });
}
$('#myStoresBtn').addEventListener('click', async () => {
  $('#myStoresList').replaceChildren();
  $('#myStoresCount').className = 'small';
  $('#myStoresCount').textContent = t('טוען את הסניפים באזור… (בפעם הראשונה זה יכול לקחת עד דקה)');
  $('#storesDlg').showModal();
  let first = true;
  // בפעם הראשונה השרת עוד מאתר סניפים על המפה: מציגים את מה שכבר נמצא, ומבקשים שוב כל כמה שניות
  while ($('#storesDlg').open) {
    try {
      const r = await api('GET', '/api/compare/stores');
      myAll = r.stores;
      cartMax = r.max;
      if (first) mySel = r.mine.map((x) => myAll.find((s) => storeKey(s) === storeKey(x))).filter(Boolean);
      else mySel = mySel.map((x) => myAll.find((s) => storeKey(s) === storeKey(x)) || x);
      first = false;
      if (myAll.length) renderMyPick();
      $('#myStoresLoading').hidden = !r.loading;
      if (!r.loading) {
        if (!myAll.length) $('#myStoresCount').textContent = t('לא נמצאו סניפים ברדיוס החיפוש. אפשר להגדיל את הרדיוס בהגדרות.');
        break;
      }
    } catch (e) {
      $('#myStoresCount').textContent = e.message;
      $('#myStoresCount').className = 'note-warn';
      $('#myStoresLoading').hidden = true;
      break;
    }
    await new Promise((res) => setTimeout(res, 4000));
  }
});
$('#myStoresSave').addEventListener('click', async () => {
  try {
    S = await api('PUT', '/api/mystores', { stores: mySel });
    $('#storesDlg').close();
    render();
    toast(t('נשמר ✔ בודק מבצעים בסניפים שבחרת…'));
  } catch (e) { alert(e.message); }
});
$('#myStoresClear').addEventListener('click', () => { mySel = []; renderMyPick(); });
$('#storesClose').addEventListener('click', () => $('#storesDlg').close());

$('#cartClose').addEventListener('click', () => $('#cartDlg').close());
$('#cartBack').addEventListener('click', () => { $('#cartResult').hidden = true; $('#cartPick').hidden = false; });
$('#cartGo').addEventListener('click', runCompare);
function renderCart(r) {
  $('#cartPick').hidden = true;
  $('#cartResult').hidden = false;
  const ok = r.stores.filter((s) => !s.error).sort((a, b) => a.commonTotal - b.commonTotal);
  $('#cartSummary').textContent = r.common === r.items.length
    ? t('כל {n} הפריטים נמצאו בכל הסניפים.', { n: r.items.length })
    : t('הסכום משווה {common} פריטים שנמצאו בכל הסניפים (מתוך {n}). פריטים שחסרים בסניף מסומנים ב-—.', { common: r.common, n: r.items.length });
  const cards = [...ok, ...r.stores.filter((s) => s.error)].map((s) => {
    const c = document.createElement('div');
    const best = storeKey(s) === r.cheapest;
    c.className = 'cart-card' + (best ? ' best' : '');
    c.append(Object.assign(document.createElement('div'), { className: 'cc-name', textContent: `${s.chainName} · ${s.name}` }));
    if (s.error) {
      c.append(Object.assign(document.createElement('div'), { className: 'warn small', textContent: t('לא הצלחנו לבדוק: {err}', { err: s.error }) }));
      return c;
    }
    c.append(Object.assign(document.createElement('div'), { className: 'cc-total', textContent: money(s.commonTotal) }));
    const extra = s.total !== s.commonTotal ? t(' · כל מה שנמצא: {total}', { total: money(s.total) }) : '';
    c.append(Object.assign(document.createElement('div'), { className: 'muted small', textContent: t('{found} מתוך {n} פריטים', { found: s.found, n: r.items.length }) + extra }));
    if (best && ok.length > 1) c.prepend(Object.assign(document.createElement('span'), { className: 'badge best-badge', textContent: t('🏆 הכי זול') }));
    return c;
  });
  $('#cartCards').replaceChildren(...cards);
  const tr = (cells, tag = 'td') => {
    const row = document.createElement('tr');
    for (const c of cells) {
      const cell = document.createElement(tag);
      if (c instanceof Node) cell.append(c); else cell.textContent = c;
      row.append(cell);
    }
    return row;
  };
  const head = tr([t('פריט'), ...ok.map((s) => {
    const h = document.createElement('span');
    h.append(s.chainName, Object.assign(document.createElement('small'), { className: 'muted', textContent: s.name }));
    return h;
  })], 'th');
  const rows = r.items.map((item) => {
    const prices = ok.map((s) => s.lines.find((l) => l.text === item)).map((l) => (l && !l.missing ? l.price : null));
    const min = Math.min(...prices.filter((p) => p != null));
    return tr([`${foodIcon(item)} ${item}`, ...ok.map((s, i) => {
      const l = s.lines.find((x) => x.text === item);
      const cell = document.createElement('span');
      if (!l || l.missing) { cell.textContent = '—'; cell.className = 'muted'; return cell; }
      cell.append(Object.assign(document.createElement('b'), { textContent: `${l.promo ? '🏷️ ' : ''}${money(l.price)}`, className: prices[i] === min && ok.length > 1 ? 'cheap' : '' }));
      cell.append(Object.assign(document.createElement('small'), { className: 'muted', textContent: l.name }));
      cell.title = l.name;
      return cell;
    })]);
  });
  $('#cartTable').replaceChildren(head, ...rows);
}

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
  if (confirm(t('להחליף את כל הרשימה הקיימת?'))) { saveList(splitItems($('#bulk').value)); $('#bulk').value = ''; }
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
  b.textContent = t('בודק מבצעים… (יכול לקחת כמה דקות)');
  try {
    const r = await api('POST', '/api/scan');
    S = r.state;
    render();
  } catch (e) {
    alert(e.message);
  } finally {
    b.disabled = false;
    b.textContent = t('בדיקת מבצעים עכשיו');
  }
});

// ---------- הגדרות ----------
// עדכון מיקום בלחיצה (ברירת המחדל): לוקחים את המיקום הנוכחי ובודקים מבצעים מחדש
function updateMyLocation() {
  if (!navigator.geolocation) return alert(t('הדפדפן לא תומך באיתור מיקום'));
  const btns = [$('#locBtn'), $('#gps')];
  btns.forEach((b) => { b.disabled = true; });
  $('#locBtn').textContent = t('📍 מאתר…');
  const done = () => { btns.forEach((b) => { b.disabled = false; }); $('#locBtn').textContent = t('📍 עדכון מיקום'); };
  navigator.geolocation.getCurrentPosition(
    async (p) => {
      try {
        const prev = S.lastScan;
        S = await api('PUT', '/api/settings', { lat: p.coords.latitude, lon: p.coords.longitude });
        render();
        toast(t('📍 המיקום עודכן: {place} – בודק מבצעים באזור…', { place: S.location.label }));
        waitForScan(prev);
      } catch (e) { alert(e.message); } finally { done(); }
    },
    (err) => { done(); alert(err.code === 1 ? t('צריך לאשר לאפליקציה גישה למיקום') : t('לא ניתן לקבל מיקום: ') + err.message); },
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

async function waitForScan(prev) {
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    const s = await api('GET', '/api/state');
    if (s.lastScan !== prev) { S = s; render(); toast(t('📍 {place}: נמצאו {n} מבצעים', { place: S.location.label, n: S.deals.length })); return; }
  }
}

let toastTimer;
// הודעה קצרה בתחתית המסך; action = { label, run } מוסיף כפתור (למשל ״ביטול״)
function toast(msg, action) {
  const t = $('#toast');
  t.replaceChildren(Object.assign(document.createElement('span'), { textContent: msg }));
  if (action) {
    const b = Object.assign(document.createElement('button'), { type: 'button', className: 'toast-action', textContent: action.label });
    b.addEventListener('click', async () => {
      t.hidden = true;
      try { await action.run(); } catch (e) { alert(e.message); }
    });
    t.append(b);
  }
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), action ? 10000 : 6000);
}


// ---------- התראות ----------
const b64ToBytes = (b64) => {
  const s = atob((b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
};

async function updatePushState() {
  const el = $('#pushState');
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    el.textContent = t(/iPhone|iPad/.test(navigator.userAgent)
      ? 'באייפון: קודם מוסיפים את האפליקציה למסך הבית ופותחים אותה משם.'
      : 'הדפדפן הזה לא תומך בהתראות.');
    $('#enablePush').hidden = true;
    return;
  }
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  el.textContent = t(sub ? 'ההתראות פעילות במכשיר הזה ✔' : Notification.permission === 'denied' ? 'ההתראות נחסמו בהגדרות הדפדפן.' : 'ההתראות כבויות במכשיר הזה.');
}

$('#enablePush').addEventListener('click', async () => {
  try {
    if ((await Notification.requestPermission()) !== 'granted') return updatePushState();
    const reg = await navigator.serviceWorker.ready;
    const sub = (await reg.pushManager.getSubscription()) ||
      (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(S.vapidKey) }));
    await api('POST', '/api/subscribe', sub.toJSON());
    updatePushState();
  } catch (e) { alert(t('הפעלת ההתראות נכשלה: ') + e.message); }
});
$('#testPush').addEventListener('click', () => api('POST', '/api/test-push'));

let installEvt;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvt = e; $('#install').hidden = false; });
$('#install').addEventListener('click', () => installEvt?.prompt());

// ---------- שפה ----------
$('#loginLang').replaceChildren(...Object.entries(LANGS).map(([k, name]) => Object.assign(document.createElement('option'), { value: k, textContent: `🌐 ${name}`, selected: k === LANG })));
$('#loginLang').addEventListener('change', (e) => setLang(e.target.value));
function setLang(l) {
  try { localStorage.setItem('lang', l); } catch { /* */ }
  location.reload();
}

// ---------- תפריט (☰): אודות, פרטיות, שפה, רענון ----------
const APP_VERSION = '2026.10.25';
$('#menuBtn').addEventListener('click', () => $('#menuDlg').showModal());
$('#menuClose').addEventListener('click', () => $('#menuDlg').close());
$('#menuDlg').addEventListener('click', (e) => { if (e.target === $('#menuDlg')) $('#menuDlg').close(); });
$('#menuLangs').replaceChildren(...Object.entries(LANGS).map(([k, name]) => {
  const b = Object.assign(document.createElement('button'), { type: 'button', textContent: name, className: k === LANG ? 'on' : '' });
  b.setAttribute('aria-pressed', String(k === LANG));
  b.addEventListener('click', async () => {
    if (k === LANG) return;
    if (S) await api('PUT', '/api/settings', { lang: k }).catch(() => {});
    setLang(k);
  });
  return b;
}));
// התקנה על המכשיר: נעלם כשהאפליקציה כבר מותקנת (נפתחת מהאייקון)
const isInstalled = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
$('#menuInstall').hidden = isInstalled();
window.addEventListener('appinstalled', () => { $('#menuInstall').hidden = true; $('#installHelp').hidden = true; });
$('#menuInstall').addEventListener('click', async () => {
  if (installEvt) {
    installEvt.prompt();
    const { outcome } = await installEvt.userChoice.catch(() => ({}));
    if (outcome === 'accepted') { $('#menuInstall').hidden = true; installEvt = null; }
    return;
  }
  // בלי חלון התקנה אוטומטי (למשל אייפון): הסבר קצר
  $('#installHelp').textContent = t(isIOS
    ? 'באייפון (Safari): כפתור השיתוף ← ״הוספה למסך הבית״.'
    : 'בתפריט הדפדפן ⋮ בוחרים ״התקנת אפליקציה״ או ״הוספה למסך הבית״.');
  $('#installHelp').hidden = !$('#installHelp').hidden;
});
// שיתוף האפליקציה עם אחרים
$('#menuShare').addEventListener('click', async () => {
  const data = { title: t('הקניות שלי'), text: t('הקניות שלי – מבצעים, רשימת קניות והשוואת מחירים:'), url: location.origin };
  if (navigator.share) {
    try { await navigator.share(data); track('share_link'); } catch { /* בוטל */ }
    return;
  }
  try { await navigator.clipboard.writeText(location.origin); toast(t('הקישור לאפליקציה הועתק ✔')); track('copy_link'); } catch { prompt(t('הקישור לאפליקציה:'), location.origin); }
});
$('#menuAbout').addEventListener('click', () => { $('#menuDlg').close(); $('#aboutDlg').showModal(); });
$('#aboutClose').addEventListener('click', () => $('#aboutDlg').close());
$('#settingsVersion').textContent = t('גרסה {v}', { v: APP_VERSION });
// רענון: מוחקים את העותק השמור של האפליקציה בטלפון וטוענים מחדש מהשרת
async function refreshApp() {
  try {
    for (const k of (await caches?.keys?.()) || []) await caches.delete(k);
    const reg = await navigator.serviceWorker?.getRegistration();
    await reg?.update();
  } catch { /* */ }
  location.reload();
}
$('#menuRefresh').addEventListener('click', () => { $('#menuRefresh').textContent = t('🔄 מרענן…'); refreshApp(); });
$('#refreshBtn').addEventListener('click', () => { $('#refreshBtn').classList.add('spin'); refreshApp(); });

// ---------- מסך פתיחה: לוגו והסבר קצר לשנייה וחצי ----------
setTimeout(() => {
  $('#splash').classList.add('out');
  setTimeout(() => $('#splash').remove(), 400);
}, 1500);

// ---------- הגדרות מתקפלות: כל כרטיס נפתח בלחיצה על הכותרת ----------
document.querySelectorAll('#tab-settings > .card').forEach((card) => {
  const h = card.querySelector(':scope > h3');
  if (!h) return;
  const d = Object.assign(document.createElement('details'), { className: 'fold' });
  if (card.id) d.dataset.card = card.id;
  const sum = document.createElement('summary');
  sum.append(...h.childNodes);
  h.remove();
  d.append(sum, ...card.childNodes);
  card.append(d);
});

// ---------- הפעלה ----------
translatePage();
document.body.classList.toggle('not-il', COUNTRY !== 'IL');
async function boot() {
  S = await api('GET', '/api/state');
  // השפה שנבחרה בחשבון (למשל במכשיר אחר) גוברת
  if (S.lang && S.lang !== LANG && LANGS[S.lang]) return setLang(S.lang);
  if (!S.lang) api('PUT', '/api/settings', { lang: LANG }).catch(() => {});
  document.body.classList.remove('logged-out');
  render();
  if (S.needTerms && !$('#termsDlg').open) { $('#termsOk').checked = false; $('#termsAccept').disabled = true; $('#termsDlg').showModal(); }
  if (!S.location) showTab('settings');
  else if (!S.list.length) showTab('list');
  updatePushState();
}

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
if (token) boot().catch(() => {}); else showLogin();
