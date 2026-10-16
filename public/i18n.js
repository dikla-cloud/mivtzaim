// שפות: עברית (המקור), Deutsch, English.
// המפתח הוא הנוסח העברי, ו-{x} הוא מקום למשתנה. טקסט בלי תרגום מוצג בעברית.
const LANGS = { he: 'עברית', de: 'Deutsch', en: 'English' };
const LOCALES = { he: 'he-IL', de: 'de-AT', en: 'en-GB' };
const SPEECH = { he: 'he-IL', de: 'de-AT', en: 'en-GB' };

const LANG = (() => {
  let saved = '';
  try { saved = localStorage.getItem('lang') || ''; } catch { /* מצב פרטי */ }
  if (LANGS[saved]) return saved;
  const def = document.documentElement.dataset.defaultLang;
  return LANGS[def] ? def : 'he';
})();
const LOCALE = LOCALES[LANG];
const COUNTRY = document.documentElement.dataset.country || 'IL';
document.documentElement.lang = LANG;
document.documentElement.dir = LANG === 'he' ? 'rtl' : 'ltr';

const I18N = {
  // ---------- מסך הכניסה וראש המסך ----------
  'הקניות שלי': ['Meine Einkäufe', 'My Shopping'],
  'כניסה לחשבון שלך': ['Bei deinem Konto anmelden', 'Sign in to your account'],
  'שם': ['Name', 'Name'],
  'סיסמה': ['Passwort', 'Password'],
  'כניסה': ['Anmelden', 'Sign in'],
  'תנאי שימוש': ['Nutzungsbedingungen', 'Terms of use'],
  'מדיניות פרטיות': ['Datenschutz', 'Privacy policy'],
  'הגדרות': ['Einstellungen', 'Settings'],
  'עדכון המיקום לפי המקום שבו את/ה נמצא/ת עכשיו': ['Standort auf deinen aktuellen Ort setzen', 'Set the location to where you are now'],
  '📍 עדכון מיקום': ['📍 Standort aktualisieren', '📍 Update location'],
  'מבצעים': ['Angebote', 'Deals'],
  'רשימה לחיפוש מבצעים': ['Angebots-Suchliste', 'Deals watch list'],
  'חסר בבית': ['Einkaufsliste', 'Shopping list'],
  'המבצעים על המוצרים שלך, ליד הבית': ['Angebote für deine Produkte, in deiner Nähe', 'Deals on your products, near home'],
  'בדיקת מבצעים עכשיו': ['Jetzt Angebote suchen', 'Check deals now'],
  '🔍 מה נבדק בסריקה האחרונה': ['🔍 Was bei der letzten Suche geprüft wurde', '🔍 What the last scan checked'],
  'הערות מהסריקה האחרונה': ['Hinweise zur letzten Suche', 'Notes from the last scan'],

  // ---------- חסר בבית ----------
  'מה חסר בבית?': ['Was fehlt zu Hause?', 'What do you need?'],
  'הכתבה': ['Diktieren', 'Dictate'],
  'הוספה': ['Hinzufügen', 'Add'],
  'אין כרגע חוסרים 🎉': ['Gerade fehlt nichts 🎉', 'Nothing missing right now 🎉'],
  '🧹 ניקוי פריטים שנקנו': ['🧹 Gekaufte entfernen', '🧹 Clear bought items'],
  'בסופר: לוחצים על פריט כשהוא נכנס לעגלה. „ניקוי פריטים שנקנו” משאיר ברשימה רק את מה שעוד לא נקנה. הרשימה לחיפוש מבצעים לא משתנה.': [
    'Im Geschäft: Tippe auf einen Eintrag, wenn er im Wagen ist. „Gekaufte entfernen“ lässt nur das Ungekaufte stehen. Die Angebots-Suchliste bleibt gleich.',
    'In the store: tap an item when it goes into the cart. “Clear bought items” keeps only what is still missing. The deals watch list does not change.',
  ],
  '🏠 משותף עם: {names}': ['🏠 Geteilt mit: {names}', '🏠 Shared with: {names}'],
  '🏠 כרגע רק את/ה ברשימה הזו. אפשר לשתף בני בית בהגדרות ← „בני הבית”.': ['🏠 Nur du nutzt diese Liste. Teilen kannst du unter Einstellungen → „Haushalt“.', '🏠 Only you use this list. Share it in Settings → “Household”.'],
  'סימון כלא נקנה': ['Als nicht gekauft markieren', 'Mark as not bought'],
  'סימון כנקנה': ['Als gekauft markieren', 'Mark as bought'],
  'הוסיף/ה {name}': ['von {name}', 'added by {name}'],
  'נקנה ע״י {name}': ['gekauft von {name}', 'bought by {name}'],
  '🏷️ במבצע: {price} ב{chain}': ['🏷️ Im Angebot: {price} bei {chain}', '🏷️ On sale: {price} at {chain}'],
  ' (ועוד {n})': [' (+{n})', ' (+{n} more)'],
  ' · פרטים וקישור ‹': [' · Details ›', ' · details ›'],
  'להוסיף לרשימה לחיפוש מבצעים': ['Zur Angebots-Suchliste hinzufügen', 'Add to the deals watch list'],
  '„{item}” נוסף לרשימה לחיפוש מבצעים': ['„{item}“ ist jetzt auf der Angebots-Suchliste', '“{item}” added to the deals watch list'],
  'מחיקה': ['Löschen', 'Delete'],
  '„{item}” נמחק מהרשימה': ['„{item}“ gelöscht', '“{item}” deleted'],
  ' (הוסיף/ה {name})': [' (von {name})', ' (added by {name})'],
  ' (הוספת בעצמך)': [' (von dir)', ' (added by you)'],
  'ℹ️ „{item}” כבר ברשימה{who}': ['ℹ️ „{item}“ steht schon auf der Liste{who}', 'ℹ️ “{item}” is already on the list{who}'],
  'ℹ️ כבר ברשימה: {items}': ['ℹ️ Schon auf der Liste: {items}', 'ℹ️ Already on the list: {items}'],
  '„{item}” כבר ברשימה ולא נוסף שוב': ['„{item}“ steht schon auf der Liste', '“{item}” is already on the list'],
  '{n} פריטים כבר ברשימה ולא נוספו שוב': ['{n} Einträge stehen schon auf der Liste', '{n} items are already on the list'],
  'נוסף פריט אחד': ['1 Eintrag hinzugefügt', '1 item added'],
  'נוספו {n} פריטים': ['{n} Einträge hinzugefügt', '{n} items added'],
  'כל הפריטים כבר ברשימה': ['Alle Einträge stehen schon auf der Liste', 'All items are already on the list'],
  '↩ ביטול': ['↩ Rückgängig', '↩ Undo'],
  '„{item}” הוחזר לרשימה': ['„{item}“ ist wieder auf der Liste', '“{item}” is back on the list'],
  '{n} פריטים הוחזרו לרשימה': ['{n} Einträge sind wieder auf der Liste', '{n} items are back on the list'],
  'פריט אחד שנקנה נמחק מהרשימה': ['1 gekaufter Eintrag entfernt', '1 bought item cleared'],
  '{n} פריטים שנקנו נמחקו מהרשימה': ['{n} gekaufte Einträge entfernt', '{n} bought items cleared'],
  'מבצעים על „{item}”': ['Angebote für „{item}“', 'Deals on “{item}”'],

  // ---------- הכתבה ----------
  'אמרו מה חסר, למשל: „חלב, לחם וביצים”': ['Sag, was fehlt, z. B.: „Milch, Brot und Eier“', 'Say what you need, e.g. “milk, bread and eggs”'],
  'אמרו אילו מוצרים להוסיף, למשל: „חלב, קפה ושמן זית”': ['Sag, welche Produkte du hinzufügen willst, z. B.: „Milch, Kaffee und Olivenöl“', 'Say which products to add, e.g. “milk, coffee and olive oil”'],
  'צריך לאשר גישה למיקרופון': ['Bitte den Mikrofonzugriff erlauben', 'Please allow microphone access'],
  'ההכתבה נכשלה ({err})': ['Diktieren fehlgeschlagen ({err})', 'Dictation failed ({err})'],
  'בדקו את הפריטים ותקנו אם צריך, ואז „הוספה”': ['Prüfe die Einträge und tippe dann auf „Hinzufügen“', 'Check the items, then tap “Add”'],

  // ---------- רשימה לחיפוש מבצעים ----------
  'המוצרים שהאפליקציה מחפשת עליהם מבצעים ושולחת עליהם התראות. זו רשימה קבועה: היא לא מתרוקנת כשקונים.': [
    'Für diese Produkte sucht die App Angebote und schickt Benachrichtigungen. Die Liste bleibt fix, auch wenn du einkaufst.',
    'The products the app watches for deals and notifies you about. This list is fixed: buying things does not empty it.',
  ],
  'הוספת מוצר (למשל: חלב 3%, קוטג\', או ברקוד)': ['Produkt hinzufügen (z. B. Milch, Butter oder Barcode)', 'Add a product (e.g. milk, butter or a barcode)'],
  'העלאת רשימה': ['Liste hochladen', 'Upload a list'],
  'מוצר בכל שורה (או מופרדים בפסיקים). אפשר להדביק טקסט או להעלות קובץ ‎.txt / .csv.': ['Ein Produkt pro Zeile (oder durch Beistriche getrennt). Text einfügen oder eine .txt/.csv-Datei hochladen.', 'One product per line (or comma-separated). Paste text or upload a .txt / .csv file.'],
  'בחו"ל המוצרים מתורגמים אוטומטית. אפשר גם לכתוב שם מקומי אחרי קו:': ['Schreib die Produkte einfach auf Deutsch. Für eine bestimmte Suche geht auch:', 'Write products in the local language. You can also give a search term after a bar:'],
  'חלב 3% | Milch': ['Milch 3,5% | Vollmilch', 'milk | Milch'],
  'חלב 3%\nבמבה\nשמן קנולה': ['Milch\nKaffee\nOlivenöl', 'milk\ncoffee\nolive oil'],
  'הוספה לרשימה': ['Zur Liste hinzufügen', 'Add to list'],
  'החלפת הרשימה': ['Liste ersetzen', 'Replace list'],
  'העלאת קובץ': ['Datei hochladen', 'Upload file'],
  'מוצר': ['Produkt', 'Product'],
  'להחליף את כל הרשימה הקיימת?': ['Die ganze bestehende Liste ersetzen?', 'Replace the whole existing list?'],

  // ---------- מבצעים ----------
  'נבדק לאחרונה: {when}': ['Zuletzt geprüft: {when}', 'Last checked: {when}'],
  'עוד לא בוצעה בדיקה': ['Noch nicht geprüft', 'Not checked yet'],
  '📍 {place} · רדיוס {km} ק"מ · {scanned}': ['📍 {place} · Umkreis {km} km · {scanned}', '📍 {place} · radius {km} km · {scanned}'],
  'לחצו על „עדכון מיקום” כדי להתחיל': ['Tippe auf „Standort aktualisieren“, um zu starten', 'Tap “Update location” to start'],
  'מקור הנתונים: {src}': ['Datenquelle: {src}', 'Data source: {src}'],
  'הרשימה ריקה. הוסיפו מוצרים בלשונית „רשימה לחיפוש מבצעים”.': ['Die Liste ist leer. Füge Produkte im Tab „Angebots-Suchliste“ hinzu.', 'The list is empty. Add products in the “Deals watch list” tab.'],
  'לא נמצאו כרגע מבצעים על מוצרי הרשימה באזור. למטה אפשר לראות בדיוק מה נבדק.': ['Gerade keine Angebote für deine Produkte in der Nähe. Unten siehst du genau, was geprüft wurde.', 'No deals on your products nearby right now. Below you can see exactly what was checked.'],
  'לחצו „בדיקת מבצעים עכשיו”.': ['Tippe auf „Jetzt Angebote suchen“.', 'Tap “Check deals now”.'],
  'לדף המבצע באתר הרשת ↗': ['Zum Angebot auf der Website ↗', 'Open the deal on the store site ↗'],
  'לחיפוש המוצר באתר {chain} ↗': ['Produkt bei {chain} suchen ↗', 'Search the product at {chain} ↗'],
  'לחיפוש המוצר ברשת ↗': ['Produkt im Web suchen ↗', 'Search the product online ↗'],
  '{n} ב-': ['{n} für ', '{n} for '],
  'מבצע': ['Angebot', 'Deal'],
  'מועדון': ['Club', 'Club'],
  'בתוקף עד {date}': ['Gültig bis {date}', 'Valid until {date}'],
  'מסתיים היום': ['endet heute', 'ends today'],
  'עוד {n} ימים': ['noch {n} Tage', '{n} days left'],
  'תאריך סיום לא פורסם': ['Enddatum nicht angegeben', 'No end date published'],
  ' · {km} ק"מ': [' · {km} km', ' · {km} km'],
  'ברקוד {code} · ': ['Barcode {code} · ', 'Barcode {code} · '],

  // ---------- דוח הסריקה ----------
  'לא זוהה': ['nicht erkannt', 'not detected'],
  '📍 מיקום שזוהה: {where}': ['📍 Erkannter Standort: {where}', '📍 Detected location: {where}'],
  ' · מיקוד {zip}': [' · PLZ {zip}', ' · postcode {zip}'],
  ' · רדיוס {km} ק"מ': [' · Umkreis {km} km', ' · radius {km} km'],
  '⚠️ אין עדיין מקור מבצעים חינמי ל{country}. נתמכות כרגע: ישראל, אוסטריה, גרמניה ואוסטרליה.': ['⚠️ Für {country} gibt es noch keine kostenlose Angebotsquelle. Unterstützt: Israel, Österreich, Deutschland und Australien.', '⚠️ No free deals source for {country} yet. Supported: Israel, Austria, Germany and Australia.'],
  'מדינה הזו': ['dieses Land', 'this country'],
  '✘ מקור הנתונים: {name} – נכשל: {err}': ['✘ Datenquelle: {name} – fehlgeschlagen: {err}', '✘ Data source: {name} – failed: {err}'],
  '✔ מקור הנתונים: {name}': ['✔ Datenquelle: {name}', '✔ Data source: {name}'],
  'רשתות': ['Ketten', 'Chains'],
  'לא הופיעה אף רשת עם מבצע על מוצרי הרשימה.': ['Keine Kette hat ein Angebot für deine Produkte.', 'No chain has a deal on your products.'],
  '✘ {name} – לא הצלחנו לבדוק: {err}': ['✘ {name} – Prüfung fehlgeschlagen: {err}', '✘ {name} – could not check: {err}'],
  '– {name} – אין סניף ברדיוס {km} ק"מ': ['– {name} – keine Filiale im Umkreis von {km} km', '– {name} – no store within {km} km'],
  '✔ {name} – {n} מבצעים מהרשימה': ['✔ {name} – {n} Angebote von deiner Liste', '✔ {name} – {n} deals from your list'],
  '{name} ({km} ק"מ, שגיאה)': ['{name} ({km} km, Fehler)', '{name} ({km} km, error)'],
  '{name} ({km} ק"מ, {n} מבצעים בסניף)': ['{name} ({km} km, {n} Angebote)', '{name} ({km} km, {n} deals in store)'],
  '✔ {name} – {nearby} סניפים ברדיוס, נבדקו: {stores} – {n} התאמות לרשימה': ['✔ {name} – {nearby} Filialen im Umkreis, geprüft: {stores} – {n} Treffer', '✔ {name} – {nearby} stores nearby, checked: {stores} – {n} matches'],
  'מוצרים': ['Produkte', 'Products'],
  ' → חיפוש „{term}”': [' → Suche „{term}“', ' → search “{term}”'],
  ' (תרגום אוטומטי – אם הוא שגוי, אפשר לתקן עם |)': [' (automatisch übersetzt – falls falsch, mit | korrigieren)', ' (auto-translated – if wrong, fix it with |)'],
  ' (תרגום ידני)': [' (eigener Suchbegriff)', ' (manual term)'],
  ' · {n} תוצאות בעלונים': [' · {n} Treffer in Flugblättern', ' · {n} results in flyers'],
  '{n} מבצעים בתוקף': ['{n} gültige Angebote', '{n} active deals'],
  'אין מבצע כרגע': ['gerade kein Angebot', 'no deal right now'],
  'שגיאה: {err}': ['Fehler: {err}', 'Error: {err}'],
  'לא תורגם לשפה המקומית. אפשר להוסיף תרגום ידני: למשל „חלב | Milch”': ['Nicht übersetzt. Du kannst einen Suchbegriff angeben, z. B. „Milch | Vollmilch“', 'Not translated. You can add a search term, e.g. “milk | Milch”'],

  // ---------- הגדרות: חשבון ----------
  'החשבון שלי': ['Mein Konto', 'My account'],
  'החשבון:': ['Konto:', 'Account:'],
  'החלפת סיסמה': ['Passwort ändern', 'Change password'],
  'סיסמה נוכחית': ['Aktuelles Passwort', 'Current password'],
  'סיסמה חדשה (לפחות 6 תווים)': ['Neues Passwort (mind. 6 Zeichen)', 'New password (at least 6 characters)'],
  'שוב את הסיסמה החדשה': ['Neues Passwort wiederholen', 'Repeat the new password'],
  'שמירת הסיסמה': ['Passwort speichern', 'Save password'],
  'יציאה מהחשבון במכשיר הזה': ['Auf diesem Gerät abmelden', 'Sign out on this device'],
  'מחיקת החשבון שלי': ['Mein Konto löschen', 'Delete my account'],
  'החשבון, הרשימה לחיפוש מבצעים, המיקום וההתראות יימחקו לצמיתות. רשימת „חסר בבית” נשארת לבני הבית האחרים.': ['Konto, Angebots-Suchliste, Standort und Benachrichtigungen werden endgültig gelöscht. Die Einkaufsliste bleibt für die anderen im Haushalt.', 'Your account, deals watch list, location and notifications will be deleted for good. The shopping list stays for the rest of the household.'],
  'מחיקת החשבון שלי לצמיתות': ['Mein Konto endgültig löschen', 'Delete my account for good'],
  'למחוק את החשבון לצמיתות? אי אפשר לבטל את זה.': ['Konto endgültig löschen? Das kann nicht rückgängig gemacht werden.', 'Delete your account for good? This cannot be undone.'],
  'החשבון נמחק.': ['Das Konto wurde gelöscht.', 'The account was deleted.'],
  'הסיסמאות החדשות לא זהות': ['Die neuen Passwörter stimmen nicht überein', 'The new passwords do not match'],
  'הסיסמה הוחלפה ✔ שאר המכשירים יתבקשו להיכנס מחדש': ['Passwort geändert ✔ Andere Geräte müssen sich neu anmelden', 'Password changed ✔ Other devices will need to sign in again'],
  'שפה': ['Sprache', 'Language'],
  'כניסה ראשונה: בחרו שם, והקלידו את הסיסמה שהוגדרה בהתקנה. החשבון הזה יהיה המנהל.': ['Erste Anmeldung: Wähle einen Namen und gib das Startpasswort aus der Installation ein. Dieses Konto wird die Administration.', 'First sign-in: choose a name and enter the password set during installation. This account will be the admin.'],
  'נדרשת כניסה': ['Bitte anmelden', 'Please sign in'],
  'שגיאה': ['Fehler', 'Error'],

  // ---------- נתוני שימוש ----------
  '📊 נתוני שימוש': ['📊 Nutzungsdaten', '📊 Usage'],
  'מספרים מצטברים בלבד. לא נשמר מי לחץ על מה, מה כתוב ברשימות או איפה כל אחד נמצא. רק את/ה (המנהל) רואה את המסך הזה.': ['Nur Gesamtzahlen. Es wird nicht gespeichert, wer was angetippt hat, was auf den Listen steht oder wo jemand ist. Nur du als Administration siehst das.', 'Totals only. Nothing records who tapped what, what is on the lists or where anyone is. Only you (the admin) see this.'],
  'משתמשים פעילים בכל יום (30 ימים)': ['Aktive Personen pro Tag (30 Tage)', 'Active users per day (30 days)'],
  'לפי רשת (30 ימים)': ['Nach Kette (30 Tage)', 'By chain (30 days)'],
  'רענון': ['Aktualisieren', 'Refresh'],
  '⬇️ הורדת קובץ CSV': ['⬇️ CSV herunterladen', '⬇️ Download CSV'],
  'לחיצות על מבצעים': ['Klicks auf Angebote', 'Deal clicks'],
  'התראות שנשלחו': ['Gesendete Benachrichtigungen', 'Notifications sent'],
  'פריטים שנוספו ל„חסר בבית”': ['Einträge auf der Einkaufsliste', 'Shopping list items added'],
  'פריטים שסומנו כנקנו': ['Als gekauft markiert', 'Items marked bought'],
  'סריקות': ['Suchläufe', 'Scans'],
  'משתמשים חדשים': ['Neue Personen', 'New users'],
  'רשומים': ['Registriert', 'Registered'],
  'משקי בית': ['Haushalte', 'Households'],
  'פעילים היום': ['Heute aktiv', 'Active today'],
  'פעילים ב-7 ימים': ['Aktiv in 7 Tagen', 'Active in 7 days'],
  'פעילים ב-30 יום': ['Aktiv in 30 Tagen', 'Active in 30 days'],
  'רשת': ['Kette', 'Chain'],
  'מבצעים שהוצגו': ['Angezeigte Angebote', 'Deals shown'],
  'לחיצות': ['Klicks', 'Clicks'],
  'עוד אין נתונים': ['Noch keine Daten', 'No data yet'],
  '{day}: {n} פעילים': ['{day}: {n} aktiv', '{day}: {n} active'],
  '{day} · {n} פעילים': ['{day} · {n} aktiv', '{day} · {n} active'],
  'עד {max}': ['bis {max}', 'up to {max}'],
  'משתמשים פעילים ב-30 הימים האחרונים, מקסימום {max} ביום': ['Aktive Personen in den letzten 30 Tagen, höchstens {max} pro Tag', 'Active users in the last 30 days, at most {max} per day'],
  'ההורדה נכשלה': ['Download fehlgeschlagen', 'Download failed'],

  // ---------- בני הבית ----------
  'בני הבית': ['Haushalt', 'Household'],
  'כל מי שנמצא במשק הבית שלך רואה ומעדכן את אותה רשימת „חסר בבית”. הרשימה לחיפוש מבצעים, המיקום וההתראות נשארים אישיים לכל אחד.': ['Alle in deinem Haushalt sehen und bearbeiten dieselbe Einkaufsliste. Angebots-Suchliste, Standort und Benachrichtigungen bleiben persönlich.', 'Everyone in your household sees and edits the same shopping list. The deals watch list, location and notifications stay personal.'],
  'הגבלות הזמנה': ['Einladungen', 'Invitations'],
  'גם משתמשים רגילים יכולים להזמין אנשים נוספים': ['Auch andere dürfen Personen einladen', 'Regular users may invite people too'],
  'מספר המשתמשים המקסימלי באפליקציה': ['Maximale Anzahl an Personen in der App', 'Maximum number of users in the app'],
  'שמירה': ['Speichern', 'Save'],
  '✔ נשמר': ['✔ Gespeichert', '✔ Saved'],
  'הוספת משתמש': ['Person hinzufügen', 'Add a user'],
  'סיסמה ראשונית (לפחות 6 תווים)': ['Startpasswort (mind. 6 Zeichen)', 'Initial password (at least 6 characters)'],
  'משק בית נפרד (בלי רשימת ״חסר בבית״ משותפת איתי)': ['Eigener Haushalt (keine gemeinsame Einkaufsliste mit mir)', 'Separate household (no shared shopping list with me)'],
  'שיתוף עם בן בית נוסף (רואה ומעדכן את רשימת ״חסר בבית״ שלי)': ['Mit jemandem aus meinem Haushalt teilen (sieht und bearbeitet meine Einkaufsliste)', 'Share with someone in my household (sees and edits my shopping list)'],
  'הוסף': ['Hinzufügen', 'Add'],
  'אחרי ההוספה שלחו לו את הקישור לאפליקציה, את השם ואת הסיסמה. אחרי הכניסה הוא יוכל להחליף את הסיסמה בעצמו.': ['Schick der Person danach den Link, den Namen und das Passwort. Nach der Anmeldung kann sie das Passwort selbst ändern.', 'Then send them the app link, the name and the password. After signing in they can change the password themselves.'],
  '📋 העתקת הקישור': ['📋 Link kopieren', '📋 Copy link'],
  '✔ הועתק': ['✔ Kopiert', '✔ Copied'],
  'שיתוף': ['Teilen', 'Share'],
  'הצטרפות לאפליקציה „הקניות שלי”:': ['Komm zur App „Meine Einkäufe“:', 'Join the “My Shopping” app:'],
  'הזמנת משתמשים חדשים נעשית דרך מנהל האפליקציה.': ['Neue Personen lädt die Administration ein.', 'New users are invited by the app admin.'],
  'באפליקציה {count} משתמשים מתוך {max} אפשריים (נשארו {left}).': ['{count} von {max} möglichen Personen (noch {left} frei).', '{count} of {max} possible users ({left} left).'],
  'הגעתם למספר המשתמשים המקסימלי ({max}).': ['Die maximale Anzahl ({max}) ist erreicht.', 'The maximum number of users ({max}) has been reached.'],
  ' אפשר להגדיל אותו למעלה.': [' Du kannst sie oben erhöhen.', ' You can raise it above.'],
  '· 🏠 משק הבית שלך': ['· 🏠 dein Haushalt', '· 🏠 your household'],
  '· משק בית אחר': ['· anderer Haushalt', '· other household'],
  ' · מנהל': [' · Admin', ' · admin'],
  ' · עוד לא נכנס': [' · noch nicht angemeldet', ' · not signed in yet'],
  'סיסמה חדשה': ['Neues Passwort', 'New password'],
  'סיסמה חדשה עבור {name} (לפחות 6 תווים):': ['Neues Passwort für {name} (mind. 6 Zeichen):', 'New password for {name} (at least 6 characters):'],
  'הסיסמה של {name} עודכנה': ['Passwort von {name} geändert', 'Password for {name} updated'],
  'הפרדה ממשק הבית שלי': ['Aus meinem Haushalt lösen', 'Remove from my household'],
  'צירוף למשק הבית שלי': ['Zu meinem Haushalt hinzufügen', 'Add to my household'],
  'להפריד את {name} ממשק הבית שלך? רשימת „חסר בבית” שלך תישאר אצלך, ו{name} יקבל רשימה ריקה משלו.': ['{name} aus deinem Haushalt lösen? Deine Einkaufsliste bleibt bei dir, {name} bekommt eine eigene leere Liste.', 'Remove {name} from your household? Your shopping list stays with you, and {name} gets an empty list of their own.'],
  'לצרף את {name} למשק הבית שלך? הוא יראה ויעדכן את רשימת „חסר בבית” שלך.': ['{name} zu deinem Haushalt hinzufügen? {name} sieht und bearbeitet dann deine Einkaufsliste.', 'Add {name} to your household? They will see and edit your shopping list.'],
  'למחוק את החשבון של {name}? הרשימה וההגדרות שלו יימחקו.': ['Das Konto von {name} löschen? Liste und Einstellungen werden gelöscht.', 'Delete {name}’s account? Their list and settings will be deleted.'],
  '{name} נוסף/ה': ['{name} wurde hinzugefügt', '{name} was added'],

  // ---------- מיקום והתראות ----------
  'מיקום': ['Standort', 'Location'],
  '📍 עדכון לפי המיקום הנוכחי': ['📍 Auf aktuellen Standort setzen', '📍 Use my current location'],
  'המיקום מתעדכן כשלוחצים על „עדכון מיקום” (גם בראש המסך). מגיעים למקום חדש? לוחצים פעם אחת.': ['Der Standort ändert sich nur, wenn du auf „Standort aktualisieren“ tippst (auch oben). An einem neuen Ort? Einmal tippen.', 'The location only changes when you tap “Update location” (also at the top). Somewhere new? Tap once.'],
  'או כתובת / עיר (למשל: הרצל 1, חולון / Stephansplatz, Wien)': ['oder Adresse / Ort (z. B. Stephansplatz, Wien)', 'or an address / city (e.g. Stephansplatz, Vienna)'],
  'רדיוס חיפוש:': ['Suchradius:', 'Search radius:'],
  'ק"מ': ['km', 'km'],
  'נוכחי: {place}': ['Aktuell: {place}', 'Current: {place}'],
  'לא הוגדר מיקום': ['Kein Standort festgelegt', 'No location set'],
  'הדפדפן לא תומך באיתור מיקום': ['Der Browser kann den Standort nicht bestimmen', 'This browser cannot detect location'],
  '📍 מאתר…': ['📍 Suche…', '📍 Locating…'],
  '📍 המיקום עודכן: {place} – בודק מבצעים באזור…': ['📍 Standort: {place} – suche Angebote in der Nähe…', '📍 Location updated: {place} – checking nearby deals…'],
  'צריך לאשר לאפליקציה גישה למיקום': ['Bitte erlaube der App den Standortzugriff', 'Please allow the app to access your location'],
  'לא ניתן לקבל מיקום: ': ['Standort nicht verfügbar: ', 'Could not get location: '],
  '📍 {place}: נמצאו {n} מבצעים': ['📍 {place}: {n} Angebote gefunden', '📍 {place}: {n} deals found'],
  'בודק מבצעים… (יכול לקחת כמה דקות)': ['Suche Angebote… (kann ein paar Minuten dauern)', 'Checking deals… (can take a few minutes)'],
  'התראות': ['Benachrichtigungen', 'Notifications'],
  'הפעלת התראות במכשיר הזה': ['Benachrichtigungen auf diesem Gerät aktivieren', 'Turn on notifications on this device'],
  'שליחת התראת בדיקה': ['Test-Benachrichtigung senden', 'Send a test notification'],
  'באייפון: קודם מוסיפים את האפליקציה למסך הבית ופותחים אותה משם.': ['Am iPhone: zuerst die App zum Home-Bildschirm hinzufügen und von dort öffnen.', 'On iPhone: first add the app to the home screen and open it from there.'],
  'הדפדפן הזה לא תומך בהתראות.': ['Dieser Browser unterstützt keine Benachrichtigungen.', 'This browser does not support notifications.'],
  'ההתראות פעילות במכשיר הזה ✔': ['Benachrichtigungen sind auf diesem Gerät aktiv ✔', 'Notifications are on for this device ✔'],
  'ההתראות נחסמו בהגדרות הדפדפן.': ['Benachrichtigungen sind in den Browser-Einstellungen blockiert.', 'Notifications are blocked in the browser settings.'],
  'ההתראות כבויות במכשיר הזה.': ['Benachrichtigungen sind auf diesem Gerät aus.', 'Notifications are off on this device.'],
  'הפעלת ההתראות נכשלה: ': ['Aktivieren fehlgeschlagen: ', 'Turning on notifications failed: '],
  'רשתות בישראל': ['Ketten in Israel', 'Chains in Israel'],
  'בחו"ל נתמכות כרגע אוסטריה וגרמניה (כל הרשתות הגדולות, לפי עלוני המבצעים) ואוסטרליה (Woolworths ו-Coles).': ['Außerhalb Israels: Österreich und Deutschland (alle großen Ketten über die Flugblätter) und Australien (Woolworths und Coles).', 'Outside Israel: Austria and Germany (all major chains, via store flyers) and Australia (Woolworths and Coles).'],

  // ---------- התקנה ותנאים ----------
  'התקנה בטלפון': ['Am Handy installieren', 'Install on your phone'],
  'אנדרואיד (Chrome):': ['Android (Chrome):', 'Android (Chrome):'],
  'תפריט ⋮ ← „התקנת אפליקציה” / „הוספה למסך הבית”.': ['Menü ⋮ → „App installieren“ / „Zum Startbildschirm hinzufügen“.', 'Menu ⋮ → “Install app” / “Add to Home screen”.'],
  'אייפון (Safari):': ['iPhone (Safari):', 'iPhone (Safari):'],
  'כפתור השיתוף ← „הוספה למסך הבית”, ואז לפתוח מהאייקון ולהפעיל התראות (נדרש iOS 16.4 ומעלה).': ['Teilen-Knopf → „Zum Home-Bildschirm“, dann über das Symbol öffnen und Benachrichtigungen aktivieren (ab iOS 16.4).', 'Share button → “Add to Home Screen”, then open it from the icon and turn on notifications (iOS 16.4 or later).'],
  'התקנת האפליקציה': ['App installieren', 'Install the app'],
  'תנאי שימוש ומדיניות פרטיות': ['Nutzungsbedingungen und Datenschutz', 'Terms of use and privacy policy'],
  'כדי להמשיך יש לקרוא ולאשר את': ['Bitte lies und bestätige die', 'To continue, please read and accept the'],
  'תנאי השימוש': ['Nutzungsbedingungen', 'terms of use'],
  'ואת': ['und die', 'and the'],
  'מדיניות הפרטיות': ['Datenschutzerklärung', 'privacy policy'],
  'בקצרה: המבצעים מגיעים מהרשתות ויש לבדוק אותם בחנות. המידע שלך לא נמכר, והמדידה היא מצטברת בלבד, בלי זיהוי.': ['Kurz gesagt: Die Angebote kommen von den Ketten, bitte im Geschäft prüfen. Deine Daten werden nicht verkauft, und die Statistik zählt nur Gesamtzahlen.', 'In short: the deals come from the stores, so check them in the shop. Your data is not sold, and usage is counted only in totals.'],
  'קראתי ואני מסכים/ה': ['Gelesen und einverstanden', 'I have read and agree'],
  'אישור והמשך': ['Bestätigen und weiter', 'Accept and continue'],
  'סגירה': ['Schließen', 'Close'],
  'הפרטים מגיעים מהמבצע שהרשת פרסמה. בקישור אפשר לראות את המוצר עצמו (תמונה ושם מלא) ולוודא שזה מה שרוצים.': ['Die Details stammen aus dem Angebot der Kette. Über den Link siehst du das Produkt (Bild und voller Name) und kannst prüfen, ob es passt.', 'The details come from the deal the store published. The link shows the product itself (photo and full name) so you can check it is what you want.'],
};

// t('נוספו {n} פריטים', { n: 3 })
function t(he, vars = {}) {
  const row = I18N[he];
  const s = (LANG !== 'he' && row && row[LANG === 'de' ? 0 : 1]) || he;
  return s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
}

// תרגום הטקסטים הקבועים בדף (טקסט, placeholder, title, aria-label)
function translatePage(root = document.body) {
  document.title = t(document.title);
  if (LANG === 'he') return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.parentElement?.closest('script,style,svg') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const k = n.nodeValue.trim();
    if (k && I18N[k]) n.nodeValue = n.nodeValue.replace(k, t(k));
  }
  for (const el of root.querySelectorAll('[placeholder],[title],[aria-label]')) {
    for (const a of ['placeholder', 'title', 'aria-label']) {
      const v = el.getAttribute(a);
      if (v && I18N[v]) el.setAttribute(a, t(v));
    }
  }
  for (const tpl of root.querySelectorAll('template')) translatePage(tpl.content);
  // תנאי שימוש ופרטיות בשפה הנבחרת
  for (const a of root.querySelectorAll('a[href="terms.html"], a[href="privacy.html"]')) a.href = a.getAttribute('href').replace('.html', `.${LANG}.html`);
}
