/* ליבת עיבוד הקול. הקובץ הזה רץ גם בתוך עובד השמע (תצוגה מקדימה בזמן אמת)
   וגם בדף הראשי (הפקה לקובץ), כך שהצליל זהה בשניהם. */

class Fifo {
  constructor(nch, cap) {
    this.nch = nch; this.cap = cap; this.len = 0; this.b = [];
    for (let c = 0; c < nch; c++) this.b.push(new Float32Array(cap));
  }
  ensure(extra) {
    if (this.len + extra <= this.cap) return;
    const ncap = Math.max(this.cap * 2, this.len + extra);
    for (let c = 0; c < this.nch; c++) {
      const nb = new Float32Array(ncap);
      nb.set(this.b[c].subarray(0, this.len));
      this.b[c] = nb;
    }
    this.cap = ncap;
  }
  drop(n) {
    if (n <= 0) return;
    if (n >= this.len) { this.len = 0; return; }
    for (let c = 0; c < this.nch; c++) this.b[c].copyWithin(0, n, this.len);
    this.len -= n;
  }
}

/* שינוי גובה קול בלי שינוי אורך: מתיחת זמן בשיטת חפיפה וחיבור (WSOLA) ואחריה דגימה מחדש */
class PitchShifter {
  constructor(sr, nch, cushion) {
    this.sr = sr; this.nch = nch;
    this.seqLen = Math.round(sr * 0.040);
    this.ovl = Math.round(sr * 0.008);
    this.seekLen = Math.round(sr * 0.015);
    this.cushion = cushion || 0;
    this.monoIdx = nch === 1 ? 0 : nch;
    this.ratio = 1;
    this.setRatio(1);
    this.reset();
  }
  setRatio(r) {
    this.ratio = r;
    this.tempo = 1 / r;
    this.nominalSkip = this.tempo * (this.seqLen - this.ovl);
  }
  reset() {
    this.inF = new Fifo(this.nch === 1 ? 1 : this.nch + 1, 16384);
    this.strF = new Fifo(this.nch, 16384);
    this.outF = new Fifo(this.nch, 16384);
    this.strF.len = 1;
    this.rpos = 1;
    this.mid = [];
    for (let c = 0; c < this.nch; c++) this.mid.push(new Float32Array(this.ovl));
    this.midMono = new Float32Array(this.ovl);
    this.midValid = false;
    this.skipFract = 0;
    this.started = this.cushion === 0;
  }
  push(chs, n) {
    const f = this.inF;
    f.ensure(n);
    for (let c = 0; c < this.nch; c++) f.b[c].set(chs[c].subarray(0, n), f.len);
    if (this.nch > 1) {
      const m = f.b[this.nch];
      for (let i = 0; i < n; i++) {
        let s = 0;
        for (let c = 0; c < this.nch; c++) s += chs[c][i];
        m[f.len + i] = s / this.nch;
      }
    }
    f.len += n;
    this._run();
  }
  _need() {
    const skip = Math.floor(this.nominalSkip + 1);
    return Math.max(skip + this.ovl, this.seqLen) + this.seekLen + 8;
  }
  _run() {
    const need = this._need();
    let guard = 0;
    while (this.inF.len >= need && guard++ < 64) this._iter();
    this._resample();
  }
  _corr(x, o, m, n, step) {
    let s = 0, e = 0;
    for (let i = 0; i < n; i += step) { const v = x[o + i]; s += v * m[i]; e += v * v; }
    return s / Math.sqrt(e + 1e-3);
  }
  _seek() {
    const x = this.inF.b[this.monoIdx], m = this.midMono, L = this.seekLen, ovl = this.ovl;
    let best = -1e30, bi = 0;
    for (let o = 0; o < L; o += 3) {
      const c = this._corr(x, o, m, ovl, 2);
      if (c > best) { best = c; bi = o; }
    }
    const lo = Math.max(0, bi - 3), hi = Math.min(L - 1, bi + 3);
    best = -1e30;
    for (let o = lo; o <= hi; o++) {
      const c = this._corr(x, o, m, ovl, 1);
      if (c > best) { best = c; bi = o; }
    }
    return bi;
  }
  _iter() {
    const inF = this.inF, ovl = this.ovl, seq = this.seqLen;
    const off = this.midValid ? this._seek() : 0;
    const outLen = seq - ovl;
    this.strF.ensure(outLen);
    const base = this.strF.len;
    for (let c = 0; c < this.nch; c++) {
      const x = inF.b[c], o = this.strF.b[c], m = this.mid[c];
      if (this.midValid) {
        for (let i = 0; i < ovl; i++) { const w = i / ovl; o[base + i] = m[i] * (1 - w) + x[off + i] * w; }
      } else {
        for (let i = 0; i < ovl; i++) o[base + i] = x[off + i];
      }
      o.set(x.subarray(off + ovl, off + seq - ovl), base + ovl);
      m.set(x.subarray(off + seq - ovl, off + seq));
    }
    this.midMono.set(inF.b[this.monoIdx].subarray(off + seq - ovl, off + seq));
    this.strF.len += outLen;
    this.midValid = true;
    this.skipFract += this.nominalSkip;
    const s = Math.floor(this.skipFract);
    this.skipFract -= s;
    inF.drop(s);
  }
  _resample() {
    const f = this.strF, r = this.ratio, o = this.outF;
    let pos = this.rpos;
    const est = Math.ceil((f.len - pos) / r) + 4;
    o.ensure(est);
    while (pos + 2 < f.len) {
      const i0 = Math.floor(pos), t = pos - i0;
      for (let c = 0; c < this.nch; c++) {
        const b = f.b[c];
        const y0 = b[i0 - 1], y1 = b[i0], y2 = b[i0 + 1], y3 = b[i0 + 2];
        const c1 = 0.5 * (y2 - y0), c2 = y0 - 2.5 * y1 + 2 * y2 - 0.5 * y3, c3 = 0.5 * (y3 - y0) + 1.5 * (y1 - y2);
        o.b[c][o.len] = ((c3 * t + c2) * t + c1) * t + y1;
      }
      o.len++;
      pos += r;
    }
    const keep = Math.max(0, Math.floor(pos) - 1);
    f.drop(keep);
    this.rpos = pos - keep;
  }
  available() { return this.outF.len; }
  /* מושך עד n דגימות. מחזיר כמה נמשכו. */
  pull(outs, n) {
    const o = this.outF;
    if (!this.started) {
      if (o.len >= this.cushion) this.started = true; else return 0;
    }
    const k = Math.min(n, o.len);
    for (let c = 0; c < this.nch; c++) outs[c].set(o.b[c].subarray(0, k), 0);
    o.drop(k);
    return k;
  }
}

