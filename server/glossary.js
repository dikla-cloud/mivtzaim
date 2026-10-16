// מילון מוצרי מכולת: עברית → גרמנית (ובאוסטריה המונח המקומי) ואנגלית.
// נבדק לפני שירות התרגום המקוון, כי לשמות מוצרים קצרים הוא מחזיר לעיתים תרגומים שגויים.
// הסדר חשוב: ביטויים ספציפיים קודם (שמן זית לפני שמן, בשר טחון לפני בשר).
const G = [
  ['שוקולד', 'Schokolade', 'chocolate'], ['שוקו', 'Kakao', 'chocolate milk'],
  ['שמן זית', 'Olivenöl', 'olive oil'], ['שמן קנולה', 'Rapsöl', 'canola oil'], ['שמן חמניות', 'Sonnenblumenöl', 'sunflower oil'], ['שמן', 'Öl', 'oil'],
  ['חזה עוף', 'Hühnerbrust', 'chicken breast'], ['שוקי עוף', 'Hühnerkeulen', 'chicken drumsticks'], ['כנפי עוף', 'Chicken Wings', 'chicken wings'], ['עוף', 'Hähnchen', 'chicken'],
  ['בשר טחון', 'Hackfleisch', 'mince', 'Faschiertes'], ['בשר בקר', 'Rindfleisch', 'beef'], ['בשר צלי', 'Rinderbraten', 'roast beef'], ['אנטריקוט', 'Entrecote', 'scotch fillet'],
  ['סטייק', 'Steak', 'steak'], ['שניצל', 'Schnitzel', 'schnitzel'], ['הודו', 'Pute', 'turkey'], ['כבש', 'Lamm', 'lamb'], ['בשר', 'Fleisch', 'meat'],
  ['נקניקיות', 'Würstchen', 'sausages', 'Würstel'], ['נקניק', 'Wurst', 'salami'],
  ['סלמון', 'Lachs', 'salmon'], ['טונה', 'Thunfisch', 'tuna'], ['דג', 'Fisch', 'fish'],
  ['חלב', 'Milch', 'milk'], ['שמנת חמוצה', 'Sauerrahm', 'sour cream'], ['שמנת', 'Sahne', 'cream', 'Schlagobers'],
  ['קוטג', 'Hüttenkäse', 'cottage cheese'], ['גבינה לבנה', 'Quark', 'cream cheese', 'Topfen'], ['גבינת שמנת', 'Frischkäse', 'cream cheese'],
  ['גבינה צהובה', 'Käse', 'cheese'], ['גבינה בולגרית', 'Feta', 'feta'], ['מוצרלה', 'Mozzarella', 'mozzarella'], ['גבינ', 'Käse', 'cheese'],
  ['יוגורט', 'Joghurt', 'yoghurt'], ['חמאה', 'Butter', 'butter'], ['ביצ', 'Eier', 'eggs'],
  ['לחמניות', 'Brötchen', 'bread rolls', 'Semmeln'], ['פיתות', 'Fladenbrot', 'pita bread'], ['פיתה', 'Fladenbrot', 'pita bread'], ['לחם', 'Brot', 'bread'],
  ['קמח', 'Mehl', 'flour'], ['סוכר', 'Zucker', 'sugar'], ['מלח', 'Salz', 'salt'], ['אורז', 'Reis', 'rice'], ['ספגטי', 'Spaghetti', 'spaghetti'], ['פסטה', 'Nudeln', 'pasta'],
  ['קוסקוס', 'Couscous', 'couscous'], ['דגני בוקר', 'Cornflakes', 'cereal'], ['קורנפלקס', 'Cornflakes', 'cornflakes'], ['שיבולת שועל', 'Haferflocken', 'rolled oats'],
  ['תפוחי אדמה', 'Kartoffeln', 'potatoes', 'Erdäpfel'], ['תפוח אדמה', 'Kartoffeln', 'potatoes', 'Erdäpfel'], ['בטטה', 'Süßkartoffel', 'sweet potato'],
  ['עגבני', 'Tomaten', 'tomatoes', 'Paradeiser'], ['מלפפון', 'Gurken', 'cucumber'], ['גזר', 'Karotten', 'carrots'], ['בצל', 'Zwiebeln', 'onions'], ['שום', 'Knoblauch', 'garlic'],
  ['פלפל', 'Paprika', 'capsicum'], ['חסה', 'Salat', 'lettuce'], ['כרוב', 'Kraut', 'cabbage'], ['ברוקולי', 'Brokkoli', 'broccoli'], ['כרובית', 'Karfiol', 'cauliflower'],
  ['פטרי', 'Champignons', 'mushrooms'], ['חציל', 'Aubergine', 'eggplant', 'Melanzani'], ['קישוא', 'Zucchini', 'zucchini'], ['תירס', 'Mais', 'corn'], ['אבוקדו', 'Avocado', 'avocado'],
  ['תפוח', 'Äpfel', 'apples'], ['בננ', 'Bananen', 'bananas'], ['תפוז', 'Orangen', 'oranges'], ['לימון', 'Zitronen', 'lemons'], ['ענב', 'Trauben', 'grapes'],
  ['תות', 'Erdbeeren', 'strawberries'], ['אבטיח', 'Wassermelone', 'watermelon'], ['אגס', 'Birnen', 'pears'], ['אפרסק', 'Pfirsiche', 'peaches'], ['מנגו', 'Mango', 'mango'],
  ['קפה', 'Kaffee', 'coffee'], ['תה', 'Tee', 'tea'], ['מיץ', 'Saft', 'juice'], ['מים', 'Mineralwasser', 'water'], ['קולה', 'Cola', 'cola'], ['בירה', 'Bier', 'beer'], ['יין', 'Wein', 'wine'],
  ['עוגיות', 'Kekse', 'biscuits'], ['במבה', 'Erdnussflips', 'peanut puffs'], ['חטיפ', 'Chips', 'chips'], ['גלידה', 'Eis', 'ice cream'],
  ['דבש', 'Honig', 'honey'], ['ריבה', 'Marmelade', 'jam'], ['קטשופ', 'Ketchup', 'tomato sauce'], ['מיונז', 'Mayonnaise', 'mayonnaise'], ['חומוס', 'Hummus', 'hummus'], ['טחינה', 'Tahini', 'tahini'],
  ['אגוזי', 'Nüsse', 'nuts'], ['שקדים', 'Mandeln', 'almonds'], ['בוטנים', 'Erdnüsse', 'peanuts'],
  ['נייר טואלט', 'Toilettenpapier', 'toilet paper'], ['מגבות נייר', 'Küchenrolle', 'paper towel'], ['סבון', 'Seife', 'soap'], ['שמפו', 'Shampoo', 'shampoo'],
  ['אבקת כביסה', 'Waschmittel', 'laundry detergent'], ['נוזל כלים', 'Spülmittel', 'dishwashing liquid'], ['משחת שיניים', 'Zahnpasta', 'toothpaste'], ['חיתולים', 'Windeln', 'nappies'],
  ['מזון לחתול', 'Katzenfutter', 'cat food'], ['מזון לכלב', 'Hundefutter', 'dog food'],
];

const norm = (s) => String(s).split('|')[0].replace(/[׳'"״]/g, '').trim();

// lang: 'de' / 'en'; country משמש לבחירת המונח האוסטרי (Faschiertes, Topfen…)
function lookup(text, lang, country) {
  const t = norm(text);
  const words = t.split(/\s+/).flatMap((w) => (/^[הובלמש]/.test(w) && w.length > 3 ? [w, w.slice(1)] : [w]));
  const hit = G.find(([k]) => (k.includes(' ') ? t.includes(k) : words.some((w) => w.startsWith(k))));
  if (!hit) return null;
  const [, de, en, at] = hit;
  if (lang === 'en') return en;
  return country === 'AT' && at ? at : de;
}

module.exports = { lookup };
