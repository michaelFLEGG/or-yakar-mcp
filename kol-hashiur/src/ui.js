/* ממשק המשתמש */
const $ = (id) => document.getElementById(id);
const cssVar = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const isHttp = /^https?:$/.test(location.protocol);
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
};

/* ===== חלונות קטנים בעברית ===== */
function dialog(bodyHtml, buttons) {
  return new Promise((res) => {
    const d = $('dlg');
    $('dlgBody').innerHTML = bodyHtml;
    const bx = $('dlgBtns'); bx.innerHTML = '';
    buttons.forEach((b) => {
      const el = document.createElement('button');
      el.type = 'button'; el.textContent = b.text; if (b.cls) el.className = b.cls;
      el.onclick = () => { const v = b.value === 'input' ? ($('dlgInput') ? $('dlgInput').value : '') : b.value; d.close(); res(v); };
      bx.appendChild(el);
    });
    d.onclose = () => res(null);
    d.showModal();
    const inp = $('dlgInput'); if (inp) inp.focus();
  });
}
const askText = (title) => dialog('<p><b>' + title + '</b></p><input type="text" id="dlgInput" maxlength="40">', [{ text: 'שמור', value: 'input', cls: 'primary' }, { text: 'ביטול', value: null }]);
const askConfirm = (txt, yes) => dialog('<p>' + txt + '</p>', [{ text: yes || 'אישור', value: true, cls: 'primary' }, { text: 'ביטול', value: false }]);
const tell = (html) => dialog(html, [{ text: 'הבנתי', value: true, cls: 'primary' }]);

function listHtml(items) {
  return '<ol class="heb">' + items.map((t, i) => '<li><b>' + heb(i + 1) + '.</b> ' + t + '</li>').join('') + '</ol>';
}