/* שער רעש ומרחיב דינמיקה, בלי השהיה */
class Dyn {
  constructor(sr, nch) {
    this.sr = sr; this.nch = nch;
    this.gateTh = null; this.expRatio = 1; this.expTh = -34;
    this.relEnv = Math.exp(-1 / (0.05 * sr));
    this.atk = Math.exp(-1 / (0.003 * sr));
    this.rel = Math.exp(-1 / (0.12 * sr));
    this.holdMax = Math.round(0.10 * sr);
    this.floorGain = Math.pow(10, -40 / 20);
    this.reset();
  }
  reset() { this.env = 0; this.g = 1; this.hold = 0; }
  set(gateTh, expRatio, expTh) { this.gateTh = gateTh; this.expRatio = expRatio; this.expTh = expTh; }
  process(chs, n) {
    if (this.gateTh === null && this.expRatio <= 1.0001) return;
    const nch = this.nch;
    for (let i = 0; i < n; i++) {
      let p = 0;
      for (let c = 0; c < nch; c++) { const v = Math.abs(chs[c][i]); if (v > p) p = v; }
      this.env = p > this.env ? p : p + (this.env - p) * this.relEnv;
      const db = 20 * Math.log10(this.env + 1e-9);
      let target = 1;
      if (this.gateTh !== null) {
        if (db > this.gateTh) this.hold = this.holdMax; else if (this.hold > 0) this.hold--;
        if (this.hold === 0) target = this.floorGain;
      }
      if (this.expRatio > 1.0001 && db < this.expTh) {
        const gd = Math.max(-20, (db - this.expTh) * (this.expRatio - 1));
        target *= Math.pow(10, gd / 20);
      }
      const k = target > this.g ? this.atk : this.rel;
      this.g = target + (this.g - target) * k;
      for (let c = 0; c < nch; c++) chs[c][i] *= this.g;
    }
  }
}

class VoiceDSP {
  constructor(sr, nch, cushion) {
    this.ps = new PitchShifter(sr, nch, cushion);
    this.dyn = new Dyn(sr, nch);
    this.nch = nch; this.active = false;
  }
  setParams(p) {
    const act = Math.abs(p.ratio - 1) > 1e-4;
    if (act !== this.active) { this.active = act; this.ps.reset(); }
    if (act) this.ps.setRatio(p.ratio);
    this.dyn.set(p.gateTh, p.expRatio, p.expTh);
  }
  reset() { this.ps.reset(); this.dyn.reset(); }
  /* זרימה בזמן אמת: n דגימות פנימה ו-n החוצה */
  processBlock(ins, outs, n) {
    if (!this.active) {
      for (let c = 0; c < this.nch; c++) outs[c].set(ins[c].subarray(0, n));
    } else {
      this.ps.push(ins, n);
      const got = this.ps.pull(outs, n);
      for (let c = 0; c < this.nch; c++) for (let i = got; i < n; i++) outs[c][i] = 0;
    }
    this.dyn.process(outs, n);
  }
}
