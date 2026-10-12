/* מנוע: טעינת הקלטה, הכנה מראש, נגן, והפקה לקובץ */

const A = {
  ctx: null, ctxSr: 0, workletReady: false, workletFailed: false,
  orig: null,         /* { buf, chs, sr, len, nch, name, size, durationSec } */
  pre: null,          /* { buf, chs, sr, len, nch, map, key } */
  S: Object.assign({}, DEFAULTS, { _normDb: 0 }),
  presetName: 'מותאם אישית',
  /* עריכה: חיתוכים (בשניות של המקור), פרקים, פתיח וסיום */
  edit: { cuts: [], chapters: [], intro: false, outro: false },
  assetVer: 0,
};

/* ===== אחסון קבצים קבועים בדפדפן: פתיח וסיום (IndexedDB) ===== */
const idb = {
  _db: null,
  open() {
    if (this._db) return this._db;
    this._db = new Promise((res, rej) => {
      try {
        const rq = indexedDB.open('kol-hashiur', 1);
        rq.onupgradeneeded = () => rq.result.createObjectStore('kv');
        rq.onsuccess = () => res(rq.result);
        rq.onerror = () => rej(rq.error);
      } catch (e) { rej(e); }
    });
    return this._db;
  },
  async get(k) { try { const db = await this.open(); return await new Promise((res) => { const r = db.transaction('kv').objectStore('kv').get(k); r.onsuccess = () => res(r.result || null); r.onerror = () => res(null); }); } catch (e) { return null; } },
  async set(k, v) { try { const db = await this.open(); return await new Promise((res) => { const t = db.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k); t.oncomplete = () => res(true); t.onerror = () => res(false); }); } catch (e) { return false; } },
  async del(k) { try { const db = await this.open(); return await new Promise((res) => { const t = db.transaction('kv', 'readwrite'); t.objectStore('kv').delete(k); t.oncomplete = () => res(true); t.onerror = () => res(false); }); } catch (e) { return false; } },
};
async function decodeAsset(kind) {
  const rec = await idb.get(kind);
  if (!rec || !rec.buf) return null;
  try {
    const buf = await A.ctx.decodeAudioData(rec.buf.slice(0));
    const chs = []; for (let c = 0; c < Math.min(2, buf.numberOfChannels); c++) chs.push(buf.getChannelData(c));
    return chs;
  } catch (e) { return null; }
}

const fmtTime = (s) => {
  s = Math.max(0, s);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = Math.floor(s % 60);
  return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0');
};
const heb = (n) => {
  const L = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט', 'י'];
  return n <= 10 ? L[n - 1] : (n === 11 ? 'יא' : n === 12 ? 'יב' : 'יג');
};
function durWords(sec) {
  sec = Math.round(sec);
  const m = Math.floor(sec / 60), s = sec % 60;
  const parts = [];
  if (m) parts.push(m === 1 ? 'דקה אחת' : m + ' דקות');
  if (s || !m) parts.push(s === 1 ? 'שנייה אחת' : s + ' שניות');
  return parts.join(' ו');
}

/* קריאת אורך מראש כדי להחליט על איכות הפענוח */
function probeDuration(blob) {
  return new Promise((res) => {
    const a = document.createElement('audio');
    const url = URL.createObjectURL(blob);
    const done = (v) => { URL.revokeObjectURL(url); res(v); };
    a.preload = 'metadata';
    a.onloadedmetadata = () => done(isFinite(a.duration) ? a.duration : 0);
    a.onerror = () => done(0);
    setTimeout(() => done(0), 4000);
    a.src = url;
  });
}

function ensureCtx(sr) {
  if (A.ctx && A.ctxSr === sr && A.ctx.state !== 'closed') return A.ctx;
  if (A.ctx) { try { P.teardown(); A.ctx.close(); } catch (e) {} }
  const AC = window.AudioContext || window.webkitAudioContext;
  try { A.ctx = new AC({ sampleRate: sr }); } catch (e) { A.ctx = new AC(); }
  A.ctxSr = sr;
  A.workletReady = false;
  return A.ctx;
}

