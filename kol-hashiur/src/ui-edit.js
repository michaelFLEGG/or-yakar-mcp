/* ===== חיתוך, פרקים, פתיח וסיום, ברירת מחדל, ומספור הכותרות ===== */

const cutSel = { a: null, b: null };

function renumber() {
  let i = 0;
  document.querySelectorAll('section.card').forEach((c) => {
    const n = c.querySelector('h2 .num');
    if (!n) return;
    if (c.classList.contains('hide')) { n.textContent = ''; return; }
    i++; n.textContent = heb(i) + '.';
  });
}

/* ----- שכבת סימונים על הגלים: חיתוכים, בחירה ופרקים ----- */
function drawOverlays() {
  if (!A.orig) return;
  const d = A.orig.durationSec;
  [wsO, wsP].forEach((w) => {
    if (!w || !w.ovl) return;
    w.ovl.innerHTML = '';
    const box = (a, b, color, op, title) => {
      const e = document.createElement('div');
      e.style.cssText = 'position:absolute;top:0;bottom:0;left:' + (a / d * 100) + '%;width:max(2px,' + ((b - a) / d * 100) + '%);background:' + color + ';opacity:' + op + ';';
      if (title) e.title = title;
      w.ovl.appendChild(e);
    };
    A.edit.cuts.forEach((c) => box(c[0], c[1], '#c0392b', 0.45, 'קטע שהוסר'));
    if (cutSel.a !== null) box(cutSel.a, cutSel.b !== null ? cutSel.b : cutSel.a + d * 0.002, cssVar('--acc2'), 0.5, 'קטע מסומן');
    A.edit.chapters.forEach((ch) => {
      const e = document.createElement('div');
      e.style.cssText = 'position:absolute;top:0;bottom:0;width:3px;left:' + (ch.t / d * 100) + '%;background:' + cssVar('--acc') + ';opacity:.9';
      e.title = ch.n; w.ovl.appendChild(e);
    });
  });
}
const _drawLoop = drawLoop;
drawLoop = function () { _drawLoop(); drawOverlays(); };

/* ----- חיתוך ----- */
function mergeCuts(list) {
  list = list.filter((c) => c[1] - c[0] >= 0.2).sort((a, b) => a[0] - b[0]);
  const out = [];
  for (const c of list) {
    if (out.length && c[0] <= out[out.length - 1][1]) out[out.length - 1][1] = Math.max(out[out.length - 1][1], c[1]);
    else out.push([c[0], c[1]]);
  }
  return out;
}
function afterEdit() {
  cutSel.a = cutSel.b = null;
  renderCuts(); renderChapters(); drawOverlays();
  schedulePre();
  if (typeof updateSize === 'function') updateSize();
}
const tm = (x) => '<bdi dir="ltr">' + fmtTime(x) + '</bdi>';
function renderCuts() {
  const host = $('cutList'); host.innerHTML = '';
  let total = 0;
  A.edit.cuts.forEach((c, i) => {
    total += c[1] - c[0];
    const row = document.createElement('div'); row.className = 'row'; row.style.margin = '6px 0';
    row.innerHTML = '<span style="flex:1">' + 'קטע ' + heb(Math.min(i + 1, 13)) + ': מ-' + tm(c[0]) + ' עד ' + tm(c[1]) + ' (' + durWords(c[1] - c[0]) + ')</span>';
    const jump = document.createElement('button'); jump.type = 'button'; jump.textContent = 'לך לשם'; jump.onclick = () => P.seek(Math.max(0, c[0] - 2));
    const back = document.createElement('button'); back.type = 'button'; back.textContent = 'החזר את הקטע'; back.onclick = () => { A.edit.cuts.splice(i, 1); afterEdit(); };
    row.append(jump, back); host.appendChild(row);
  });
  $('cutSel').innerHTML = cutSel.a === null ? (A.edit.cuts.length ? 'סך הכל הוסרו ' + durWords(total) + '.' : 'עוד לא סומן קטע.')
    : 'סומנה התחלה ב-' + tm(cutSel.a) + (cutSel.b !== null ? ' וסוף ב-' + tm(cutSel.b) + '. לחץ "הסר את הקטע המסומן".' : '. עכשיו סמן סוף.');
}
$('cutA').onclick = () => { cutSel.a = P.getPos(); if (cutSel.b !== null && cutSel.b <= cutSel.a) cutSel.b = null; renderCuts(); drawOverlays(); };
$('cutB').onclick = async () => {
  const p = P.getPos();
  if (cutSel.a === null) { await tell('קודם סמן התחלת קטע.'); return; }
  if (p <= cutSel.a) { await tell('סוף הקטע צריך להיות אחרי ההתחלה.'); return; }
  cutSel.b = p; renderCuts(); drawOverlays();
};
$('cutDo').onclick = async () => {
  if (cutSel.a === null || cutSel.b === null) { await tell('קודם סמן התחלה וסוף של קטע.'); return; }
  A.edit.cuts = mergeCuts(A.edit.cuts.concat([[cutSel.a, cutSel.b]])); afterEdit();
};
$('cutHead').onclick = () => { const p = P.getPos(); if (p < 0.5) return; A.edit.cuts = mergeCuts(A.edit.cuts.concat([[0, p]])); afterEdit(); };
$('cutTail').onclick = () => { const p = P.getPos(), d = A.orig.durationSec; if (d - p < 0.5) return; A.edit.cuts = mergeCuts(A.edit.cuts.concat([[p, d]])); afterEdit(); };

