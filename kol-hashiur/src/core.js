/* הגדרות, חישוב פרמטרים ושרשרת הצליל הרגילה (זהה לתצוגה מקדימה ולהפקה) */

const DEFAULTS = {
  speed: 1, pitch: 0, vinyl: false, volume: 1,
  warmth: 0, clarity: 0, soften: 0, presence: 0,
  nr: 0, hum: false, gate: 0,
  reverbType: 'dry', reverbAmt: 0, pathos: 0,
  silOn: false, silMin: 1, silKeep: 0.3,
  mono: false, normalize: false,
};

const REVERBS = {
  dry: { name: 'יבש', rt: 0 },
  small: { name: 'חדר קטן', rt: 0.35, pre: 0.008, dark: 0.55 },
  midrash: { name: 'בית מדרש', rt: 1.0, pre: 0.015, dark: 0.4 },
  hall: { name: 'אולם', rt: 2.2, pre: 0.022, dark: 0.3 },
  shul: { name: 'בית כנסת גדול', rt: 3.6, pre: 0.03, dark: 0.22 },
};

const SLIDERS = [
  { group: 'speed', id: 'speed', label: 'מהירות', min: 0.5, max: 3, step: 0.05, fmt: (v) => v.toFixed(2) + ' פי', lo: 'איטי יותר', hi: 'מהיר יותר',
    quick: [0.75, 1, 1.25, 1.5, 1.75, 2] },
  { group: 'speed', id: 'pitch', label: 'גובה הקול', min: -6, max: 6, step: 0.5, fmt: (v) => (v > 0 ? '+' : '') + v + ' חצאי טונים', lo: 'עמוק יותר', hi: 'גבוה יותר' },
  { group: 'speed', id: 'vinyl', label: 'מהירות וגובה יחד (כמו תקליט)', type: 'toggle', hint: 'כשהמתג דלוק, שינוי המהירות משנה גם את גובה הקול, לשימוש אומנותי.' },
  { group: 'sound', id: 'volume', label: 'עוצמה', min: 0, max: 4, step: 0.05, fmt: (v) => Math.round(v * 100) + ' אחוז', lo: 'שקט', hi: 'פי ארבעה', hint: 'מגביל אוטומטי מונע צרימה.' },
  { group: 'sound', id: 'warmth', label: 'חום', min: 0, max: 100, step: 1, fmt: (v) => v + '', lo: 'רגיל', hi: 'מלא ועמוק', hint: 'מחזק את הצלילים הנמוכים והבינוניים, בערך 120 עד 300 הרץ.' },
  { group: 'sound', id: 'clarity', label: 'בהירות', min: 0, max: 100, step: 1, fmt: (v) => v + '', lo: 'רגיל', hi: 'ברור מאוד', hint: 'מדגיש את תדרי הדיבור, בערך 2 עד 5 קילוהרץ, להבנת מילים ברכב.' },
  { group: 'sound', id: 'soften', label: 'ריכוך צלילים חדים', min: 0, max: 100, step: 1, fmt: (v) => v + '', lo: 'רגיל', hi: 'רך מאוד', hint: 'מרכך את הצלילים החדים, נוח לאוזניות בלילה.' },
  { group: 'sound', id: 'presence', label: 'נוכחות', min: 0, max: 100, step: 1, fmt: (v) => v + '', lo: 'טבעי', hi: 'אחיד מאוד', hint: 'דחיסה שמשווה בין קטעים חלשים לחזקים, כך שלא צריך לגעת בעוצמה.' },
  { group: 'clean', id: 'nr', label: 'ניקוי רעש', min: 0, max: 100, step: 1, fmt: (v) => v + '', lo: 'בלי', hi: 'חזק', hint: 'מפחית זמזום, מזגן ורעש רחוב. השינוי נשמע אחרי שמרפים את האצבע.', heavy: true },
  { group: 'clean', id: 'hum', label: 'הסרת זמזום חשמל', type: 'toggle', hint: 'מסנן את הזמזום של 50 הרץ ושל הצלילים הגבוהים ממנו.', heavy: true },
  { group: 'clean', id: 'gate', label: 'שער רעש', min: 0, max: 100, step: 1, fmt: (v) => v + '', lo: 'כבוי', hi: 'חזק', hint: 'משתיק את הרקע בין משפטים.' },
  { group: 'room', id: 'reverbType', label: 'הדהוד', type: 'select', options: Object.keys(REVERBS).map((k) => [k, REVERBS[k].name]) },
  { group: 'room', id: 'reverbAmt', label: 'כמות הדהוד', min: 0, max: 100, step: 1, fmt: (v) => v + '', lo: 'מעט', hi: 'הרבה' },
  { group: 'room', id: 'pathos', label: 'דינמיקה (פאתוס)', min: -100, max: 100, step: 1, fmt: (v) => (v > 0 ? 'פאתוס ' + v : v < 0 ? 'ענייני ' + (-v) : 'טבעי'), lo: 'בלי פאתוס', hi: 'פאתוס',
    hint: 'זהו צבע קול, לא רגש אמיתי. רגש אמיתי - בשלב הבינה.' },
  { group: 'time', id: 'silOn', label: 'קיצור שתיקות', type: 'toggle', heavy: true },
  { group: 'time', id: 'silMin', label: 'שתיקה ארוכה מ', min: 0.3, max: 3, step: 0.1, fmt: (v) => v.toFixed(1) + ' שניות', lo: 'קצרה', hi: 'ארוכה', heavy: true },
  { group: 'time', id: 'silKeep', label: 'מתקצרת ל', min: 0.1, max: 1, step: 0.05, fmt: (v) => v.toFixed(2) + ' שניות', lo: 'קצרה', hi: 'ארוכה', heavy: true },
  { group: 'time', id: 'mono', label: 'חד-ערוצי (חוסך חצי מהנפח)', type: 'toggle', hint: 'בדיבור אין הבדל בין חד-ערוצי לסטריאו.', heavy: true },
  { group: 'time', id: 'normalize', label: 'נרמול עוצמה לפודקאסטים', type: 'toggle', hint: 'מביא את כל ההקלטה לעוצמה תקנית של פודקאסטים.' },
];
const GROUPS = {
  speed: 'מהירות וגובה', sound: 'צליל', clean: 'ניקוי', room: 'חלל ורגש', time: 'זמן ופלט',
};

