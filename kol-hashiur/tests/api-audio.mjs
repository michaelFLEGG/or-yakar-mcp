// בדיקות לפונקציות הקטלוג, ההעלאה בחלקים, הפיד והסטטיסטיקה, מול אחסון מדומה.
// הרצה: העתק את functions/api לתיקייה עם package.json {"type":"module"} ואז: node api-audio.mjs <התיקייה>
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const cat = await import(pathToFileURL(path.resolve(process.argv[2] || '.') + '/api/audio/catalog.js').href);
const mp = await import(pathToFileURL(path.resolve(process.argv[2] || '.') + '/api/audio/mp.js').href);
const stat = await import(pathToFileURL(path.resolve(process.argv[2] || '.') + '/api/audio/stat.js').href);
const rss = await import(pathToFileURL(path.resolve(process.argv[2] || '.') + '/api/audio/rss.js').href);
const up = await import(pathToFileURL(path.resolve(process.argv[2] || '.') + '/api/audio/upload.js').href);
const file = await import(pathToFileURL(path.resolve(process.argv[2] || '.') + '/api/audio/file/[[path]].js').href);
const kvm = new Map(); kvm.set('admin_key', 'SECRET');
const ZOHAR_KV = { get: async (k) => kvm.get(k) ?? null, put: async (k, v) => { kvm.set(k, v); } };
const store = new Map(); const mps = new Map();
const AUDIO = {
  put: async (k, body, o) => { const b = new Uint8Array(await new Response(body).arrayBuffer()); store.set(k, b); return { size: b.length }; },
  get: async (k, o) => { const b = store.get(k); if (!b) return null; const r = o && o.range ? b.slice(o.range.offset, o.range.offset + o.range.length) : b; return { body: r, size: b.length, httpEtag: 'e' }; },
  head: async (k) => { const b = store.get(k); return b ? { size: b.length, httpEtag: 'e' } : null; },
  delete: async (k) => { store.delete(k); },
  createMultipartUpload: async (k) => { const id = 'up' + Math.random().toString(36).slice(2) + 'abcdefgh'; mps.set(id, { k, parts: new Map() }); return { uploadId: id }; },
  resumeMultipartUpload: (k, id) => { const m = mps.get(id); return { uploadPart: async (n, buf) => { m.parts.set(n, new Uint8Array(buf)); return { etag: 'et' + n, partNumber: n }; },
    complete: async (parts) => { const arr = parts.map(p => m.parts.get(p.partNumber)); const tot = arr.reduce((a, x) => a + x.length, 0); const o = new Uint8Array(tot); let off = 0; for (const x of arr) { o.set(x, off); off += x.length; } store.set(k, o); return { size: tot }; }, abort: async () => { mps.delete(id); } }; },
};
const env = { ZOHAR_KV, AUDIO };
const call = async (mod, method, path, body, headers = {}) => {
  const init = { method, headers: { ...headers } }; if (body !== undefined) init.body = typeof body === 'string' || body instanceof Uint8Array ? body : JSON.stringify(body);
  const req = new Request('https://x.test' + path, init);
  const r = await mod.onRequest({ request: req, env, params: {} }); return r;
};
const A = { 'x-admin-key': 'SECRET' };
let ok = true; const t = (n, c) => { console.log((c ? 'PASS ' : 'FAIL ') + n); if (!c) ok = false; };
// multipart
let r = await call(mp, 'POST', '/api/audio/mp?act=start&key=recordings/rec_a1.mp3', undefined, A); let j = await r.json(); t('mp start', j.ok && j.uploadId);
const uid = j.uploadId;
const part1 = new Uint8Array(1000).fill(1), part2 = new Uint8Array(500).fill(2);
r = await call(mp, 'POST', `/api/audio/mp?act=part&key=recordings/rec_a1.mp3&uploadId=${uid}&n=1`, part1, A); const p1 = await r.json(); t('part1', p1.ok);
r = await call(mp, 'POST', `/api/audio/mp?act=part&key=recordings/rec_a1.mp3&uploadId=${uid}&n=2`, part2, A); const p2 = await r.json(); t('part2', p2.ok);
r = await call(mp, 'POST', `/api/audio/mp?act=done&key=recordings/rec_a1.mp3&uploadId=${uid}`, { parts: [{ n: 2, etag: p2.etag }, { n: 1, etag: p1.etag }] }, A); j = await r.json(); t('done size 1500', j.ok && j.size === 1500);
r = await call(mp, 'POST', '/api/audio/mp?act=start&key=recordings/rec_a1.mp3', undefined, {}); t('mp unauthorized 403', r.status === 403);
r = await call(mp, 'POST', '/api/audio/mp?act=start&key=../etc/passwd', undefined, A); t('mp bad key 400', r.status === 400);
// catalog add with extended fields
const rec = { id: 'rec_a1', file: 'recordings/rec_a1.mp3', size: 1500, dur: 100, title: 'שיעור בדיקה', series: 'סדרה א', seriesNo: 1,
  variants: [{ label: 'לנהיגה', file: 'recordings/rec_a1_drive.mp3', size: 900 }, { label: 'רע', file: '../x' }],
  chapters: [{ t: 50, n: 'ב' }, { t: 0, n: 'פתיחה' }, { t: 5, n: '' }], silf: 'timings/rec_a1.sil.json', pub: '2020-01-01', junk: 'x' };