async function loadWorklet(ctx) {
  if (A.workletReady || A.workletFailed) return;
  const txt = document.getElementById('dsp-src').textContent + '\n' + document.getElementById('worklet-src').textContent;
  const attempts = [
    () => URL.createObjectURL(new Blob([txt], { type: 'text/javascript' })),
    () => 'data:text/javascript;base64,' + btoa(unescape(encodeURIComponent(txt))),
  ];
  for (const mk of attempts) {
    try { await ctx.audioWorklet.addModule(mk()); A.workletReady = true; return; } catch (e) { /* ננסה דרך אחרת */ }
  }
  A.workletFailed = true;
}

/* גיבוי כשאין עובד שמע (למשל בקובץ שנפתח ישירות מהמחשב): אותו עיבוד על התהליך הראשי */
function makeFallbackVoice(ctx, nch) {
  const node = ctx.createScriptProcessor(2048, nch, nch);
  const dsp = new VoiceDSP(ctx.sampleRate, nch, Math.round(ctx.sampleRate * 0.04));
  node.onaudioprocess = (e) => {
    const n = e.inputBuffer.length, ins = [], outs = [];
    for (let c = 0; c < nch; c++) { ins.push(e.inputBuffer.getChannelData(c)); outs.push(e.outputBuffer.getChannelData(c)); }
    dsp.processBlock(ins, outs, n);
  };
  node.port = { postMessage: (m) => { if (m.reset) dsp.reset(); if (m.params) dsp.setParams(m.params); } };
  return node;
}

async function loadAudio(blob, name, onStatus) {
  onStatus('בודק את הקובץ');
  const dur = await probeDuration(blob);
  const sr = dur > 1800 ? 32000 : 44100;
  const ctx = ensureCtx(sr);
  onStatus('קורא את הקובץ');
  const ab = await blob.arrayBuffer();
  onStatus('מפענח את הקול, זה יכול לקחת רגע');
  let buf;
  try {
    buf = await ctx.decodeAudioData(ab);
  } catch (e) {
    const err = new Error(blob.size < 1000 ? 'הקובץ ריק או קטן מדי.' : 'לא הצלחתי לקרוא את הקובץ. ייתכן שהוא פגום או בפורמט שהדפדפן הזה לא תומך בו. נסה קובץ אם-פי-שלוש או אם-פי-ארבע-אי.');
    err.hebrew = true; throw err;
  }
  const nch = Math.min(2, buf.numberOfChannels);
  const chs = [];
  for (let c = 0; c < nch; c++) chs.push(buf.getChannelData(c));
  A.orig = { buf, chs, sr: buf.sampleRate, len: buf.length, nch, name, size: blob.size, durationSec: buf.duration };
  A.pre = { buf, chs, sr: buf.sampleRate, len: buf.length, nch, map: identityMap(buf.length), key: 'identity' };
  return A.orig;
}

/* ===== הכנה מראש: זמזום, רעש, שתיקות, חד-ערוצי ===== */
function preKey(S) { return JSON.stringify([S.nr, S.hum, S.silOn, S.silMin, S.silKeep, S.mono, A.edit.cuts, A.edit.intro, A.edit.outro, A.assetVer]); }
function preNeeded(S) { return S.nr > 0 || S.hum || S.silOn || (S.mono && A.orig.nch > 1) || A.edit.cuts.length > 0 || A.edit.intro || A.edit.outro; }

async function computePre(S, token, progress) {
  const o = A.orig, ctx = A.ctx;
  const key = preKey(S);
  if (!preNeeded(S)) return { buf: o.buf, chs: o.chs, sr: o.sr, len: o.len, nch: o.nch, map: identityMap(o.len), key: 'identity', saved: 0, introLen: 0 };
  const pacer = new Pacer();
  const check = (f) => { if (token.cancel) throw new Error('cancel'); if (f !== undefined && progress) progress(f); };
  let chs;
  if (S.mono && o.nch > 1) {
    const m = new Float32Array(o.len), L = o.chs[0], R = o.chs[1];
    for (let i = 0; i < o.len; i++) m[i] = (L[i] + R[i]) * 0.5;
    chs = [m];
  } else chs = o.chs.map((x) => Float32Array.from(x));
  await pacer.tick(check);
  if (S.hum) { progress && progress(0.05); await removeHum(chs, o.sr, pacer, check); }
  if (S.nr > 0) { await denoise(chs, o.sr, S.nr, pacer, (f) => check(f === undefined ? undefined : 0.1 + f * 0.8)); }
  progress && progress(0.92);
  await pacer.tick(check);
  let removals = A.edit.cuts.map((c) => [Math.round(c[0] * o.sr), Math.round(c[1] * o.sr)]);
  if (S.silOn) removals = removals.concat(silenceRemovals(chs, o.sr, S.silMin, S.silKeep));
  let intro = A.edit.intro ? await decodeAsset('intro') : null;
  let outro = A.edit.outro ? await decodeAsset('outro') : null;
  const fit = (x) => (x && chs.length === 1 && x.length === 2 ? [x[0].map((v, i) => (v + x[1][i]) * 0.5)] : x);
  intro = fit(intro); outro = fit(outro);
  const r = buildKept(chs, o.sr, removals, intro, outro);
  chs = r.chs;
  const saved = (o.len - (chs[0].length - r.introLen - r.outroLen)) / o.sr;
  const buf = ctx.createBuffer(chs.length, chs[0].length, o.sr);
  for (let c = 0; c < chs.length; c++) buf.getChannelData(c).set(chs[c]);
  const real = []; for (let c = 0; c < chs.length; c++) real.push(buf.getChannelData(c));
  return { buf, chs: real, sr: o.sr, len: chs[0].length, nch: chs.length, map: { segs: r.segs, origLen: r.origLen }, key, saved, introLen: r.introLen };
}