const PRESETS = [
  { id: 'radio', name: 'קריין רדיו', v: { warmth: 75, clarity: 40, presence: 80, nr: 50, pitch: -1, reverbType: 'dry' } },
  { id: 'midrash', name: 'שיעור חי בבית מדרש', v: { presence: 25, reverbType: 'midrash', reverbAmt: 25 } },
  { id: 'pathos', name: 'נאום בפאתוס', v: { pathos: 70, reverbType: 'hall', reverbAmt: 40, speed: 0.95, warmth: 70 } },
  { id: 'plain', name: 'ענייני ובלי פאתוס', v: { pathos: -70, reverbType: 'dry', clarity: 35, speed: 1.1 } },
  { id: 'drive', name: 'לנהיגה', v: { presence: 95, clarity: 70, volume: 1.8, silOn: true, silMin: 0.8, silKeep: 0.25, nr: 30, normalize: true } },
  { id: 'night', name: 'לאוזניות בלילה', v: { volume: 0.8, soften: 60, warmth: 50, reverbType: 'dry', reverbAmt: 0 } },
  { id: 'fast', name: 'חזרה מהירה', v: { speed: 1.75, silOn: true, silMin: 0.5, silKeep: 0.15, clarity: 50 } },
  { id: 'phone', name: 'הקלטה מהטלפון', v: { nr: 75, hum: true, normalize: true, warmth: 45 } },
];

function derive(S) {
  const p = S.pathos;
  const pos = Math.max(0, p) / 100, neg = Math.max(0, -p) / 100;
  const pres = Math.min(100, S.presence + neg * 60);
  const E = {};
  E.tempo = S.speed;
  E.ratio = Math.pow(2, S.pitch / 12) * (S.vinyl ? 1 : 1 / S.speed);
  E.gateTh = S.gate > 0 ? -80 + S.gate * 0.45 : null;
  E.expRatio = 1 + pos * 1.3;
  E.expTh = -30;
  E.warmDb = S.warmth * 0.09 + pos * 3;
  E.clarDb = S.clarity * 0.08 + neg * 3;
  E.softHz = 20000 - S.soften / 100 * 14000;
  E.softDb = -S.soften * 0.06;
  E.compTh = -12 - pres * 0.28;
  E.compRatio = 1 + pres * 0.15;
  E.compMakeup = pres * 0.07;
  E.reverbType = S.reverbType;
  let wet = S.reverbType === 'dry' ? 0 : S.reverbAmt / 100 * 0.7;
  wet = wet * (1 - neg) + (S.reverbType === 'dry' ? 0 : pos * 0.12);
  E.wet = wet;
  E.gain = S.volume * Math.pow(10, (S.normalize && S._normDb ? S._normDb : 0) / 20);
  return E;
}
function voiceParams(E) {
  return { ratio: E.ratio, gateTh: E.gateTh, expRatio: E.expRatio, expTh: E.expTh };
}

