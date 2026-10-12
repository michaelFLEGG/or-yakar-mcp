/* שלב ההכנה: הסרת זמזום, ניקוי רעש, קיצור שתיקות, מדידת עוצמה וחישוב פסגות */

const yieldUi = () => new Promise((r) => setTimeout(r, 0));

class Pacer {
  constructor() { this.t = performance.now(); }
  async tick(cb) {
    if (performance.now() - this.t > 30) {
      if (cb) cb();
      await yieldUi();
      this.t = performance.now();
    }
  }
}

/* מסנן דו-ריבועי ישיר */
function biquadCoefs(type, fs, f0, Q) {
  const w = 2 * Math.PI * f0 / fs, c = Math.cos(w), s = Math.sin(w), al = s / (2 * Q);
  let b0, b1, b2, a0, a1, a2;
  if (type === 'notch') { b0 = 1; b1 = -2 * c; b2 = 1; a0 = 1 + al; a1 = -2 * c; a2 = 1 - al; }
  else { b0 = 1; b1 = -2 * c; b2 = 1; a0 = 1 + al; a1 = -2 * c; a2 = 1 - al; }
  return [b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0];
}
function biquadRun(x, co) {
  const [b0, b1, b2, a1, a2] = co;
  let z1 = 0, z2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = x[i], y = b0 * v + z1;
    z1 = b1 * v - a1 * y + z2;
    z2 = b2 * v - a2 * y;
    x[i] = y;
  }
}
async function removeHum(chs, sr, pacer, cb) {
  const freqs = [50, 100, 150, 200, 250];
  for (const ch of chs) {
    for (const f of freqs) {
      if (f < sr / 2.2) biquadRun(ch, biquadCoefs('notch', sr, f, 30));
      await pacer.tick(cb);
    }
  }
}

/* התמרת פורייה מהירה במקום */
class FFT {
  constructor(n) {
    this.n = n;
    this.cos = new Float64Array(n / 2);
    this.sin = new Float64Array(n / 2);
    for (let i = 0; i < n / 2; i++) { this.cos[i] = Math.cos(2 * Math.PI * i / n); this.sin[i] = -Math.sin(2 * Math.PI * i / n); }
    this.rev = new Uint32Array(n);
    let bits = Math.log2(n) | 0;
    for (let i = 0; i < n; i++) {
      let r = 0;
      for (let b = 0; b < bits; b++) if (i & (1 << b)) r |= 1 << (bits - 1 - b);
      this.rev[i] = r;
    }
  }
  run(re, im, inverse) {
    const n = this.n, rev = this.rev;
    for (let i = 0; i < n; i++) {
      const j = rev[i];
      if (j > i) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
    }
    const sgn = inverse ? -1 : 1;
    for (let size = 2; size <= n; size <<= 1) {
      const half = size >> 1, step = n / size;
      for (let i = 0; i < n; i += size) {
        for (let j = 0, k = 0; j < half; j++, k += step) {
          const wr = this.cos[k], wi = sgn * this.sin[k];
          const a = i + j, b = a + half;
          const tr = re[b] * wr - im[b] * wi, ti = re[b] * wi + im[b] * wr;
          re[b] = re[a] - tr; im[b] = im[a] - ti;
          re[a] += tr; im[a] += ti;
        }
      }
    }
    if (inverse) for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
  }
}