/* זמן בהקלטה המעובדת הסופית (אחרי חיתוכים, שתיקות, פתיח ומהירות) לפי זמן במקור */
function finalTimeOf(pre, tempo, tOrig) {
  return mapOrigToPre(pre.map, Math.round(tOrig * A.orig.sr)) / pre.sr / tempo;
}
/* מפת שתיקות להקלטה הסופית: מערך שטוח [התחלה, סוף, ...] בשניות */
function silenceMapFinal(pre, tempo) {
  const out = [];
  for (const [a, b] of detectSilence(pre.chs, pre.sr, 0.6)) {
    out.push(Math.round(a / pre.sr / tempo * 10) / 10, Math.round(b / pre.sr / tempo * 10) / 10);
  }
  return out;
}

/* ===== נגן בזמן אמת ===== */
const P = {
  ctx: null, voice: null, native: null, procGain: null, origGain: null, graphNch: 0,
  src: null, mode: 'proc', playing: false,
  basePre: 0, baseCtx: 0, rate: 1, posO: 0,
  loop: { on: false, a: 0, b: 0, count: 0 },
  onEnded: null,
  teardown() {
    try { this.src && this.src.stop(); } catch (e) {}
    this.src = null; this.playing = false; this.voice = null; this.native = null; this.graphNch = 0;
  },
  async ensureGraph() {
    const ctx = A.ctx, nch = A.pre.nch;
    if (this.ctx !== ctx) { this.teardown(); this.ctx = ctx; }
    await loadWorklet(ctx);
    if (this.graphNch === nch && this.voice !== null) return;
    if (this.voice) { try { this.voice.disconnect(); } catch (e) {} }
    if (this.procGain) { try { this.procGain.disconnect(); } catch (e) {} }
    if (this.origGain) { try { this.origGain.disconnect(); } catch (e) {} }
    this.procGain = ctx.createGain(); this.origGain = ctx.createGain();
    this.procGain.connect(ctx.destination); this.origGain.connect(ctx.destination);
    this.input = ctx.createGain();
    const E = derive(A.S);
    this.native = buildNative(ctx, this.input, E, true);
    this.native.output.connect(this.procGain);
    if (A.workletReady) {
      this.voice = new AudioWorkletNode(ctx, 'voice', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [nch], channelCount: nch, channelCountMode: 'explicit', processorOptions: { nch } });
      this.voice.connect(this.input);
    } else {
      this.voice = makeFallbackVoice(ctx, nch);
      this.voice.connect(this.input);
    }
    this.graphNch = nch;
    this.applyParams();
  },
  applyParams() {
    const E = derive(A.S);
    if (this.native) this.native.update(E);
    if (this.voice && this.voice.port) this.voice.port.postMessage({ params: voiceParams(E) });
    if (this.src && this.mode === 'proc') {
      const t = A.workletReady ? E.tempo : E.tempo;
      this.rebase();
      this.src.playbackRate.setValueAtTime(t, this.ctx.currentTime);
      this.rate = t;
    }
  },
  rebase() {
    const now = this.ctx.currentTime;
    this.basePre = this.rawPre();
    this.baseCtx = now;
  },
  rawPre() {
    return this.basePre + (this.ctx.currentTime - this.baseCtx) * this.rate;
  },
  preSec(posO) { return mapOrigToPre(A.pre.map, Math.round(posO * A.orig.sr)) / A.pre.sr; },
  origSecFromPre(ps) { return mapPreToOrig(A.pre.map, Math.round(ps * A.pre.sr)) / A.orig.sr; },
  duration() { return A.orig ? A.orig.durationSec : 0; },
  getPos() {
    if (!this.playing) return this.posO;
    const raw = this.rawPre();
    if (this.mode === 'orig') {
      if (this.loop.on && this.loop.b > this.loop.a) {
        const ls = this.loop.a, len = this.loop.b - this.loop.a;
        if (raw >= this.loop.b) { this.loop.count = Math.max(this.loop.count, Math.floor((raw - ls) / len)); return ls + ((raw - ls) % len); }
      }
      return Math.min(raw, this.duration());
    }
    if (this.loop.on && this.loop.b > this.loop.a) {
      const ls = this.preSec(this.loop.a), le = this.preSec(this.loop.b), len = le - ls;
      if (len > 0 && raw >= le) { this.loop.count = Math.max(this.loop.count, Math.floor((raw - ls) / len)); return this.origSecFromPre(ls + ((raw - ls) % len)); }
    }
    return Math.min(this.origSecFromPre(raw), this.duration());
  },
  stopSource(fade) {
    const s = this.src; this.src = null;
    if (!s) return;
    s.onended = null;
    try { s.stop(this.ctx.currentTime + (fade || 0)); } catch (e) {}
  },
  async startAt(posO, mode) {
    await this.ensureGraph();
    const ctx = this.ctx;
    if (ctx.state !== 'running') await ctx.resume();
    mode = mode || this.mode;
    const old = this.src; this.src = null;
    if (old) { old.onended = null; try { old.stop(ctx.currentTime + 0.03); } catch (e) {} }
    const s = ctx.createBufferSource();
    const E = derive(A.S);
    let offset;
    if (mode === 'orig') {
      s.buffer = A.orig.buf; s.playbackRate.value = 1; this.rate = 1;
      s.connect(this.origGain);
      offset = posO;
    } else {
      s.buffer = A.pre.buf; s.playbackRate.value = E.tempo; this.rate = E.tempo;
      s.connect(this.voice);
      offset = this.preSec(posO);
      if (this.voice.port) this.voice.port.postMessage({ reset: true, params: voiceParams(E) });
    }
    if (this.loop.on && this.loop.b > this.loop.a) {
      s.loop = true;
      if (mode === 'orig') { s.loopStart = this.loop.a; s.loopEnd = this.loop.b; }
      else { s.loopStart = this.preSec(this.loop.a); s.loopEnd = this.preSec(this.loop.b); }
    }
    const t = ctx.currentTime;
    this.procGain.gain.cancelScheduledValues(t); this.origGain.gain.cancelScheduledValues(t);
    this.procGain.gain.setTargetAtTime(mode === 'proc' ? 1 : 0, t, 0.01);
    this.origGain.gain.setTargetAtTime(mode === 'orig' ? 1 : 0, t, 0.01);
    s.onended = () => { if (this.src === s) { this.playing = false; this.src = null; this.posO = this.duration(); this.onEnded && this.onEnded(); } };
    s.start(0, Math.max(0, offset));
    this.src = s; this.mode = mode; this.playing = true;
    this.basePre = offset; this.baseCtx = ctx.currentTime;
  },
  async play(from) {
    if (!A.orig) return;
    let pos = from === undefined ? this.posO : from;
    if (pos >= this.duration() - 0.05) pos = 0;
    this.posO = pos;
    await this.startAt(pos);
  },
  pause() {
    if (!this.playing) return;
    this.posO = this.getPos();
    this.playing = false;
    this.stopSource(0.02);
  },
  async toggle() { if (this.playing) this.pause(); else await this.play(); },
  async seek(posO) {
    posO = Math.min(Math.max(0, posO), this.duration());
    this.posO = posO;
    if (this.playing) await this.startAt(posO);
  },
  async skip(d) { await this.seek(this.getPos() + d); },
  async setMode(m) {
    if (m === this.mode) return;
    const pos = this.getPos();
    this.posO = pos;
    if (this.playing) await this.startAt(pos, m); else this.mode = m;
  },
  async setLoop(on, a, b) {
    this.loop.on = on; this.loop.a = a; this.loop.b = b; this.loop.count = 0;
    if (this.playing) { const p = this.getPos(); this.posO = p; await this.startAt(p); }
  },
  /* החלפת הקלטת ההכנה (אחרי שהחישוב הסתיים) */
  async swapPre(newPre) {
    const wasPlaying = this.playing, pos = this.getPos();
    if (wasPlaying) { this.playing = false; this.stopSource(0.02); }
    A.pre = newPre;
    this.posO = pos;
    if (this.graphNch !== newPre.nch) { this.graphNch = -1; this.voice = null; }
    if (wasPlaying) await this.startAt(pos);
  },
};