/* ===== ערכת נושא ===== */
const THEMES = [['auto', 'אוטומטי'], ['light', 'בהיר'], ['dark', 'כהה']];
let themeIdx = Math.max(0, THEMES.findIndex((t) => t[0] === store.get('kh_theme', 'auto')));
function applyTheme() {
  const t = THEMES[themeIdx];
  if (t[0] === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', t[0]);
  $('btnTheme').textContent = 'מצב תצוגה: ' + t[1];
  setTimeout(() => A.orig && buildWaves(), 50);
}
$('btnTheme').onclick = () => { themeIdx = (themeIdx + 1) % THEMES.length; store.set('kh_theme', THEMES[themeIdx][0]); applyTheme(); };

/* ===== בניית פקדי הכוונון ===== */
const ctrl = {};
let heavyTimer = null, normTimer = null;

function setValueLabel(def, v) {
  const el = ctrl[def.id] && ctrl[def.id].val;
  if (el) el.innerHTML = '<bdi dir="ltr">' + def.fmt(v) + '</bdi>';
}
function onSliderInput(def, v) {
  A.S[def.id] = v;
  A.presetName = 'מותאם אישית'; $('presetNow').textContent = '';
  if (def.id === 'speed') updateSpeedQuick();
  setValueLabel(def, v);
  if (def.heavy) { /* ממתינים לשחרור */ } else { P.applyParams(); schedulePeaks(); scheduleNorm(); updateSize(); }
}
function onSliderChange(def) {
  if (def.heavy) schedulePre();
  scheduleNorm();
}
function resetOne(def) {
  const v = DEFAULTS[def.id];
  A.S[def.id] = v;
  syncOne(def);
  onSliderInput(def, v); onSliderChange(def);
}
function syncOne(def) {
  const c = ctrl[def.id]; if (!c) return;
  const v = A.S[def.id];
  if (def.type === 'toggle') c.input.checked = !!v;
  else if (def.type === 'select') c.input.value = v;
  else { c.input.value = v; setValueLabel(def, v); }
}
function syncUI() { SLIDERS.forEach(syncOne); updateSpeedQuick(); updateReverbEnabled(); }

function buildControls() {
  const host = $('groups'); host.innerHTML = '';
  const by = {};
  SLIDERS.forEach((d) => (by[d.group] = by[d.group] || []).push(d));
  Object.keys(GROUPS).forEach((g, gi) => {
    const det = document.createElement('details'); det.className = 'grp'; det.open = gi < 2;
    det.innerHTML = '<summary>' + GROUPS[g] + '</summary>';
    by[g].forEach((def) => {
      const row = document.createElement('div'); row.className = 'sl';
      const id = 'c_' + def.id;
      if (def.type === 'toggle') {
        row.innerHTML = '<div class="tg"><input type="checkbox" id="' + id + '"><label for="' + id + '">' + def.label + '</label></div>' + (def.hint ? '<div class="hint">' + def.hint + '</div>' : '');
        const inp = row.querySelector('input');
        inp.onchange = () => { A.S[def.id] = inp.checked; A.presetName = 'מותאם אישית'; if (def.heavy) schedulePre(); else { P.applyParams(); } if (def.id === 'normalize') { if (inp.checked) runNorm(); else { A.S._normDb = 0; P.applyParams(); $('normInfo').textContent = ''; } } updateSize(); };
        ctrl[def.id] = { input: inp };
      } else if (def.type === 'select') {
        row.innerHTML = '<div class="tg"><label for="' + id + '">' + def.label + '</label><select id="' + id + '">' + def.options.map((o) => '<option value="' + o[0] + '">' + o[1] + '</option>').join('') + '</select></div>';
        const inp = row.querySelector('select');
        inp.onchange = () => { A.S[def.id] = inp.value; A.presetName = 'מותאם אישית'; updateReverbEnabled(); P.applyParams(); scheduleNorm(); };
        ctrl[def.id] = { input: inp };
      } else {
        row.innerHTML = '<div class="head"><label for="' + id + '">' + def.label + '</label><span class="val"></span><button type="button" class="rst" aria-label="איפוס ' + def.label + '">איפוס</button></div>' +
          '<input type="range" id="' + id + '" min="' + def.min + '" max="' + def.max + '" step="' + def.step + '">' +
          '<div class="ends"><span>' + def.lo + '</span><span>' + def.hi + '</span></div>' + (def.hint ? '<div class="hint">' + def.hint + '</div>' : '');
        if (def.quick) {
          const q = document.createElement('div'); q.className = 'quick';
          def.quick.forEach((v) => { const b = document.createElement('button'); b.type = 'button'; b.dataset.v = v; b.innerHTML = '<bdi dir="ltr">' + v + '</bdi>'; b.onclick = () => { ctrl.speed.input.value = v; onSliderInput(def, v); onSliderChange(def); }; q.appendChild(b); });
          row.insertBefore(q, row.querySelector('input'));
        }
        const inp = row.querySelector('input');
        inp.oninput = () => onSliderInput(def, parseFloat(inp.value));
        inp.onchange = () => onSliderChange(def);
        inp.ondblclick = () => resetOne(def);
        let last = 0;
        inp.addEventListener('pointerup', () => { const n = Date.now(); if (n - last < 350) resetOne(def); last = n; });
        row.querySelector('.rst').onclick = () => resetOne(def);
        ctrl[def.id] = { input: inp, val: row.querySelector('.val') };
      }
      det.appendChild(row);
    });
    host.appendChild(det);
  });
}
function updateSpeedQuick() {
  document.querySelectorAll('.quick button').forEach((b) => b.classList.toggle('on', Math.abs(parseFloat(b.dataset.v) - A.S.speed) < 0.001));
}
function updateReverbEnabled() {
  if (ctrl.reverbAmt) ctrl.reverbAmt.input.disabled = A.S.reverbType === 'dry';
}

/* ===== ערכות ===== */
function buildPresets() {
  const host = $('presets'); host.innerHTML = '';
  PRESETS.forEach((p) => {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = p.name;
    b.onclick = () => applyPreset(p.name, p.v);
    host.appendChild(b);
  });
  renderCustom();
}
function renderCustom() {
  const host = $('custom'); host.innerHTML = '';
  const list = store.get('kh_presets', []);
  list.forEach((p, i) => {
    const w = document.createElement('div'); w.className = 'row';
    const b = document.createElement('button'); b.type = 'button'; b.style.flex = '1'; b.textContent = p.name; b.onclick = () => applyPreset(p.name, p.v);
    const x = document.createElement('button'); x.type = 'button'; x.className = 'warn'; x.textContent = 'מחק'; x.setAttribute('aria-label', 'מחיקת הערכה ' + p.name);
    x.onclick = async () => { if (await askConfirm('למחוק את הערכה "' + p.name + '"?', 'מחק')) { list.splice(i, 1); store.set('kh_presets', list); renderCustom(); fillSecond(); } };
    w.append(b, x); host.appendChild(w);
  });
}
function allPresets() { return PRESETS.map((p) => ({ name: p.name, v: p.v })).concat(store.get('kh_presets', [])); }
function applyPreset(name, v) {
  A.S = Object.assign({}, DEFAULTS, v, { _normDb: 0 });
  A.presetName = name;
  syncUI(); P.applyParams(); schedulePre(); schedulePeaks(); scheduleNorm(); updateSize();
  $('presetNow').textContent = 'הערכה שנבחרה: ' + name + '. אפשר לכוונן אחריה.';
}
$('bSavePreset').onclick = async () => {
  const name = await askText('שם לערכה שלך');
  if (!name || !name.trim()) return;
  const v = {}; Object.keys(DEFAULTS).forEach((k) => { v[k] = A.S[k]; });
  const list = store.get('kh_presets', []).filter((p) => p.name !== name.trim());
  list.push({ name: name.trim(), v }); store.set('kh_presets', list);
  A.presetName = name.trim(); renderCustom(); fillSecond();
  $('presetNow').textContent = 'הערכה "' + name.trim() + '" נשמרה בדפדפן.';
};
$('bResetAll').onclick = () => { A.S = Object.assign({}, DEFAULTS, { _normDb: 0 }); A.presetName = 'מותאם אישית'; syncUI(); P.applyParams(); schedulePre(); schedulePeaks(); updateSize(); $('presetNow').textContent = 'כל ההגדרות חזרו לברירת המחדל.'; };

/* ===== גלי קול ===== */
let wsO = null, wsP = null, zoomPx = 0, curO = null, curP = null, loopBoxO = null, loopBoxP = null;
let origPeaks = null, viewScale = 1;
const COLS = () => Math.max(400, Math.min(24000, Math.ceil(A.orig.durationSec * 20)));

function symPeaks(p, scale) {
  const out = new Float32Array(p.length * 2);
  for (let i = 0; i < p.length; i++) { const m = Math.min(1, p[i] * scale); out[2 * i] = m; out[2 * i + 1] = -m; }
  return out;
}
function mkWave(container, color, peaks) {
  container.innerHTML = '';
  const ws = WaveSurfer.create({ container, height: 96, waveColor: color, progressColor: color, cursorWidth: 0, peaks: [peaks], duration: A.orig.durationSec, normalize: false, minPxPerSec: zoomPx || 0, autoScroll: false, autoCenter: false, interact: false, hideScrollbar: false, barWidth: 2, barGap: 1, barRadius: 1 });
  const wrap = ws.getWrapper();
  const cur = document.createElement('div');
  cur.style.cssText = 'position:absolute;top:0;bottom:0;width:3px;background:' + cssVar('--cursor') + ';pointer-events:none;z-index:5;left:0';
  const box = document.createElement('div');
  box.style.cssText = 'position:absolute;top:0;bottom:0;background:' + cssVar('--acc2') + ';opacity:.28;pointer-events:none;z-index:4;display:none';
  wrap.appendChild(box); wrap.appendChild(cur);
  wrap.style.cursor = 'pointer';
  wrap.addEventListener('click', (e) => {
    const r = wrap.getBoundingClientRect();
    P.seek(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * A.orig.durationSec);
  });
  return { ws, cur, box };
}
function origScale() { let m = 0; for (let i = 0; i < origPeaks.length; i++) if (origPeaks[i] > m) m = origPeaks[i]; return m > 0 ? 0.92 / m : 1; }
function procPeaksArr() {
  if (!A.pre.peaksBase) A.pre.peaksBase = computePeaks(A.pre.chs, COLS(), A.pre.map, A.orig.len);
  const E = derive(A.S);
  return symPeaks(A.pre.peaksBase, viewScale * Math.min(E.gain, 4));
}
function buildWaves() {
  if (!A.orig) return;
  if (wsO) { try { wsO.ws.destroy(); } catch (e) {} } if (wsP) { try { wsP.ws.destroy(); } catch (e) {} }
  if (!origPeaks || origPeaks.owner !== A.orig) { origPeaks = computePeaks(A.orig.chs, COLS(), null, A.orig.len); origPeaks.owner = A.orig; }
  viewScale = origScale();
  wsO = mkWave($('waveO'), cssVar('--wave'), symPeaks(origPeaks, viewScale));
  wsP = mkWave($('waveP'), cssVar('--wave2'), procPeaksArr());
  zoomPx = zoomPx || 0;
  wsO.ws.on('scroll', (s) => { try { wsP.ws.setScrollTime(s); } catch (e) {} });
  drawLoop();
}
let peaksTimer = null;
function schedulePeaks() {
  clearTimeout(peaksTimer);
  peaksTimer = setTimeout(() => {
    if (!A.orig || !wsP) return;
    const sc = wsP.ws.getScroll ? wsP.ws.getScroll() : 0;
    try { wsP.ws.load('', [procPeaksArr()], A.orig.durationSec); } catch (e) { buildWaves(); }
  }, 250);
}
function fitPx() { return Math.max(10, $('waveO').clientWidth) / A.orig.durationSec; }
function setZoom(f) {
  if (!A.orig) return;
  const base = fitPx();
  zoomPx = Math.max(base, Math.min(2000, (zoomPx || base) * f));
  if (zoomPx <= base * 1.01) zoomPx = 0;
  try { wsO.ws.zoom(zoomPx || base); wsP.ws.zoom(zoomPx || base); } catch (e) {}
}
$('bZin').onclick = () => setZoom(1.7);
$('bZout').onclick = () => setZoom(1 / 1.7);

function drawLoop() {
  const L = P.loop, d = A.orig ? A.orig.durationSec : 0;
  [wsO, wsP].forEach((w) => {
    if (!w) return;
    if (L.b > L.a && d) { w.box.style.display = 'block'; w.box.style.left = (L.a / d * 100) + '%'; w.box.style.width = ((L.b - L.a) / d * 100) + '%'; }
    else if (L.a > 0 && d) { w.box.style.display = 'block'; w.box.style.left = (L.a / d * 100) + '%'; w.box.style.width = '3px'; }
    else w.box.style.display = 'none';
  });
  const t = (x) => '<bdi dir="ltr">' + fmtTime(x) + '</bdi>';
  let s;
  if (L.b > L.a) s = 'קטע הלימוד: מ-' + t(L.a) + ' עד ' + t(L.b) + '. הלולאה ' + (L.on ? 'פעילה' : 'כבויה') + '. חזרות: ' + L.count;
  else if (L.a > 0) s = 'סומנה ההתחלה ב-' + t(L.a) + '. עכשיו סמן סוף.';
  else s = 'עוד לא סומן קטע.';
  $('loopInfo').innerHTML = s;
  $('bLOn').textContent = L.on ? 'לולאה פעילה' : 'לולאה כבויה';
  $('bLOn').classList.toggle('on', L.on);
}
$('bLA').onclick = () => { const p = P.getPos(); P.loop.a = p; if (P.loop.b <= p) P.loop.b = 0; P.loop.on = false; P.loop.count = 0; drawLoop(); };
$('bLB').onclick = async () => { const p = P.getPos(); if (p <= P.loop.a) { await tell('סוף הקטע צריך להיות אחרי ההתחלה.'); return; } P.loop.b = p; await P.setLoop(true, P.loop.a, p); drawLoop(); };
$('bLOn').onclick = async () => { if (!(P.loop.b > P.loop.a)) { await tell('קודם סמן התחלה (א) וסוף (ב).'); return; } await P.setLoop(!P.loop.on, P.loop.a, P.loop.b); drawLoop(); };
$('bLClr').onclick = async () => { await P.setLoop(false, 0, 0); drawLoop(); };

/* ===== תנועה ===== */
function updatePlayBtn() { $('bPlay').textContent = P.playing ? 'עצור' : 'נגן'; }
P.onEnded = () => { updatePlayBtn(); };
$('bPlay').onclick = async () => { await P.toggle(); updatePlayBtn(); };
$('bB15').onclick = () => P.skip(-15);
$('bF30').onclick = () => P.skip(30);
$('bB5').onclick = () => P.skip(-5);
$('bStart').onclick = () => P.seek(0);
function updateAB() { $('abState').textContent = 'כרגע נשמע: ' + (P.mode === 'proc' ? 'המעובד' : 'המקור'); $('bAB').classList.toggle('on', P.mode === 'orig'); }
$('bAB').onclick = async () => { await P.setMode(P.mode === 'proc' ? 'orig' : 'proc'); updateAB(); };
document.addEventListener('keydown', (e) => {
  if (!A.orig || e.ctrlKey || e.metaKey || e.altKey) return;
  const tag = e.target.tagName;
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || $('dlg').open) return;
  if (e.code === 'Space' && tag !== 'BUTTON') { e.preventDefault(); $('bPlay').click(); }
  else if (e.key === 'ArrowRight') { e.preventDefault(); P.skip(-15); }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); P.skip(30); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); P.skip(-5); }
  else if (e.key === '+' || e.key === '=' || e.key === '-') {
    const d = SLIDERS[0]; const v = Math.round(Math.min(3, Math.max(0.5, A.S.speed + (e.key === '-' ? -0.05 : 0.05))) * 100) / 100;
    ctrl.speed.input.value = v; onSliderInput(d, v);
  }
});
function frame() {
  if (A.orig && !$('studio').classList.contains('hide')) {
    const pos = P.getPos(), d = A.orig.durationSec;
    $('timeLbl').innerHTML = '<bdi dir="ltr">' + fmtTime(pos) + ' / ' + fmtTime(d) + '</bdi>';
    [wsO, wsP].forEach((w) => { if (w) w.cur.style.left = (pos / d * 100) + '%'; });
    if (zoomPx && P.playing && wsO) {
      try { const wrap = wsO.ws.getWrapper(), w = wrap.getBoundingClientRect().width, vis = wsO.ws.getWidth(); const x = pos / d * w; const sc = wsO.ws.getScroll(); if (x < sc || x > sc + vis * 0.9) { wsO.ws.setScroll(Math.max(0, x - vis * 0.3)); } } catch (e) {}
    }
    if (P.loop.on && P.playing) { const c = P.loop.count; if (frame.lc !== c) { frame.lc = c; drawLoop(); } }
    if ($('bPlay').textContent !== (P.playing ? 'עצור' : 'נגן')) updatePlayBtn();
  }
  requestAnimationFrame(frame);
}