/* ----- פרקים ----- */
function renderChapters() {
  const host = $('chList'); host.innerHTML = '';
  A.edit.chapters.sort((a, b) => a.t - b.t);
  A.edit.chapters.forEach((ch, i) => {
    const row = document.createElement('div'); row.className = 'row'; row.style.margin = '6px 0';
    const go = document.createElement('button'); go.type = 'button'; go.innerHTML = tm(ch.t); go.onclick = () => P.seek(ch.t);
    const nm = document.createElement('span'); nm.style.flex = '1'; nm.textContent = ch.n;
    const ren = document.createElement('button'); ren.type = 'button'; ren.textContent = 'שנה שם';
    ren.onclick = async () => { const v = await askText('שם הפרק'); if (v && v.trim()) { ch.n = v.trim().slice(0, 80); renderChapters(); drawOverlays(); } };
    const del = document.createElement('button'); del.type = 'button'; del.className = 'warn'; del.textContent = 'מחק';
    del.onclick = () => { A.edit.chapters.splice(i, 1); renderChapters(); drawOverlays(); };
    row.append(go, nm, ren, del); host.appendChild(row);
  });
  if (!A.edit.chapters.length) host.innerHTML = '<div class="small">עוד אין פרקים.</div>';
}
$('chAdd').onclick = async () => {
  const t = Math.round(P.getPos() * 10) / 10;
  const v = await askText('שם הפרק (נקודה ' + fmtTime(t) + ')');
  if (!v || !v.trim()) return;
  A.edit.chapters.push({ t, n: v.trim().slice(0, 80) });
  renderChapters(); drawOverlays();
};