/* ===== הפקה לקובץ ===== */
function hermite(b, pos, len) {
  const i0 = Math.floor(pos), t = pos - i0;
  const g = (i) => (i < 0 ? b[0] : i >= len ? 0 : b[i]);
  const y0 = g(i0 - 1), y1 = g(i0), y2 = g(i0 + 1), y3 = g(i0 + 2);
  const c1 = 0.5 * (y2 - y0), c2 = y0 - 2.5 * y1 + 2 * y2 - 0.5 * y3, c3 = 0.5 * (y3 - y0) + 1.5 * (y1 - y2);
  return ((c3 * t + c2) * t + c1) * t + y1;
}

class VoiceStageStream {
  constructor(pre, E, startOut) {
    this.pre = pre; this.t = E.tempo; this.nch = pre.nch; this.sr = pre.sr;
    this.dsp = new VoiceDSP(pre.sr, pre.nch, 0);
    this.dsp.setParams(voiceParams(E));
    this.inIdx = startOut || 0;       /* מונה הדגימות שהוזנו, בתחום הפלט */
    this.emittedFrom = startOut || 0; /* כמה כבר יצא */
    this.total = Math.floor(pre.len / this.t);
    this.queue = []; this.qLen = 0; this.B = 4096;
  }
  _feed() {
    const B = this.B, n = this.nch;
    const chs = [];
    for (let c = 0; c < n; c++) {
      const out = new Float32Array(B), src = this.pre.chs[c];
      for (let j = 0; j < B; j++) {
        const sp = (this.inIdx + j) * this.t;
        out[j] = sp >= this.pre.len ? 0 : hermite(src, sp, this.pre.len);
      }
      chs.push(out);
    }
    this.inIdx += B;
    if (!this.dsp.active) { this.dsp.dyn.process(chs, B); this.queue.push(chs); this.qLen += B; return; }
    this.dsp.ps.push(chs, B);
    while (this.dsp.ps.available() > 0) {
      const k = Math.min(this.dsp.ps.available(), 8192);
      const tmp = []; for (let c = 0; c < n; c++) tmp.push(new Float32Array(k));
      this.dsp.ps.pull(tmp, k);
      this.dsp.dyn.process(tmp, k);
      this.queue.push(tmp); this.qLen += k;
    }
  }
  /* מחזיר עד n דגימות (פחות רק בסוף) */
  async take(n, pacer, cb) {
    const out = []; for (let c = 0; c < this.nch; c++) out.push(new Float32Array(n));
    let got = 0;
    while (got < n && this.emittedFrom + got < this.total) {
      while (this.qLen === 0) { this._feed(); if (pacer) await pacer.tick(cb); }
      const q = this.queue[0], qn = q[0].length;
      const k = Math.min(qn, n - got, this.total - this.emittedFrom - got);
      for (let c = 0; c < this.nch; c++) out[c].set(q[c].subarray(0, k), got);
      got += k;
      if (k === qn) this.queue.shift(); else this.queue[0] = q.map((x) => x.subarray(k));
      this.qLen -= k;
    }
    this.emittedFrom += got;
    return got === n ? out : out.map((x) => x.subarray(0, got));
  }
}