/* ===== הכנה מראש ===== */
let preTok = null, preTimer = null;
function busy(txt) { const b = $('busy'); if (txt) { b.textContent = txt; b.classList.remove('hide'); } else b.classList.add('hide'); }
function schedulePre() { clearTimeout(preTimer); preTimer = setTimeout(runPre, 200); }
async function runPre() {
  if (!A.orig) return;
  const want = preNeeded(A.S) ? preKey(A.S) : 'identity';
  if (A.pre.key === want) { updateSavings(); return; }
  if (preTok) preTok.cancel = true;
  const tok = { cancel: false }; preTok = tok;
  busy('מעדכן את התצוגה המקדימה');
  try {
    const np = await computePre(A.S, tok, (f) => busy('מעדכן את התצוגה המקדימה: ' + Math.round(f * 100) + ' אחוז'));
    if (tok.cancel) return;
    await P.swapPre(np);
    wsP && schedulePeaks(); updateSavings(); updateSize(); scheduleNorm();
    busy('');
  } catch (e) {
    if (e.message !== 'cancel') busy('לא הצלחתי לעדכן את התצוגה. נסה הגדרות מתונות יותר או מחשב חזק יותר.');
  } finally { if (preTok === tok) preTok = null; }
}
function updateSavings() {
  const s = A.pre && A.pre.saved;
  $('savingsLbl').textContent = A.S.silOn && s > 0.5 ? 'חסכת ' + durWords(s) : '';
}
let normTok = null;
function scheduleNorm() { if (!A.S.normalize) return; clearTimeout(normTimer); normTimer = setTimeout(runNorm, 900); }
async function runNorm() {
  if (!A.orig) return;
  if (!A.S.normalize) { A.S.normalize = true; syncOne(SLIDERS.find((d) => d.id === 'normalize')); }
  if (normTok) normTok.cancel = true;
  const tok = { cancel: false }; normTok = tok;
  $('normInfo').textContent = 'מודד עוצמה...';
  try {
    const db = await measureNormDb(A.pre, A.S, tok, null);
    if (tok.cancel) return;
    A.S._normDb = db; P.applyParams(); schedulePeaks();
    $('normInfo').textContent = 'הוחל נרמול: ' + (db >= 0 ? 'הגברה של ' : 'הנמכה של ') + Math.abs(db).toFixed(1) + ' דציבל';
  } catch (e) { if (e.message !== 'cancel') $('normInfo').textContent = 'לא הצלחתי למדוד את העוצמה.'; }
}
$('bNorm').onclick = runNorm;