/* ניקוי רעש בשיטת הפחתה ספקטרלית. strength בין 0 ל-100 */
async function denoise(chs, sr, strength, pacer, cb) {
  const N = 1024, H = 512;
  const fft = new FFT(N);
  const win = new Float64Array(N);
  for (let i = 0; i < N; i++) win[i] = Math.sqrt(0.5 - 0.5 * Math.cos(2 * Math.PI * i / N));
  const bins = N / 2 + 1;
  const floor = Math.pow(10, -(24 * strength / 100) / 20);
  const alpha = 1 + 1.6 * strength / 100;
  const re = new Float64Array(N), im = new Float64Array(N);
  /* פרופיל רעש משותף מהערוץ הראשון: ממוצע הקטעים השקטים ביותר */
  const ref = chs[0], len = ref.length;
  const nFr = Math.max(1, Math.floor((len - N) / H) + 1);
  const en = new Float32Array(nFr);
  for (let f = 0; f < nFr; f++) {
    let s = 0; const o = f * H;
    for (let i = 0; i < N; i += 4) s += ref[o + i] * ref[o + i];
    en[f] = s;
    if ((f & 1023) === 0) await pacer.tick(cb);
  }
  const sorted = Float32Array.from(en).sort();
  const take = Math.max(8, Math.floor(nFr * 0.1));
  const thr = sorted[Math.min(nFr - 1, take - 1)];
  const noise = new Float64Array(bins);
  let cnt = 0;
  const stride = Math.max(1, Math.floor(nFr / 4000));
  for (let f = 0; f < nFr && cnt < 400; f += stride) {
    if (en[f] > thr) continue;
    const o = f * H;
    for (let i = 0; i < N; i++) { re[i] = ref[o + i] * win[i]; im[i] = 0; }
    fft.run(re, im, false);
    for (let k = 0; k < bins; k++) noise[k] += Math.hypot(re[k], im[k]);
    cnt++;
  }
  if (cnt === 0) return;
  for (let k = 0; k < bins; k++) noise[k] /= cnt;
  const g = new Float64Array(bins), gs = new Float64Array(bins), prev = new Float64Array(bins).fill(1);
  for (const x of chs) {
    const out = new Float32Array(x.length + N);
    for (let f = 0; f < nFr; f++) {
      const o = f * H;
      for (let i = 0; i < N; i++) { re[i] = x[o + i] * win[i]; im[i] = 0; }
      fft.run(re, im, false);
      for (let k = 0; k < bins; k++) {
        const m = Math.hypot(re[k], im[k]) + 1e-12;
        let v = (m - alpha * noise[k]) / m;
        if (v < floor) v = floor; else if (v > 1) v = 1;
        g[k] = v;
      }
      for (let k = 0; k < bins; k++) {
        const a = g[k > 0 ? k - 1 : 0], b = g[k], c = g[k < bins - 1 ? k + 1 : bins - 1];
        let v = 0.25 * a + 0.5 * b + 0.25 * c;
        v = v > prev[k] ? prev[k] + (v - prev[k]) * 0.8 : prev[k] + (v - prev[k]) * 0.35;
        prev[k] = v; gs[k] = v;
      }
      for (let k = 0; k < bins; k++) {
        re[k] *= gs[k]; im[k] *= gs[k];
        if (k > 0 && k < N / 2) { re[N - k] = re[k]; im[N - k] = -im[k]; }
      }
      fft.run(re, im, true);
      for (let i = 0; i < N; i++) out[o + i] += re[i] * win[i];
      if ((f & 255) === 0) await pacer.tick(cb ? () => cb(f / nFr) : null);
    }
    x.set(out.subarray(0, x.length));
  }
}

/* זיהוי שתיקות: מחזיר רשימת טווחים [התחלה, סוף) בדגימות. סף אוטומטי לפי רצפת הרעש. */
function detectSilence(chs, sr, minSec) {
  const len = chs[0].length, fr = Math.round(sr * 0.01), nf = Math.floor(len / fr);
  if (nf < 10) return [];
  const db = new Float32Array(nf);
  for (let f = 0; f < nf; f++) {
    let s = 0;
    for (const x of chs) { for (let i = f * fr; i < (f + 1) * fr; i++) s += x[i] * x[i]; }
    db[f] = 10 * Math.log10(s / (fr * chs.length) + 1e-12);
  }
  const sorted = Float32Array.from(db).sort();
  const lo = sorted[Math.floor(nf * 0.05)], hi = sorted[Math.floor(nf * 0.95)];
  const thr = lo + 0.35 * (hi - lo);
  const minFr = Math.max(1, Math.round(minSec * 100));
  const out = [];
  let f = 0;
  while (f < nf) {
    if (db[f] < thr) {
      let e = f;
      while (e < nf && db[e] < thr) e++;
      if (e - f >= minFr) out.push([f * fr, e * fr]);
      f = e;
    } else f++;
  }
  return out;
}

/* טווחי ההסרה לקיצור שתיקות: משאירים keep שניות מכל שתיקה ארוכה (חצי בתחילתה וחצי בסופה) */
function silenceRemovals(chs, sr, minSec, keepSec) {
  const keep = Math.round(keepSec * sr), out = [];
  for (const [a, b] of detectSilence(chs, sr, minSec)) {
    if (b - a <= keep) continue;
    const head = Math.floor(keep / 2), tail = keep - head;
    out.push([a + head, b - tail]);
  }
  return out;
}

/* איחוד טווחים חופפים וסידורם */
function mergeRanges(r) {
  r = r.filter((x) => x[1] > x[0]).sort((a, b) => a[0] - b[0]);
  const out = [];
  for (const x of r) {
    if (out.length && x[0] <= out[out.length - 1][1]) out[out.length - 1][1] = Math.max(out[out.length - 1][1], x[1]);
    else out.push([x[0], x[1]]);
  }
  return out;
}

/* בונה את ההקלטה המחוברת: מוריד את טווחי ההסרה, ומוסיף פתיח וסיום אם יש.
   מחזיר ערוצים חדשים ומפת זמנים (segs) מהמקור אל המעובד. */