const irCache = new Map();
function makeIR(ctx, type) {
  const key = type + '@' + ctx.sampleRate;
  if (irCache.has(key)) return irCache.get(key);
  const R = REVERBS[type];
  if (!R || !R.rt) return null;
  const sr = ctx.sampleRate, len = Math.floor(sr * (R.rt * 1.1 + R.pre));
  const buf = ctx.createBuffer(2, len, sr);
  let seed = 12345;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 * 2 - 1; };
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    let lp = 0;
    const pre = Math.floor(R.pre * sr);
    let energy = 0;
    for (let i = pre; i < len; i++) {
      const t = (i - pre) / sr;
      const env = Math.pow(10, -3 * t / R.rt);
      const a = Math.max(0.03, R.dark * Math.exp(-t / (R.rt * 0.6)) + 0.04);
      lp += a * (rnd() - lp);
      d[i] = lp * env;
      energy += d[i] * d[i];
    }
    const norm = 1 / Math.sqrt(energy + 1e-9) * 0.9;
    for (let i = 0; i < len; i++) d[i] *= norm;
  }
  irCache.set(key, buf);
  return buf;
}

/* בונה את שרשרת הצליל הרגילה. input הוא צומת הקלט, מחזיר צומת פלט ופונקציית עדכון */
function buildNative(ctx, input, E, smooth) {
  const mk = (type, f, q, g) => { const n = ctx.createBiquadFilter(); n.type = type; n.frequency.value = f; n.Q.value = q; n.gain.value = g; return n; };
  const warm = mk('peaking', 200, 0.7, E.warmDb);
  const clar = mk('peaking', 3200, 0.8, E.clarDb);
  const softLp = mk('lowpass', E.softHz, 0.7, 0);
  const softSh = mk('highshelf', 6000, 0.7, E.softDb);
  const comp = ctx.createDynamicsCompressor();
  comp.knee.value = 18; comp.attack.value = 0.01; comp.release.value = 0.22;
  const makeup = ctx.createGain();
  const dry = ctx.createGain(), wetG = ctx.createGain(), sum = ctx.createGain();
  const conv = ctx.createConvolver();
  const outG = ctx.createGain();
  const lim = ctx.createDynamicsCompressor();
  lim.threshold.value = E.noLimiter ? 0 : -2; lim.knee.value = 0; lim.ratio.value = E.noLimiter ? 1 : 20; lim.attack.value = 0.002; lim.release.value = 0.1;
  input.connect(warm); warm.connect(clar); clar.connect(softLp); softLp.connect(softSh); softSh.connect(comp); comp.connect(makeup);
  makeup.connect(dry); dry.connect(sum);
  makeup.connect(conv); conv.connect(wetG); wetG.connect(sum);
  sum.connect(outG); outG.connect(lim);
  let curType = null;
  function set(param, v) {
    if (smooth) param.setTargetAtTime(v, ctx.currentTime, 0.03); else param.value = v;
  }
  function update(E2) {
    set(warm.gain, E2.warmDb); set(clar.gain, E2.clarDb);
    set(softLp.frequency, E2.softHz); set(softSh.gain, E2.softDb);
    set(comp.threshold, E2.compTh); set(comp.ratio, E2.compRatio);
    set(makeup.gain, Math.pow(10, E2.compMakeup / 20));
    set(wetG.gain, E2.wet);
    set(outG.gain, E2.gain);
    if (E2.reverbType !== curType) { curType = E2.reverbType; conv.buffer = makeIR(ctx, curType); }
  }
  update(E);
  if (!smooth) { comp.threshold.value = E.compTh; }
  return { output: lim, update };
}
