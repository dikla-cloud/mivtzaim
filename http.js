// fetch עם ניהול עוגיות פשוט (נדרש לפורטל Cerberus) וניסיונות חוזרים
const UA = 'Mozilla/5.0 (compatible; MivtzaimApp/1.0)';

class Session {
  constructor() { this.cookies = new Map(); }

  cookieHeader() {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
  }

  async fetch(url, opts = {}, tries = 3) {
    const headers = { 'User-Agent': UA, ...(opts.headers || {}) };
    if (this.cookies.size) headers.Cookie = this.cookieHeader();
    for (let i = 1; ; i++) {
      try {
        const res = await fetch(url, { redirect: 'manual', ...opts, headers, signal: AbortSignal.timeout(120000) });
        for (const c of res.headers.getSetCookie?.() || []) {
          const [pair] = c.split(';');
          const eq = pair.indexOf('=');
          this.cookies.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
        }
        if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
          return this.fetch(new URL(res.headers.get('location'), url).href, { headers: opts.headers }, tries);
        }
        if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
        return res;
      } catch (e) {
        if (i >= tries) throw e;
        await new Promise((r) => setTimeout(r, 2000 * i));
      }
    }
  }

  async text(url, opts) { return (await this.fetch(url, opts)).text(); }
  async buffer(url, opts) { return Buffer.from(await (await this.fetch(url, opts)).arrayBuffer()); }
}

module.exports = { Session, UA };