r = await call(cat, 'POST', '/api/audio/catalog', { act: 'add', rec }, A); j = await r.json(); t('catalog add', j.ok);
r = await call(cat, 'GET', '/api/audio/catalog'); j = await r.json(); const g = j.recs[0];
t('public get has rec', j.recs.length === 1); t('variants filtered', g.variants.length === 1 && g.variants[0].label === 'לנהיגה'); t('chapters sorted/clean', g.chapters.length === 2 && g.chapters[0].n === 'פתיחה'); t('junk dropped', !('junk' in g)); t('silf kept', g.silf === 'timings/rec_a1.sil.json');
// hidden + future
await call(cat, 'POST', '/api/audio/catalog', { act: 'add', rec: { id: 'rec_h1', file: 'recordings/rec_h1.mp3', hidden: true } }, A);
await call(cat, 'POST', '/api/audio/catalog', { act: 'add', rec: { id: 'rec_f1', file: 'recordings/rec_f1.mp3', pub: '2099-01-01' } }, A);
r = await call(cat, 'GET', '/api/audio/catalog'); j = await r.json(); t('public hides hidden+future', j.recs.length === 1 && j.admin === false);
r = await call(cat, 'GET', '/api/audio/catalog', undefined, A); j = await r.json(); t('admin sees all', j.recs.length === 3 && j.admin === true);
// update merges
r = await call(cat, 'POST', '/api/audio/catalog', { act: 'update', id: 'rec_a1', rec: { topic: 'נושא', hidden: true } }, A); j = await r.json();
r = await call(cat, 'GET', '/api/audio/catalog', undefined, A); j = await r.json(); const u = j.recs.find(x => x.id === 'rec_a1');
t('update keeps size/dur/variants/chapters', u.size === 1500 && u.dur === 100 && u.variants.length === 1 && u.chapters.length === 2 && u.topic === 'נושא' && u.hidden === true);
await call(cat, 'POST', '/api/audio/catalog', { act: 'update', id: 'rec_a1', rec: { hidden: false, chapters: [] } }, A);
r = await call(cat, 'GET', '/api/audio/catalog', undefined, A); j = await r.json(); const u2 = j.recs.find(x => x.id === 'rec_a1'); t('update clears hidden/chapters', !('hidden' in u2) && !('chapters' in u2));
// rss
await call(cat, 'POST', '/api/audio/catalog', { act: 'update', id: 'rec_a1', rec: { pub: '2020-05-05' } }, A);
r = await call(rss, 'GET', '/api/audio/rss'); const x = await r.text();
t('rss xml', x.startsWith('<?xml') && x.includes('<enclosure url="https://x.test/api/audio/file/recordings/rec_a1.mp3"') && x.includes('שיעור בדיקה') && !x.includes('rec_h1') && x.includes('itunes:duration>1:40'));
r = await call(rss, 'GET', '/api/audio/rss?series=' + encodeURIComponent('אחרת')); t('rss filter empty', !(await r.text()).includes('<item>'));
// stat
r = await call(stat, 'POST', '/api/audio/stat', JSON.stringify({ id: 'rec_abc1', first: true, rate: 1.5, pos: 0.51 })); t('stat post', (await r.json()).ok);
r = await call(stat, 'POST', '/api/audio/stat', JSON.stringify({ id: 'rec_abc1', done: true })); 
r = await call(stat, 'POST', '/api/audio/stat', JSON.stringify({ id: '../bad' })); t('stat bad id', r.status === 400);
r = await call(stat, 'GET', '/api/audio/stat'); t('stat get needs admin', r.status === 403);
r = await call(stat, 'GET', '/api/audio/stat', undefined, A); j = await r.json(); t('stat counts', j.recs.rec_abc1.p === 1 && j.recs.rec_abc1.d === 1 && j.recs.rec_abc1.h[20] === 1 && j.recs.rec_abc1.rs === 1.5);
// delete removes variants, silf
store.set('recordings/rec_a1_drive.mp3', new Uint8Array(1)); store.set('timings/rec_a1.sil.json', new Uint8Array(1));
r = await call(cat, 'POST', '/api/audio/catalog', { act: 'del', id: 'rec_a1' }, A); j = await r.json();
t('delete cleans r2', j.ok && !store.has('recordings/rec_a1.mp3') && !store.has('recordings/rec_a1_drive.mp3') && !store.has('timings/rec_a1.sil.json'));
console.log(ok ? 'ALL OK' : 'SOME FAILED');