/* ===== טעינה והקלטה ===== */
const drop = $('drop');
drop.onclick = () => $('file').click();
drop.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('file').click(); } };
['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
drop.addEventListener('drop', (e) => { const f = e.dataTransfer.files[0]; if (f) handleFile(f); });
$('file').onchange = () => { const f = $('file').files[0]; if (f) handleFile(f); $('file').value = ''; };
function loadMsg(txt, kind) { const m = $('loadMsg'); if (!txt) { m.classList.add('hide'); return; } m.className = 'msg ' + (kind || ''); m.textContent = txt; }

async function handleFile(file) {
  loadMsg('');
  const ok = /^(audio|video)\//.test(file.type) || /\.(mp3|m4a|wav|ogg|opus|webm|aac|mp4)$/i.test(file.name);
  if (!ok) { loadMsg('הקובץ הזה אינו קובץ קול או וידאו שאני מכיר. אפשר לבחור אם-פי-3, אם-פי-4-אי, וייב, אוג, אופוס, ווב-אם, איי-איי-סי או אם-פי-4.', 'err'); return; }
  if (!file.size) { loadMsg('הקובץ ריק.', 'err'); return; }
  P.pause();
  try {
    const o = await loadAudio(file, file.name.replace(/\.[^.]+$/, ''), (t) => loadMsg(t + '...'));
    onLoaded(o, file);
  } catch (e) {
    loadMsg(e.hebrew ? e.message : 'משהו השתבש בקריאת הקובץ. אם ההקלטה ארוכה מאוד, נסה במחשב.', 'err');
  }
}
function onLoaded(o, file) {
  loadMsg('');
  const mb = (o.size / 1048576).toFixed(1);
  const kbps = Math.round(o.size * 8 / o.durationSec / 1000);
  $('info').innerHTML = [
    'אורך: <bdi dir="ltr">' + fmtTime(o.durationSec) + '</bdi>',
    'גודל: ' + mb + ' מגה',
    'איכות: כ-' + kbps + ' קילוביט בשנייה, ' + o.sr + ' הרץ',
    'ערוצים: ' + (o.nch === 1 ? 'חד-ערוצי' : 'סטריאו'),
    file && /^video/.test(file.type) ? 'חולץ קול מקובץ וידאו' : '',
  ].filter(Boolean).map((t) => '<span class="chip">' + t + '</span>').join('');
  ['studio', 'presetsCard', 'controls', 'abCard', 'exportCard', 'aiCard'].forEach((id) => $(id).classList.remove('hide'));
  P.posO = 0; P.loop = { on: false, a: 0, b: 0, count: 0 }; P.mode = 'proc'; updateAB(); updatePlayBtn();
  A.S._normDb = 0; zoomPx = 0;
  buildWaves(); syncUI(); schedulePre(); scheduleNorm(); updateSize(); drawLoop();
  const weak = o.durationSec > 1200 && (/Android|iPhone|iPad|Mobile/i.test(navigator.userAgent) || (navigator.deviceMemory && navigator.deviceMemory <= 4));
  $('weak').classList.toggle('hide', !weak);
  $('studio').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

let rec = null;
$('btnRec').onclick = async () => {
  loadMsg('');
  if (!navigator.mediaDevices || !window.MediaRecorder) { loadMsg('הדפדפן הזה לא יודע להקליט. אפשר להעלות קובץ במקום.', 'err'); return; }
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } }); }
  catch (e) { loadMsg('אין אישור להשתמש במיקרופון. אפשר לאשר בהגדרות הדפדפן ולנסות שוב.', 'err'); return; }
  const types = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/ogg;codecs=opus'];
  const mime = types.find((t) => MediaRecorder.isTypeSupported(t)) || '';
  const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
  const chunks = []; mr.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const AC = window.AudioContext || window.webkitAudioContext, actx = new AC(), an = actx.createAnalyser();
  an.fftSize = 1024; actx.createMediaStreamSource(stream).connect(an);
  const buf = new Float32Array(1024);
  rec = { mr, stream, actx, t0: Date.now(), paused: 0, pStart: 0, raf: 0, chunks, mime: mr.mimeType || mime };
  const loop = () => {
    if (!rec) return;
    const ms = (rec.pStart ? rec.pStart : Date.now()) - rec.t0 - rec.paused;
    $('recClock').textContent = fmtTime(ms / 1000);
    an.getFloatTimeDomainData(buf); let m = 0; for (let i = 0; i < buf.length; i++) m = Math.max(m, Math.abs(buf[i]));
    $('recMeter').style.width = Math.min(100, m * 140) + '%';
    rec.raf = requestAnimationFrame(loop);
  };
  mr.start(1000); loop();
  $('recPanel').classList.add('show'); $('btnRec').disabled = true;
};
$('btnRecPause').onclick = () => {
  if (!rec) return;
  if (rec.mr.state === 'recording') { rec.mr.pause(); rec.pStart = Date.now(); $('btnRecPause').textContent = 'המשך'; }
  else { rec.mr.resume(); rec.paused += Date.now() - rec.pStart; rec.pStart = 0; $('btnRecPause').textContent = 'השהה'; }
};
$('btnRecStop').onclick = () => {
  if (!rec) return;
  const r = rec; rec = null; cancelAnimationFrame(r.raf);
  r.mr.onstop = async () => {
    r.stream.getTracks().forEach((t) => t.stop()); r.actx.close();
    $('recPanel').classList.remove('show'); $('btnRec').disabled = false; $('btnRecPause').textContent = 'השהה';
    const blob = new Blob(r.chunks, { type: r.mime || 'audio/webm' });
    const d = new Date();
    try { const o = await loadAudio(blob, 'הקלטה ' + d.toLocaleDateString('he-IL').replace(/\//g, '-') + ' ' + String(d.getHours()).padStart(2, '0') + '-' + String(d.getMinutes()).padStart(2, '0'), (t) => loadMsg(t + '...')); onLoaded(o, blob); }
    catch (e) { loadMsg(e.hebrew ? e.message : 'לא הצלחתי לקרוא את ההקלטה.', 'err'); }
  };
  r.mr.stop();
};

/* ===== האזנה עיוורת ===== */
const blind = { tally: 0, rounds: 0, map: null, timer: 0 };
function newRound() {
  blind.map = Math.random() < 0.5 ? { A: 'proc', B: 'orig' } : { A: 'orig', B: 'proc' };
  $('blindRes').textContent = 'האזן לגרסה א ולגרסה ב, ובחר.';
}
async function playBlind(which) {
  const start = Math.max(0, Math.min(P.getPos(), A.orig.durationSec - 12));
  clearTimeout(blind.timer);
  await P.startAt(start, blind.map[which]); updateAB(); updatePlayBtn();
  blind.timer = setTimeout(() => { P.pause(); updatePlayBtn(); }, 10000);
}
$('bBlind').onclick = () => { $('blind').classList.remove('hide'); blind.tally = 0; blind.rounds = 0; newRound(); };
$('bbA').onclick = () => playBlind('A');
$('bbB').onclick = () => playBlind('B');
function pick(which) {
  clearTimeout(blind.timer); P.pause(); updatePlayBtn();
  const chose = blind.map[which];
  blind.rounds++; if (chose === 'proc') blind.tally++;
  $('blindRes').textContent = 'בחרת ב' + (chose === 'proc' ? 'גרסה המעובדת' : 'מקור') + '. עד עכשיו בחרת במעובד ' + blind.tally + ' פעמים מתוך ' + blind.rounds + '. סבב חדש התחיל.';
  blind.map = Math.random() < 0.5 ? { A: 'proc', B: 'orig' } : { A: 'orig', B: 'proc' };
}
$('bpA').onclick = () => pick('A');
$('bpB').onclick = () => pick('B');

/* ===== הפקה ===== */
function fillSecond() {
  const sel = $('secondPreset'); const cur = sel.value; sel.innerHTML = '';
  allPresets().forEach((p, i) => { const o = document.createElement('option'); o.value = i; o.textContent = p.name; sel.appendChild(o); });
  const di = allPresets().findIndex((p) => p.name === 'לנהיגה'); sel.value = cur || (di >= 0 ? di : 0);
}
async function fillFormats() {
  const sel = $('fmt'); sel.innerHTML = '';
  const opusOk = await OpusEnc.supported();
  Object.keys(FORMATS).forEach((k) => { if (k === 'opus' && !opusOk) return; const o = document.createElement('option'); o.value = k; o.textContent = FORMATS[k].name; sel.appendChild(o); });
  if (!opusOk) $('sizeEst').dataset.noopus = '1';
  updateSize();
}
function updateSize() {
  if (!A.orig || !A.pre) return;
  const fmt = $('fmt').value || 'mp3', nch = A.pre.nch;
  const dur = A.pre.len / A.pre.sr / A.S.speed;
  let b = estimateBytes(fmt, nch, dur, A.pre.sr);
  if ($('second').checked) b *= 2;
  $('sizeEst').textContent = 'הנפח הצפוי: כ-' + (b / 1048576).toFixed(1) + ' מגה' + ($('second').checked ? ' (שתי הגרסאות יחד)' : '') + '. אורך אחרי העיבוד: כ-' + fmtTime(dur);
  if ($('sizeEst').dataset.noopus) $('sizeEst').textContent += '. אופוס אינו נתמך בדפדפן הזה.';
}
$('fmt').onchange = updateSize;
$('second').onchange = () => { $('secondPreset').classList.toggle('hide', !$('second').checked); updateSize(); };
let makeTok = null;
$('bCancelMake').onclick = () => { if (makeTok) makeTok.cancel = true; };
const safeName = (s) => s.replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim();
$('bMake').onclick = async () => {
  if (!A.orig || makeTok) return;
  const fmt = $('fmt').value;
  const jobs = [{ S: Object.assign({}, A.S), name: A.presetName, pre: null }];
  if ($('second').checked) {
    const p = allPresets()[parseInt($('secondPreset').value, 10)];
    if (p) jobs.push({ S: Object.assign({}, DEFAULTS, p.v, { _normDb: 0 }), name: p.name, pre: null });
  }
  P.pause(); updatePlayBtn();
  const tok = { cancel: false }; makeTok = tok;
  $('bMake').disabled = true; $('bCancelMake').classList.remove('hide'); $('prog').classList.remove('hide'); $('dl').innerHTML = '';
  const setP = (f, txt) => { $('prog').firstElementChild.style.width = Math.round(f * 100) + '%'; $('progTxt').textContent = txt; };
  try {
    for (let j = 0; j < jobs.length; j++) {
      const job = jobs[j], tag = jobs.length > 1 ? 'גרסה ' + heb(j + 1) + ': ' : '';
      setP(0, tag + 'מכין את ההקלטה...');
      if (preKey(job.S) === A.pre.key || (!preNeeded(job.S) && A.pre.key === 'identity')) job.pre = A.pre;
      else job.pre = await computePre(job.S, tok, (f) => setP(f * 0.1, tag + 'מכין את ההקלטה: ' + Math.round(f * 100) + ' אחוז'));
      const t0 = performance.now();
      const blob = await produce(job.S, fmt, tok, (p) => {
        const eta = p.eta ? ', נותרו כ-' + durWords(p.eta) : '';
        setP(0.1 + p.frac * 0.9, tag + p.stage + ': ' + Math.round(p.frac * 100) + ' אחוז' + eta);
      }, job.pre);
      const nm = safeName(A.orig.name + ' מעובד ' + job.name) + '.' + FORMATS[fmt].ext;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = nm;
      a.textContent = 'הורד: ' + nm + ' (' + (blob.size / 1048576).toFixed(1) + ' מגה)';
      $('dl').appendChild(a);
    }
    setP(1, 'הסתיים. לחץ על הקישור להורדה.');
  } catch (e) {
    $('progTxt').textContent = e.message === 'cancel' ? 'ההפקה בוטלה.' : 'ההפקה נכשלה. נסה פורמט אחר או הגדרות מתונות יותר, ובהקלטה ארוכה מומלץ להשתמש במחשב.';
  } finally {
    makeTok = null; $('bMake').disabled = false; $('bCancelMake').classList.add('hide');
  }
};

/* ===== בינה (תצוגה בלבד) ===== */
$('aiGo').onclick = () => tell('יופעל בשלב ג, דורש חיבור לשירות קול חיצוני');

/* ===== עזרה והתקנה ===== */
function installSteps() {
  return '<p><b>בטבלט (אייפד):</b></p>' + listHtml(['פתח את הקישור בדפדפן ספארי.', 'לחץ על כפתור השיתוף (ריבוע עם חץ למעלה).', 'בחר "הוספה למסך הבית".', 'לחץ "הוספה". הסמליל יופיע במסך הבית.']) +
    '<p><b>בטבלט (אנדרואיד):</b></p>' + listHtml(['פתח את הקישור בדפדפן כרום.', 'לחץ על שלוש הנקודות בפינה.', 'בחר "התקנת אפליקציה" או "הוספה למסך הבית".', 'לחץ "התקן". הסמליל יופיע במסך הבית.']) +
    '<p><b>במחשב (חלונות):</b></p>' + listHtml(['פתח את הקישור בדפדפן כרום או אדג׳.', 'בקצה סרגל הכתובת יופיע סמל של מסך קטן עם חץ. לחץ עליו.', 'לחץ "התקן".', 'האפליקציה תיפתח בחלון משלה ותופיע בתפריט התחל.']);
}
$('btnHelp').onclick = () => tell('<p><b>איך משתמשים</b></p>' + listHtml(['גרור הקלטה לאזור הגדול, או לחץ "הקלט עכשיו".', 'לחץ "קריין רדיו" או כל סגנון אחר, ותשמע את ההבדל.', 'לחץ "מעבר: מקור / מעובד" כדי להשוות באותה נקודה.', 'כוונן את המחוונים. לחיצה כפולה על מחוון מחזירה אותו לברירת המחדל.', 'לחץ "הפק קובץ מעובד" והורד.']));
let deferredInstall = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredInstall = e; });
const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
if (!standalone && isHttp) $('btnInstall').classList.remove('hide');
$('btnInstall').onclick = async () => {
  if (deferredInstall) { deferredInstall.prompt(); await deferredInstall.userChoice; deferredInstall = null; }
  else tell('<p>כדי להתקין את הסטודיו כאפליקציה:</p>' + installSteps());
};
window.addEventListener('appinstalled', () => $('btnInstall').classList.add('hide'));
if (isHttp) { $('installCard').insertAdjacentHTML('beforeend', installSteps()); if (document.body.dataset.hasStudio !== '0') $('aDownload').classList.remove('hide'); }
else $('installCard').classList.add('hide');
if (isHttp && 'serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});

/* ===== אתחול ===== */
buildControls(); buildPresets(); fillSecond(); fillFormats(); applyTheme(); syncUI();
requestAnimationFrame(frame);
