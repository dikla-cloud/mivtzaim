// רשת הדגמה – נתונים מקומיים לבדיקת האפליקציה בלי גישה לאתרי הרשתות (DEMO=1)
const day = 86400000;
const d = (n) => new Date(Date.now() + n * day).toISOString().slice(0, 10);

const prices = `<?xml version="1.0" encoding="utf-8"?>
<root><ChainId>7290000000000</ChainId><Items>
<Item><ItemCode>7290004131074</ItemCode><ItemName>חלב טרי 3% בקרטון 1 ליטר תנובה</ItemName><ItemPrice>7.12</ItemPrice></Item>
<Item><ItemCode>7290000066318</ItemCode><ItemName>קוטג' 5% תנובה 250 גרם</ItemName><ItemPrice>6.90</ItemPrice></Item>
<Item><ItemCode>7290011194246</ItemCode><ItemName>במבה אסם 80 גרם</ItemName><ItemPrice>5.20</ItemPrice></Item>
<Item><ItemCode>7290000072753</ItemCode><ItemName>שמן קנולה 1 ליטר</ItemName><ItemPrice>12.90</ItemPrice></Item>
<Item><ItemCode>7290000171067</ItemCode><ItemName>ביצים L תבנית 12</ItemName><ItemPrice>14.20</ItemPrice></Item>
</Items></root>`;

const promos = (n) => `<?xml version="1.0" encoding="utf-8"?>
<Root><ChainId>7290000000000</ChainId><Promotions>
<Promotion><PromotionId>${n}01</PromotionId><PromotionDescription>קוטג' 5% – 3 ב-15 ₪</PromotionDescription>
<PromotionStartDate>${d(-1)}</PromotionStartDate><PromotionEndDate>${d(5 + n)}</PromotionEndDate><PromotionEndHour>23:59</PromotionEndHour>
<MinQty>3</MinQty><DiscountedPrice>15</DiscountedPrice><Clubs><ClubId>0</ClubId></Clubs>
<PromotionItems><Item><ItemCode>7290000066318</ItemCode></Item></PromotionItems></Promotion>
<Promotion><PromotionId>${n}02</PromotionId><PromotionDescription>במבה 80 גרם ב-${n === 1 ? '3.90' : '4.50'}</PromotionDescription>
<PromotionStartDate>${d(0)}</PromotionStartDate><PromotionEndDate>${d(2 + n)}</PromotionEndDate>
<MinQty>1</MinQty><DiscountedPrice>${n === 1 ? '3.90' : '4.50'}</DiscountedPrice><Clubs><ClubId>1</ClubId></Clubs>
<PromotionItems><Item><ItemCode>7290011194246</ItemCode></Item></PromotionItems></Promotion>
<Promotion><PromotionId>${n}03</PromotionId><PromotionDescription>שמן קנולה 2 ב-20</PromotionDescription>
<PromotionStartDate>${d(-3)}</PromotionStartDate><PromotionEndDate>${d(-1)}</PromotionEndDate>
<MinQty>2</MinQty><DiscountedPrice>20</DiscountedPrice>
<PromotionItems><Item><ItemCode>7290000072753</ItemCode></Item></PromotionItems></Promotion>
</Promotions></Root>`;

module.exports = {
  id: 'demo',
  name: 'רשת הדגמה',
  async stores() {
    return [
      { storeId: '1', name: 'סניף דיזנגוף', address: 'דיזנגוף 50', city: 'תל אביב', lat: 32.0779, lon: 34.7745 },
      { storeId: '2', name: 'סניף רמת גן', address: 'ביאליק 20', city: 'רמת גן', lat: 32.0823, lon: 34.8136 },
      { storeId: '3', name: 'סניף חיפה', address: 'הנביאים 10', city: 'חיפה', lat: 32.8156, lon: 34.9893 },
    ];
  },
  async storeFiles(storeId) {
    return { promos: promos(Number(storeId)), prices };
  },
};