async function renderChain(chs, sr, E, outSR) {
  const nch = chs.length, len = chs[0].length;
  const frames = Math.max(1, Math.round(len * outSR / sr));
  const oc = new OfflineAudioContext(nch, frames, outSR);
  const ab = oc.createBuffer(nch, len, sr);
  for (let c = 0; c < nch; c++) ab.getChannelData(c).set(chs[c]);
  const src = oc.createBufferSource(); src.buffer = ab;
  const chain = buildNative(oc, src, E, false);
  chain.output.connect(oc.destination);
  src.start();
  const r = await oc.startRendering();
  const out = []; for (let c = 0; c < nch; c++) out.push(r.getChannelData(c));
  return out;
}

async function measureLoudness(pre, E, token) {
  const sr = pre.sr, total = Math.floor(pre.len / E.tempo);
  const winLen = Math.round(25 * sr), warm = Math.round(4 * sr);
  const nw = total < 4 * 60 * sr ? 1 : 8;
  const meter = new LoudnessMeter();
  const pacer = new Pacer();
  for (let w = 0; w < nw; w++) {
    if (token && token.cancel) throw new Error('cancel');
    const start = nw === 1 ? 0 : Math.floor((total - winLen) * (w + 0.5) / nw);
    const len = nw === 1 ? total : winLen;
    const wStart = Math.max(0, start - warm);
    const st = new VoiceStageStream(pre, E, wStart);
    const vo = await st.take((start - wStart) + len, pacer);
    const chs = await renderChain(vo, sr, E, sr);
    const skip = start - wStart;
    meter.add(chs.map((x) => x.subarray(skip)), sr);
  }
  return meter.integrated();
}

