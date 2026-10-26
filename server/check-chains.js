// בדיקת חיבור לרשתות בישראל, מהשרת (אותה בדיקה יש גם באפליקציה: הגדרות ← בדיקות ונתוני שימוש למנהלים ← בדיקות בשרת):
//   cd /opt/mivtzaim && node server/check-chains.js            (כל הרשתות)
//   cd /opt/mivtzaim && node server/check-chains.js carrefour  (רשת אחת)
const d = require('./diagnostics');
d.cli(d.checkChains);