function buildKept(chs, sr, removals, intro, outro) {
  const len = chs[0].length;
  const rem = mergeRanges(removals);
  const keeps = [];
  let pos = 0;
  for (const [a, b] of rem) { if (a > pos) keeps.push([pos, a]); pos = Math.max(pos, b); }
  if (pos < len) keeps.push([pos, len]);
  if (!keeps.length) keeps.push([0, Math.min(len, 1)]);
  const introLen = intro ? intro[0].length : 0, outroLen = outro ? outro[0].length : 0;
  let bodyLen = 0; for (const k of keeps) bodyLen += k[1] - k[0];
  const total = introLen + bodyLen + outroLen;
  const out = chs.map(() => new Float32Array(total));
  const fade = Math.round(sr * 0.008);
  const segs = [];
  let p = introLen;
  keeps.forEach((k, idx) => {
    segs.push({ o0: k[0], o1: k[1], p0: p });
    for (let c = 0; c < chs.length; c++) {
      out[c].set(chs[c].subarray(k[0], k[1]), p);
      if (idx > 0) for (let i = 0; i < fade && i < k[1] - k[0]; i++) out[c][p + i] *= i / fade;
      if (idx < keeps.length - 1) for (let i = 0; i < fade && i < k[1] - k[0]; i++) out[c][p + (k[1] - k[0]) - 1 - i] *= i / fade;
    }
    p += k[1] - k[0];
  });
  for (let c = 0; c < chs.length; c++) {
    if (intro) out[c].set(intro[Math.min(c, intro.length - 1)], 0);
    if (outro) out[c].set(outro[Math.min(c, outro.length - 1)], introLen + bodyLen);
  }
  return { chs: out, segs, origLen: len, introLen, outroLen };
}

function identityMap(len) { return { segs: [{ o0: 0, o1: len, p0: 0 }], origLen: len }; }

/* המרת מיקום מקורי למיקום מעובד ובחזרה (בדגימות) */
function mapOrigToPre(map, o) {
  const s = map.segs;
  let lo = 0, hi = s.length - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (s[mid].o0 <= o) lo = mid; else hi = mid - 1; }
  const sg = s[lo];
  return sg.p0 + Math.min(Math.max(o, sg.o0), sg.o1) - sg.o0;
}
function mapPreToOrig(map, p) {
  const s = map.segs;
  let lo = 0, hi = s.length - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (s[mid].p0 <= p) lo = mid; else hi = mid - 1; }
  const sg = s[lo];
  return sg.o0 + Math.min(Math.max(p - sg.p0, 0), sg.o1 - sg.o0);
}

/* מדידת עוצמה בשיטת המסנן התקני (משוקללת) */
function kCoefs(fs) {
  const G = 3.999843853973347, Q = 0.7071752369554196, fc = 1681.9744509555319;
  let K = Math.tan(Math.PI * fc / fs);
  const Vh = Math.pow(10, G / 20), Vb = Math.pow(Vh, 0.4996667741545416);
  let a0 = 1 + K / Q + K * K;
  const sh = [(Vh + Vb * K / Q + K * K) / a0, 2 * (K * K - Vh) / a0, (Vh - Vb * K / Q + K * K) / a0, 2 * (K * K - 1) / a0, (1 - K / Q + K * K) / a0];
  const Q2 = 0.5003270373238773, fc2 = 38.13547087613982;
  K = Math.tan(Math.PI * fc2 / fs);
  a0 = 1 + K / Q2 + K * K;
  const hp = [1 / a0, -2 / a0, 1 / a0, 2 * (K * K - 1) / a0, (1 - K / Q2 + K * K) / a0];
  return [sh, hp];
}
class LoudnessMeter {
  constructor() { this.blocks = []; }
  add(chs, sr) {
    const [sh, hp] = kCoefs(sr);
    const w = chs.map((x) => { const y = Float32Array.from(x); biquadRun(y, sh); biquadRun(y, hp); return y; });
    const bl = Math.round(sr * 0.4), hop = Math.round(sr * 0.1);
    for (let o = 0; o + bl <= w[0].length; o += hop) {
      let z = 0;
      for (const y of w) { let s = 0; for (let i = o; i < o + bl; i++) s += y[i] * y[i]; z += s / bl; }
      this.blocks.push(z);
    }
  }
  integrated() {
    const L = (z) => -0.691 + 10 * Math.log10(z + 1e-12);
    let b = this.blocks.filter((z) => L(z) > -70);
    if (!b.length) return null;
    const mean = b.reduce((a, z) => a + z, 0) / b.length;
    b = b.filter((z) => L(z) > L(mean) - 10);
    if (!b.length) return null;
    return L(b.reduce((a, z) => a + z, 0) / b.length);
  }
}

/* פסגות לציור הגל. מחזיר מערך אחד באורך cols */
function computePeaks(chs, cols, map, totalOrig) {
  const out = new Float32Array(cols);
  const segs = map ? map.segs : [{ o0: 0, o1: chs[0].length, p0: 0 }];
  const per = totalOrig / cols;
  for (const sg of segs) {
    const c0 = Math.floor(sg.o0 / per), c1 = Math.min(cols - 1, Math.floor((sg.o1 - 1) / per));
    for (let c = c0; c <= c1; c++) {
      const a = Math.max(sg.o0, c * per), b = Math.min(sg.o1, (c + 1) * per);
      const pa = Math.floor(sg.p0 + (a - sg.o0)), pb = Math.max(pa + 1, Math.floor(sg.p0 + (b - sg.o0)));
      let m = 0;
      const step = Math.max(1, Math.floor((pb - pa) / 64));
      for (const x of chs) for (let i = pa; i < pb; i += step) { const v = Math.abs(x[i]); if (v > m) m = v; }
      if (m > out[c]) out[c] = m;
    }
  }
  return out;
}
