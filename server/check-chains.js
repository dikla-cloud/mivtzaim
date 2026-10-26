// בדיקת חיבור לרשתות בישראל, מהשרת (אותה בדיקה יש גם באפליקציה: הגדרות ← נתוני שימוש למנהלים ← בדיקות):
//   cd /opt/mivtzaim && node server/check-chains.js            (כל הרשתות)
//   cd /opt/mivtzaim && node server/check-chains.js carrefour  (רשת אחת)
const d = require('./diagnostics');
d.cli(d.checkChains);
