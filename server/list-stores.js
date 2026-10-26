// כל הסניפים של רשת, כמו שהם בקובץ שלה, ואיך השרת מאתר כל אחד. רק קורא – לא משנה כלום.
//   cd /opt/mivtzaim && node server/list-stores.js tivtaam
//   cd /opt/mivtzaim && node server/list-stores.js nizat "טופ"      (רק סניפים שהשם/הכתובת מכילים את המילה)
const d = require('./diagnostics');
d.cli(d.listStores);