/* ----- פתיח וסיום קבועים ----- */
const ASSET_KINDS = [['intro', 'פתיח (בתחילת כל שיעור)'], ['outro', 'סיום (בסוף כל שיעור)']];
async function renderAssets() {
  const host = $('assets'); host.innerHTML = '';
  const on = store.get('kh_assets_on', { intro: false, outro: false });
  for (const [kind, label] of ASSET_KINDS) {
    const rec = await idb.get(kind);
    const row = document.createElement('div'); row.className = 'sl';
    row.innerHTML = '<div class="head"><label>' + label + '</label></div>' +
      '<div class="small">' + (rec ? 'נשמר: ' + rec.name + ' (' + tm(rec.dur || 0) + ')' : 'עוד לא נבחר קובץ.') + '</div>';
    const r = document.createElement('div'); r.className = 'row'; r.style.marginTop = '6px';
    const lbl = document.createElement('label'); lbl.className = 'btn'; lbl.textContent = rec ? 'החלף קובץ' : 'בחר קובץ קול';
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'audio/*'; inp.className = 'hide';
    lbl.appendChild(inp);
    inp.onchange = async () => {
      const f = inp.files[0]; if (!f) return;
      try {
        const ctx = A.ctx || ensureCtx(44100);
        const buf = await f.arrayBuffer();
        const dec = await ctx.decodeAudioData(buf.slice(0));
        if (dec.duration > 60) { await tell('הקובץ ארוך מדי לפתיח או לסיום. בחר קובץ של עד דקה.'); return; }
        await idb.set(kind, { name: f.name, buf, dur: dec.duration });
        on[kind] = true; store.set('kh_assets_on', on); A.edit[kind] = true; A.assetVer++;
        await renderAssets(); if (A.orig) schedulePre();
      } catch (e) { await tell('לא הצלחתי לקרוא את הקובץ. נסה קובץ אם-פי-3 או וייב.'); }
    };
    r.appendChild(lbl);
    if (rec) {
      const tg = document.createElement('div'); tg.className = 'tg';
      const cb = document.createElement('input'); cb.type = 'checkbox'; cb.id = 'as_' + kind; cb.checked = !!on[kind];
      const cl = document.createElement('label'); cl.htmlFor = cb.id; cl.textContent = 'הוסף בכל הפקה';
      cb.onchange = () => { on[kind] = cb.checked; store.set('kh_assets_on', on); A.edit[kind] = cb.checked; A.assetVer++; if (A.orig) schedulePre(); };
      tg.append(cb, cl); r.appendChild(tg);
      const rm = document.createElement('button'); rm.type = 'button'; rm.className = 'warn'; rm.textContent = 'הסר';
      rm.onclick = async () => { await idb.del(kind); on[kind] = false; store.set('kh_assets_on', on); A.edit[kind] = false; A.assetVer++; await renderAssets(); if (A.orig) schedulePre(); };
      r.appendChild(rm);
    }
    row.appendChild(r); host.appendChild(row);
    A.edit[kind] = !!(rec && on[kind]);
  }
}

/* ----- ברירת מחדל לשיעורים חדשים ----- */
function showDefaultNote() {
  const d = store.get('kh_default', null);
  $('defaultNote').textContent = d ? 'כל שיעור חדש ייפתח עם הערכה "' + d.name + '".' : '';
  $('bClearDefault').classList.toggle('hide', !d);
}
$('bSetDefault').onclick = () => {
  const v = {}; Object.keys(DEFAULTS).forEach((k) => { v[k] = A.S[k]; });
  store.set('kh_default', { name: A.presetName, v }); showDefaultNote();
};
$('bClearDefault').onclick = () => { store.set('kh_default', null); showDefaultNote(); };
function applyDefaultIfAny() {
  const d = store.get('kh_default', null);
  if (!d) return;
  A.S = Object.assign({}, DEFAULTS, d.v, { _normDb: 0 }); A.presetName = d.name;
  $('presetNow').textContent = 'נטענה ברירת המחדל: ' + d.name + '.';
}

/* חיבור לטעינת קובץ חדש */
const _onLoaded = onLoaded;
onLoaded = function (o, file) {
  A.edit.cuts = []; A.edit.chapters = []; cutSel.a = cutSel.b = null;
  applyDefaultIfAny();
  _onLoaded(o, file);
  $('editCard').classList.remove('hide');
  if (SITE_MODE) $('pubCard').classList.remove('hide');
  renderCuts(); renderChapters(); renumber(); showDefaultNote();
};
renderAssets(); showDefaultNote();
if (SITE_MODE) $('siteHome').classList.remove('hide');
