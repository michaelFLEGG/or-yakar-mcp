/* רשימות הערכים של ספריית האודיו באתר (זהות ל-זוהר-אודיו.html) */
const READ_TYPES = ['קריאה רגילה','קריאה איטית','קריאה מהירה','קריאה ליטאית','קריאה ספרדית','קריאה חסידית','קריאה עם פירוש','שיעור מלא'];
const TRADS = ['ספרדי','ליטאי','חסידי','תימני','אחר'];
const QUALITIES = ['אולפן','גבוהה','רגילה','שטח'];
const LANGS = ['ארמית (לשון הזוהר)','עברית (תרגום)','ארמית + עברית','אידיש','אחר'];
const BOOKS = {
  'בראשית': ['Bereshit','Noach','Lech_Lecha','Vayera','Chayei_Sara','Toldot','Vayetzei','Vayishlach','Vayeshev','Miketz','Vayigash','Vayechi'],
  'שמות': ['Shemot','Vaera','Bo','Beshalach','Yitro','Mishpatim','Terumah','Tetzaveh','Ki_Tisa','Vayakhel','Pekudei'],
  'ויקרא': ['Vayikra','Tzav','Shmini','Tazria','Metzora','Achrei_Mot','Kedoshim','Emor','Behar','Bechukotai'],
  'במדבר': ['Bamidbar','Nasso',"Beha'alotcha","Sh'lach",'Korach','Chukat','Balak','Pinchas','Matot'],
  'דברים': ['Vaetchanan','Eikev','Shoftim','Ki_Teitzei','Vayeilech',"Ha'Azinu"],
  'אדרות וספרים נסתרים': ['Introduction','Sifra_DiTzniuta','Idra_Rabba','Idra_Zuta','Tikkunei_Zohar','Zohar_Chadash','Sefer_Yetzirah','Sefer_Yetzirah_Gra_Version','Sefer_HaBahir','Addenda_Volume_I','Addenda_Volume_II','Addenda_Volume_III']
};
const PNAMES = {
  Bereshit:'בראשית', Noach:'נח', Lech_Lecha:'לך לך', Vayera:'וירא', Chayei_Sara:'חיי שרה', Toldot:'תולדות',
  Vayetzei:'ויצא', Vayishlach:'וישלח', Vayeshev:'וישב', Miketz:'מקץ', Vayigash:'ויגש', Vayechi:'ויחי',
  Shemot:'שמות', Vaera:'וארא', Bo:'בא', Beshalach:'בשלח', Yitro:'יתרו', Mishpatim:'משפטים',
  Terumah:'תרומה', Tetzaveh:'תצוה', Ki_Tisa:'כי תשא', Vayakhel:'ויקהל', Pekudei:'פקודי',
  Vayikra:'ויקרא', Tzav:'צו', Shmini:'שמיני', Tazria:'תזריע', Metzora:'מצורע', Achrei_Mot:'אחרי מות',
  Kedoshim:'קדושים', Emor:'אמור', Behar:'בהר', Bechukotai:'בחקתי',
  Bamidbar:'במדבר', Nasso:'נשא', "Beha'alotcha":'בהעלותך', "Sh'lach":'שלח לך', Korach:'קרח',
  Chukat:'חקת', Balak:'בלק', Pinchas:'פינחס', Matot:'מטות',
  Vaetchanan:'ואתחנן', Eikev:'עקב', Shoftim:'שופטים', Ki_Teitzei:'כי תצא', Vayeilech:'וילך', "Ha'Azinu":'האזינו',
  Introduction:'הקדמת הזוהר', Sifra_DiTzniuta:'ספרא דצניעותא', Idra_Rabba:'אדרא רבא', Idra_Zuta:'אדרא זוטא',
  Tikkunei_Zohar:'תיקוני הזוהר', Zohar_Chadash:'זוהר חדש', Sefer_Yetzirah:'ספר יצירה',
  Sefer_Yetzirah_Gra_Version:'ספר יצירה (גירסת הגר"א)', Sefer_HaBahir:'ספר הבהיר',
  Addenda_Volume_I:'השמטות כרך א', Addenda_Volume_II:'השמטות כרך ב', Addenda_Volume_III:'השמטות כרך ג'
};


function bookOf(pkey) { for (const b in BOOKS) if (BOOKS[b].indexOf(pkey) >= 0) return b; return ''; }
