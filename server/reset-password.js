// איפוס סיסמה מהשרת, למקרה ששכחת את סיסמת המנהל:
//   sudo systemctl stop mivtzaim
//   DATA_DIR=/var/lib/mivtzaim node /opt/mivtzaim/server/reset-password.js "השם" "סיסמה-חדשה"
//   sudo systemctl start mivtzaim
const db = require('./db');
const auth = require('./auth');

const [name, password] = process.argv.slice(2);
const u = db.get().users[db.userKey(name)];
if (!u) {
  console.error(`אין משתמש בשם "${name}". המשתמשים: ${db.users().map((x) => x.name).join(', ') || '(אין)'}`);
  process.exit(1);
}
if (!auth.validPassword(password)) {
  console.error('הסיסמה צריכה להכיל לפחות 6 תווים');
  process.exit(1);
}
u.pass = auth.hashPassword(password);
auth.dropSessions(u);
db.save();
console.log(`✔ הסיסמה של ${u.name} עודכנה`);
