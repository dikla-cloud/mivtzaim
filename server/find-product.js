// חיפוש מילים בקובצי המחירים של הסניפים – כדי לראות איך כל רשת קוראת למוצר (או אם הוא חסר). רק קורא – לא משנה כלום.
//   cd /opt/mivtzaim && node server/find-product.js "פטרוזיל,כוסב,פסטרמ"
//       (בסניפים שנבחרו ב„סניפים לבדיקה והשוואה” / בהשוואה האחרונה, של כל המשתמשים)
//   cd /opt/mivtzaim && node server/find-product.js "פטרוזיל" ramilevy          (רק רשת אחת)
//   cd /opt/mivtzaim && node server/find-product.js "פטרוזיל" ramilevy 39       (סניף מסוים)
const d = require('./diagnostics');
d.cli(d.findProduct);
