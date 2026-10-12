/* ===== ממשק הפרסום (גרסת האתר בלבד) ===== */
if (SITE_MODE) {
  const PF = [
    ['title', 'כותרת השיעור', 'text', 'full'], ['series', 'סדרה', 'text'], ['seriesNo', 'מספר בסדרה', 'number'],
    ['pkey', 'פרשה או כתב (שיוך לדף הזוהר)', 'pkey'], ['daf', 'דף (וילנא)', 'text'], ['amud', 'עמוד', 'amud'],
    ['siman', 'סימן', 'text'], ['topic', 'נושא', 'text'], ['readType', 'סוג', 'sel', READ_TYPES], ['tradition', 'מסורת', 'sel', TRADS],
    ['reader', 'שם המוסר', 'text'], ['recDate', 'תאריך ההקלטה', 'text'], ['quality', 'איכות ההקלטה', 'sel', QUALITIES],
    ['lang', 'שפה', 'sel', LANGS], ['tags', 'תגיות (מופרדות בפסיק)', 'text', 'full'], ['desc', 'תיאור', 'area', 'full'],
  ];
  const KEEP = ['series', 'reader', 'tradition', 'quality', 'lang', 'readType'];
  const memo = store.get('kh_pub_memo', {});
  const form = $('pubForm'); form.innerHTML = '';
  PF.forEach(([id, label, kind, extra]) => {
    const d = document.createElement('div'); if (extra === 'full' || kind === 'area') d.className = 'full';
    const fid = 'p_' + id; let ctl;
    if (kind === 'pkey') {
      ctl = '<select id="' + fid + '"><option value="">ללא שיוך</option>' + Object.keys(BOOKS).map((b) => '<optgroup label="' + b + '">' + BOOKS[b].map((k) => '<option value="' + k + '">' + (PNAMES[k] || k) + '</option>').join('') + '</optgroup>').join('') + '</select>';
    } else if (kind === 'amud') ctl = '<select id="' + fid + '"><option value=""></option><option>א</option><option>ב</option></select>';
    else if (kind === 'sel') ctl = '<select id="' + fid + '"><option value=""></option>' + extra.map((x) => '<option>' + x + '</option>').join('') + '</select>';
    else if (kind === 'area') ctl = '<textarea id="' + fid + '" rows="3"></textarea>';
    else ctl = '<input id="' + fid + '" type="' + kind + '"' + (kind === 'number' ? ' min="0"' : '') + '>';
    d.innerHTML = '<label for="' + fid + '">' + label + '</label>' + ctl;
    form.appendChild(d);
    const el = d.querySelector('#' + fid); if (el && memo[id]) el.value = memo[id];
  });
  const val = (id) => { const e = $('p_' + id); return e ? e.value.trim() : ''; };

  function fillTitleGuess() { if (!val('title') && A.orig) $('p_title').value = A.orig.name.replace(/_/g, ' ').slice(0, 120); }
  const _ol = onLoaded; onLoaded = function (o, f) { _ol(o, f); fillTitleGuess(); renderPubVariants(); };

  function renderPubVariants() {
    const host = $('pubVariants'); host.innerHTML = '';
    allPresets().forEach((p, i) => {
      const w = document.createElement('label'); w.className = 'tg';
      const cb = document.createElement('input'); cb.type = 'checkbox'; cb.dataset.i = i;
      cb.onchange = () => { if (host.querySelectorAll('input:checked').length > 3) { cb.checked = false; tell('אפשר עד שלוש גרסאות נוספות.'); } };
      w.append(cb, document.createTextNode(' ' + p.name)); host.appendChild(w);
    });
  }

  let tok = null, st = null;
  const setP = (f, txt) => { $('pubProg').classList.remove('hide'); $('pubProg').firstElementChild.style.width = Math.round(f * 100) + '%'; $('pubTxt').textContent = txt; };

  async function ensureKey() {
    let k = adminKeyGet();
    if (k) return k;
    k = await askText('מפתח מנהל', 'password');
    if (!k || !k.trim()) return '';
    adminKeySet(k.trim()); return k.trim();
  }

  $('bPubCancel').onclick = () => { if (tok) { tok.cancel = true; if (tok.abort) tok.abort(); } };
  $('bPublish').onclick = async () => {
    if (!A.orig || tok) return;
    if (!val('title') && !val('pkey') && !val('topic')) { await tell('נא למלא כותרת לשיעור, או לפחות פרשה או נושא.'); return; }
    const key = await ensureKey(); if (!key) return;
    KEEP.forEach((k) => { memo[k] = val(k); }); store.set('kh_pub_memo', memo);
    tok = { cancel: false }; $('bPublish').disabled = true; $('bPubCancel').classList.remove('hide'); $('pubDone').innerHTML = '';
    try {
      /* ממתין לסיום ההכנה המקדימה */
      setP(0, 'ממתין לסיום ההכנה...');
      clearTimeout(preTimer); if (preTok === null && !preKeyMatches()) await runPre(); else await preRun;
      const fmt = $('fmt').value || 'mp3';
      const S0 = Object.assign({}, A.S), pre = A.pre;
      /* ההכנה: מתחילים מחדש רק אם לא קיים מצב שמור מניסיון קודם באותה הגדרה */
      const sig = JSON.stringify([S0, fmt, A.edit, $('pubVariants').innerHTML.length, pre.key]);
      if (!st || st.sig !== sig) {
        const id = newRecId(), ext = EXT_OF[fmt], extras = [...$('pubVariants').querySelectorAll('input:checked')].map((c) => allPresets()[parseInt(c.dataset.i, 10)]);
        const items = [{ label: 'main', S: S0, key: 'recordings/' + id + '.' + ext }];
        extras.forEach((p, i) => {
          const Sv = Object.assign({}, DEFAULTS, p.v, { _normDb: 0 });
          TIMELINE_KEYS.forEach((k) => { Sv[k] = S0[k]; });
          items.push({ label: p.name, S: Sv, key: 'recordings/' + id + '_v' + (i + 2) + '.' + ext });
        });
        st = { sig, id, items, fmt };
      }
      const nV = st.items.length, share = 1 / nV;
      for (let i = 0; i < nV; i++) {
        const it = st.items[i], tag = nV > 1 ? 'גרסה ' + heb(i + 1) + ': ' : '';
        if (!it.blob) {
          it.blob = await produce(it.S, fmt, tok, (p) => setP((i + p.frac * 0.5) * share, tag + 'מפיק את הקובץ: ' + Math.round(p.frac * 100) + ' אחוז' + (p.eta ? ', נותרו כ-' + durWords(p.eta) : '')), pre);
        }
        if (!it.uploaded) {
          await uploadAny(it, key, (f) => setP((i + 0.5 + f * 0.5) * share * 0.98, tag + 'מעלה לאתר: ' + Math.round(f * 100) + ' אחוז'), tok);
          it.uploaded = true;
        }
      }
      /* מפת שתיקות, פרקים וקטלוג */
      setP(0.985, 'שומר את פרטי השיעור...');
      const E0 = derive(S0), tempo = E0.tempo;
      const sil = silenceMapFinal(pre, tempo);
      let silf;
      if (sil.length >= 2) {
        silf = 'timings/' + st.id + '.sil.json';
        await uploadAny({ blob: new Blob([JSON.stringify({ v: 1, sil })], { type: 'application/json' }), key: silf }, key, () => {}, tok);
      }
      const chapters = A.edit.chapters.map((c) => ({ t: Math.round(finalTimeOf(pre, tempo, c.t) * 10) / 10, n: c.n }));
      const pk = val('pkey');
      const rec = {
        id: st.id, file: st.items[0].key, size: st.items[0].blob.size, dur: Math.round(pre.len / pre.sr / tempo),
        title: val('title'), series: val('series'), seriesNo: val('seriesNo') ? Number(val('seriesNo')) : undefined,
        pkey: pk, parsha: pk ? (PNAMES[pk] || pk) : '', book: pk ? bookOf(pk) : '', daf: val('daf'), amud: val('amud'), siman: val('siman'), topic: val('topic'),
        readType: val('readType'), tradition: val('tradition'), reader: val('reader'), recDate: val('recDate'), quality: val('quality'), lang: val('lang'),
        tags: val('tags').split(',').map((s) => s.trim()).filter(Boolean), desc: val('desc'),
        variants: st.items.slice(1).map((it) => ({ label: it.label, file: it.key, size: it.blob.size })),
        chapters, silf, hidden: $('pubDraft').checked ? true : undefined, pub: $('pubDate').value || undefined,
      };
      await catalogPost({ act: 'add', rec }, key);
      setP(1, 'הסתיים. השיעור נשמר בספרייה.');
      $('pubDone').innerHTML = '<a href="זוהר-אודיו?rec=' + encodeURIComponent(st.id) + '">פתח את השיעור בספריית השיעורים</a>';
      st = null;
    } catch (e) {
      if (e && e.status === 403) adminKeySet('');
      $('pubTxt').textContent = pubErrorText(e);
    } finally {
      tok = null; $('bPublish').disabled = false; $('bPubCancel').classList.add('hide');
    }
  };
}