/* מחשב בכמה דציבלים להגביר או להנמיך כדי להגיע לעוצמה תקנית. שני מעברים: בלי מגביל, ואז עם מגביל לתיקון */
async function measureNormDb(pre, S, token) {
  const E1 = derive(Object.assign({}, S, { normalize: false }));
  E1.noLimiter = true;
  const L1 = await measureLoudness(pre, E1, token);
  if (L1 === null) return 0;
  let db = Math.max(-12, Math.min(18, -16 - L1));
  const E2 = derive(Object.assign({}, S, { normalize: true, _normDb: db }));
  const L2 = await measureLoudness(pre, E2, token);
  if (L2 !== null) db = Math.max(-12, Math.min(18, db + (-16 - L2)));
  return db;
}

/* ===== מקודדים ===== */
function toInt16(x, from, n) {
  const o = new Int16Array(n);
  for (let i = 0; i < n; i++) { let v = x[from + i]; v = v > 1 ? 1 : v < -1 ? -1 : v; o[i] = v < 0 ? v * 32768 : v * 32767; }
  return o;
}
class Mp3Enc {
  constructor(sr, nch, kbps) { this.nch = nch; this.e = new lamejs.Mp3Encoder(nch, sr, kbps); this.parts = []; }
  async write(chs, n, pacer) {
    /* בלוקים של 1152 בדיוק: בלוקים גדולים גורמים לקול שקט מדי בספרייה */
    const B = 1152;
    for (let o = 0; o < n; o += B) {
      const k = Math.min(B, n - o);
      const l = toInt16(chs[0], o, k);
      const d = this.nch === 2 ? this.e.encodeBuffer(l, toInt16(chs[1], o, k)) : this.e.encodeBuffer(l);
      if (d.length) this.parts.push(new Uint8Array(d));
      if ((o / B) % 64 === 0) await pacer.tick();
    }
  }
  async finish() { const f = this.e.flush(); if (f.length) this.parts.push(new Uint8Array(f)); return new Blob(this.parts, { type: 'audio/mpeg' }); }
}
class WavEnc {
  constructor(sr, nch) { this.sr = sr; this.nch = nch; this.parts = []; this.bytes = 0; }
  async write(chs, n, pacer) {
    const B = 65536;
    for (let o = 0; o < n; o += B) {
      const k = Math.min(B, n - o);
      const buf = new Int16Array(k * this.nch);
      for (let c = 0; c < this.nch; c++) { const a = toInt16(chs[c], o, k); for (let i = 0; i < k; i++) buf[i * this.nch + c] = a[i]; }
      this.parts.push(buf); this.bytes += buf.byteLength;
      await pacer.tick();
    }
  }
  async finish() {
    const h = new DataView(new ArrayBuffer(44)), s = (o, t) => { for (let i = 0; i < t.length; i++) h.setUint8(o + i, t.charCodeAt(i)); };
    s(0, 'RIFF'); h.setUint32(4, 36 + this.bytes, true); s(8, 'WAVE'); s(12, 'fmt '); h.setUint32(16, 16, true);
    h.setUint16(20, 1, true); h.setUint16(22, this.nch, true); h.setUint32(24, this.sr, true);
    h.setUint32(28, this.sr * this.nch * 2, true); h.setUint16(32, this.nch * 2, true); h.setUint16(34, 16, true);
    s(36, 'data'); h.setUint32(40, this.bytes, true);
    return new Blob([h.buffer].concat(this.parts), { type: 'audio/wav' });
  }
}
const OGG_CRC = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) { let r = i << 24; for (let j = 0; j < 8; j++) r = (r & 0x80000000) ? ((r << 1) ^ 0x04C11DB7) : (r << 1); t[i] = r >>> 0; }
  return t;
})();
class OpusEnc {
  constructor(nch, kbps) { this.nch = nch; this.kbps = kbps; this.pages = []; this.pk = []; this.seq = 0; this.gran = 312; this.frames = 0; this.err = null; this.serial = 0x4b4f4c31; }
  static async supported() {
    try { if (typeof AudioEncoder === 'undefined') return false; const r = await AudioEncoder.isConfigSupported({ codec: 'opus', sampleRate: 48000, numberOfChannels: 1, bitrate: 32000 }); return !!r.supported; } catch (e) { return false; }
  }
  _page(packets, type, granule) {
    const segs = [];
    for (const p of packets) { let l = p.length; while (l >= 255) { segs.push(255); l -= 255; } segs.push(l); }
    let size = 27 + segs.length; for (const p of packets) size += p.length;
    const u = new Uint8Array(size), v = new DataView(u.buffer);
    u.set([79, 103, 103, 83, 0, type]);
    v.setUint32(6, granule >>> 0, true); v.setUint32(10, Math.floor(granule / 4294967296), true);
    v.setUint32(14, this.serial, true); v.setUint32(18, this.seq++, true); v.setUint32(22, 0, true);
    u[26] = segs.length; u.set(segs, 27);
    let o = 27 + segs.length; for (const p of packets) { u.set(p, o); o += p.length; }
    let crc = 0;
    for (let i = 0; i < u.length; i++) crc = ((crc << 8) ^ OGG_CRC[((crc >>> 24) ^ u[i]) & 255]) >>> 0;
    v.setUint32(22, crc, true);
    this.pages.push(u);
  }
  async init() {
    const head = new Uint8Array(19), hv = new DataView(head.buffer);
    head.set([79, 112, 117, 115, 72, 101, 97, 100, 1, this.nch]); hv.setUint16(10, 312, true); hv.setUint32(12, 48000, true); hv.setUint16(16, 0, true); head[18] = 0;
    const tagTxt = new TextEncoder().encode('Kol Hashiur');
    const tags = new Uint8Array(8 + 4 + tagTxt.length + 4), tv = new DataView(tags.buffer);
    tags.set([79, 112, 117, 115, 84, 97, 103, 115]); tv.setUint32(8, tagTxt.length, true); tags.set(tagTxt, 12); tv.setUint32(12 + tagTxt.length, 0, true);
    this._page([head], 2, 0); this._page([tags], 0, 0);
    this.enc = new AudioEncoder({
      output: (chunk) => {
        const b = new Uint8Array(chunk.byteLength); chunk.copyTo(b);
        this.pk.push(b); this.gran += Math.round((chunk.duration || 20000) * 48 / 1000);
        if (this.pk.length >= 40) { this._page(this.pk, 0, this.gran); this.pk = []; }
      },
      error: (e) => { this.err = e; },
    });
    this.enc.configure({ codec: 'opus', sampleRate: 48000, numberOfChannels: this.nch, bitrate: this.kbps * 1000 });
  }
  async write(chs, n, pacer) {
    const B = 48000 * 5;
    for (let o = 0; o < n; o += B) {
      const k = Math.min(B, n - o);
      const data = new Float32Array(k * this.nch);
      for (let c = 0; c < this.nch; c++) data.set(chs[c].subarray(o, o + k), c * k);
      const ad = new AudioData({ format: 'f32-planar', sampleRate: 48000, numberOfFrames: k, numberOfChannels: this.nch, timestamp: Math.round(this.frames / 48 * 1000), data });
      this.enc.encode(ad); ad.close(); this.frames += k;
      while (this.enc.encodeQueueSize > 6) await new Promise((r) => setTimeout(r, 10));
      if (this.err) throw this.err;
      await pacer.tick();
    }
  }
  async finish() {
    await this.enc.flush();
    if (this.err) throw this.err;
    this._page(this.pk, 4, 312 + this.frames);
    return new Blob(this.pages, { type: 'audio/ogg' });
  }
}

