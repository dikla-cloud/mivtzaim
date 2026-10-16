// שפות בשרת: הודעות שגיאה, התראות ודוח הסריקה. המפתח הוא הנוסח העברי, ו-{x} הוא מקום למשתנה.
// שפת ברירת המחדל של ההתקנה: APP_LANG (he / de / en). כל משתמש יכול לבחור שפה אחרת בהגדרות.
const LANGS = ['he', 'de', 'en'];
const DEFAULT_LANG = LANGS.includes(process.env.APP_LANG) ? process.env.APP_LANG : 'he';
const LOCALE = { he: 'he-IL', de: 'de-AT', en: 'en-GB' };

const T = {
  'שם או סיסמה שגויים': { de: 'Name oder Passwort falsch', en: 'Wrong name or password' },
  'הסיסמה הראשונית שגויה': { de: 'Das Startpasswort ist falsch', en: 'The initial password is wrong' },
  'נדרשת כניסה': { de: 'Bitte anmelden', en: 'Please sign in' },
  'רק למנהל החשבון': { de: 'Nur für die Administratorin / den Administrator', en: 'Admins only' },
  'הסיסמה הנוכחית שגויה': { de: 'Das aktuelle Passwort ist falsch', en: 'The current password is wrong' },
  'הסיסמה החדשה צריכה להכיל לפחות 6 תווים': { de: 'Das neue Passwort braucht mindestens 6 Zeichen', en: 'The new password needs at least 6 characters' },
  'השם צריך להכיל 2–30 תווים': { de: 'Der Name braucht 2–30 Zeichen', en: 'The name needs 2–30 characters' },
  'הסיסמה צריכה להכיל לפחות 6 תווים': { de: 'Das Passwort braucht mindestens 6 Zeichen', en: 'The password needs at least 6 characters' },
  'כבר יש משתמש בשם הזה': { de: 'Diesen Namen gibt es schon', en: 'This name is already taken' },
  'רק מנהל האפליקציה יכול להזמין משתמשים חדשים': { de: 'Nur die Administration kann neue Personen einladen', en: 'Only the admin can invite new users' },
  'הגעתם למספר המשתמשים המקסימלי באפליקציה ({max}).': { de: 'Die maximale Anzahl an Personen ({max}) ist erreicht.', en: 'The maximum number of users ({max}) has been reached.' },
  'אפשר להגדיל אותו בהגדרות ← בני הבית.': { de: 'Du kannst sie unter Einstellungen → Haushalt erhöhen.', en: 'You can raise it in Settings → Household.' },
  'אפשר לבקש מהמנהל להגדיל אותו.': { de: 'Bitte die Administration, sie zu erhöhen.', en: 'Ask the admin to raise it.' },
  'הפריט כבר לא ברשימה': { de: 'Der Eintrag ist nicht mehr auf der Liste', en: 'The item is no longer on the list' },
  'משתמש לא נמצא': { de: 'Person nicht gefunden', en: 'User not found' },
  'זה החשבון שלך': { de: 'Das ist dein eigenes Konto', en: 'This is your own account' },
  'אי אפשר למחוק את החשבון שלך': { de: 'Du kannst dein eigenes Konto hier nicht löschen', en: 'You cannot delete your own account here' },
  'חשבון המנהל לא נמחק מכאן, כי בלעדיו אי אפשר לנהל את האפליקציה.': { de: 'Das Admin-Konto kann hier nicht gelöscht werden, sonst kann niemand die App verwalten.', en: 'The admin account cannot be deleted here, or nobody could manage the app.' },
  'הכתובת לא נמצאה': { de: 'Adresse nicht gefunden', en: 'Address not found' },
  'המיקום הנוכחי': { de: 'Aktueller Standort', en: 'Current location' },
  'מנוי לא תקין': { de: 'Ungültiges Abo', en: 'Invalid subscription' },
  'בדיקת התראה': { de: 'Test-Benachrichtigung', en: 'Test notification' },
  'שלום {name}, ההתראות פועלות ✔': { de: 'Hallo {name}, die Benachrichtigungen funktionieren ✔', en: 'Hi {name}, notifications are working ✔' },

  'ברקוד לא תקין': { de: 'Ungültiger Barcode', en: 'Invalid barcode' },

  // סריקה
  'לא הוגדר מיקום': { de: 'Kein Standort festgelegt', en: 'No location set' },
  'אין עדיין מקור מבצעים חינמי ל{country}. נתמכות כרגע: ישראל, אוסטריה, גרמניה ואוסטרליה.': {
    de: 'Für {country} gibt es noch keine kostenlose Angebotsquelle. Unterstützt: Israel, Österreich, Deutschland und Australien.',
    en: 'There is no free deals source for {country} yet. Supported: Israel, Austria, Germany and Australia.',
  },
  'המדינה הזו': { de: 'dieses Land', en: 'this country' },
  'marktguru (עלוני מבצעים)': { de: 'marktguru (Flugblätter)', en: 'marktguru (store flyers)' },
  'חיפוש בעלוני המבצעים של כל הרשתות באזור המיקוד {zip}': { de: 'Suche in den Flugblättern aller Ketten im PLZ-Gebiet {zip}', en: 'Searching the flyers of all chains in postcode area {zip}' },
  'לא זוהה מיקוד למיקום הנוכחי, ולכן אי אפשר לחפש בעלונים': { de: 'Für den Standort wurde keine Postleitzahl erkannt, deshalb ist keine Flugblatt-Suche möglich', en: 'No postcode was found for this location, so flyers cannot be searched' },
  ' · בדיקת ביקורת: חיפוש „Milch” החזיר {n} תוצאות, כלומר החיבור לעלונים תקין ופשוט אין כרגע מבצעים על המוצרים ברשימה.': {
    de: ' · Kontrolle: Die Suche nach „Milch“ ergab {n} Treffer. Die Verbindung funktioniert, es gibt nur gerade keine Angebote für deine Produkte.',
    en: ' · Check: searching for “Milch” returned {n} results, so the connection works and there are simply no deals on your items right now.',
  },
  ' · בדיקת ביקורת: גם חיפוש „Milch” החזיר 0 תוצאות. כנראה שהממשק של marktguru השתנה או שהמיקוד לא נתמך.': {
    de: ' · Kontrolle: Auch „Milch“ ergab 0 Treffer. Vermutlich hat sich marktguru geändert oder die PLZ wird nicht unterstützt.',
    en: ' · Check: “Milch” also returned 0 results. marktguru probably changed, or the postcode is not supported.',
  },
  ' · בדיקת ביקורת נכשלה: {err}': { de: ' · Kontrolle fehlgeschlagen: {err}', en: ' · Check failed: {err}' },
  '{chain} (סניפים באזור)': { de: '{chain} (Filialen in der Nähe)', en: '{chain} (nearby stores)' },
  'Woolworths + Coles (אוסטרליה)': { de: 'Woolworths + Coles (Australien)', en: 'Woolworths + Coles (Australia)' },
  'מבצעי השבוע באתרי Woolworths ו-Coles. המחירים באתרים ארציים, ושתי הרשתות פרוסות בכל הערים.': {
    de: 'Wochenangebote von Woolworths und Coles. Die Preise gelten landesweit.',
    en: 'Weekly specials from Woolworths and Coles. Prices are national; both chains are in every city.',
  },
  '{chain} (מחיר ארצי באתר)': { de: '{chain} (landesweiter Preis)', en: '{chain} (national online price)' },
  'חיפוש „{term}” נכשל: {err}': { de: 'Suche nach „{term}“ fehlgeschlagen: {err}', en: 'Search for “{term}” failed: {err}' },
  'קובצי שקיפות מחירים (ישראל)': { de: 'Preistransparenz-Dateien (Israel)', en: 'Price transparency files (Israel)' },

  // התראות
  'מבצע': { de: 'Angebot', en: 'Deal' },
  '{n} ב-': { de: '{n} für ', en: '{n} for ' },
  'מבצע על {item} – {chain}': { de: 'Angebot: {item} – {chain}', en: 'Deal on {item} – {chain}' },
  ' · עד {date}': { de: ' · bis {date}', en: ' · until {date}' },
  ' ({km} ק"מ)': { de: ' ({km} km)', en: ' ({km} km)' },
  '{item}: {price} ב{chain}': { de: '{item}: {price} bei {chain}', en: '{item}: {price} at {chain}' },
  ' עד {date}': { de: ' bis {date}', en: ' until {date}' },
  'ועוד {n}…': { de: 'und {n} weitere…', en: 'and {n} more…' },
  '{n} מבצעים חדשים מהרשימה שלך': { de: '{n} neue Angebote von deiner Liste', en: '{n} new deals from your list' },
};

const pick = (lang) => (LANGS.includes(lang) ? lang : DEFAULT_LANG);

// tr('he', 'שלום {name}', { name }) – מחזיר את הנוסח בשפה המבוקשת (או בעברית אם אין תרגום)
function tr(lang, he, vars = {}) {
  const l = pick(lang);
  const s = (l !== 'he' && T[he]?.[l]) || he;
  return s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
}

module.exports = { tr, LANGS, DEFAULT_LANG, LOCALE, pick, dir: (l) => (pick(l) === 'he' ? 'rtl' : 'ltr'), T };