const FORMATS = {
  mp3: { name: 'אם-פי-3 (מומלץ, מתאים לדיבור)', ext: 'mp3', kbps: (nch) => (nch === 1 ? 64 : 128) },
  opus: { name: 'אופוס (הקטן ביותר)', ext: 'opus', kbps: (nch) => (nch === 1 ? 32 : 48) },
  wav: { name: 'וייב (איכות מלאה לארכיון)', ext: 'wav' },
};
function estimateBytes(fmt, nch, durSec, sr) {
  if (fmt === 'wav') return durSec * sr * nch * 2;
  return durSec * FORMATS[fmt].kbps(nch) * 1000 / 8;
}

/* מפיק גרסה אחת. מחזיר Blob */
async function produce(S, fmt, token, onProg, pre) {
  pre = pre || A.pre;
  const E0 = derive(Object.assign({}, S, { normalize: false }));
  let normDb = 0;
  if (S.normalize) {
    onProg({ stage: 'מודד עוצמה', frac: 0 });
    normDb = await measureNormDb(pre, S, token, null);
  }
  const E = derive(Object.assign({}, S, { _normDb: normDb }));
  const sr = pre.sr, nch = pre.nch;
  const outSR = fmt === 'opus' ? 48000 : (fmt === 'mp3' && ![32000, 44100, 48000].includes(sr) ? 44100 : sr);
  let enc;
  if (fmt === 'mp3') enc = new Mp3Enc(outSR, nch, FORMATS.mp3.kbps(nch));
  else if (fmt === 'wav') enc = new WavEnc(outSR, nch);
  else { enc = new OpusEnc(nch, FORMATS.opus.kbps(nch)); await enc.init(); }
  const stream = new VoiceStageStream(pre, E, 0);
  const total = stream.total, seg = Math.round(300 * sr), warm = Math.round(4 * sr), X = Math.round(0.01 * sr);
  const tailFrames = E.wet > 0 ? Math.round(3 * sr) : 0;
  const pacer = new Pacer();
  const t0 = performance.now();
  let hist = null, carry = null;
  const ratio = outSR / sr;
  for (let a = 0; a < total; a += seg) {
    if (token.cancel) throw new Error('cancel');
    const b = Math.min(total, a + seg), last = b >= total;
    let vo = await stream.take(b - a, pacer);
    if (last && tailFrames) vo = vo.map((x) => { const y = new Float32Array(x.length + tailFrames); y.set(x); return y; });
    const histLen = hist ? hist[0].length : 0;
    const joined = vo.map((x, c) => { const y = new Float32Array(histLen + x.length); if (hist) y.set(hist[c]); y.set(x, histLen); return y; });
    hist = joined.map((x) => x.slice(Math.max(0, x.length - warm)));
    const rendered = await renderChain(joined, sr, E, outSR);
    const skip = Math.round(histLen * ratio), xo = Math.round(X * ratio);
    const endCore = last ? rendered[0].length : rendered[0].length - xo;
    let from = skip;
    const pieces = rendered.map((x) => x.subarray(from, endCore));
    if (carry) {
      /* מיזוג חלק של התפר בין המקטעים */
      const k = Math.min(carry[0].length, skip);
      for (let c = 0; c < nch; c++) {
        const mixed = new Float32Array(k);
        for (let i = 0; i < k; i++) { const w = (i + 1) / (k + 1); mixed[i] = carry[c][i] * (1 - w) + rendered[c][skip - k + i] * w; }
        const y = new Float32Array(k + pieces[c].length); y.set(mixed); y.set(pieces[c], k);
        pieces[c] = y;
      }
    }
    carry = last ? null : rendered.map((x) => x.slice(endCore, endCore + xo));
    const n = pieces[0].length;
    await enc.write(pieces, n, pacer);
    const frac = Math.min(1, b / total);
    const el = (performance.now() - t0) / 1000;
    onProg({ stage: 'מפיק', frac, eta: frac > 0.02 ? el / frac * (1 - frac) : null });
    await pacer.tick();
  }
  onProg({ stage: 'מסיים', frac: 1 });
  return enc.finish();
}
