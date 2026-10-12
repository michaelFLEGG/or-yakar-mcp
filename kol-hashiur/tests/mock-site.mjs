// שרת בדיקה מקומי: מריץ את פונקציות האתר האמיתיות (קטלוג, העלאה, העלאה בחלקים, הגשה, פיד, סטטיסטיקה)
// מול אחסון מדומה בזיכרון, ומגיש דפים סטטיים. שימוש: node mock-site.mjs <תיקיית-פונקציות-מועתקת> <פורט> <תיקייה-סטטית>...
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const [fdir, port, ...statics] = process.argv.slice(2);
const load = (p) => import(pathToFileURL(path.join(fdir, p)).href);
const mods = {
  '/api/audio/catalog': await load('api/audio/catalog.js'),
  '/api/audio/upload': await load('api/audio/upload.js'),
  '/api/audio/mp': await load('api/audio/mp.js'),
  '/api/audio/stat': await load('api/audio/stat.js'),
  '/api/audio/rss': await load('api/audio/rss.js'),
};
const fileMod = await load('api/audio/file/[[path]].js');

const kv = new Map([['admin_key', 'SECRET']]);
const ZOHAR_KV = { get: async (k) => kv.get(k) ?? null, put: async (k, v) => { kv.set(k, v); } };
const store = new Map(), mps = new Map();
const AUDIO = {
  put: async (k, body, o) => { const b = new Uint8Array(await new Response(body).arrayBuffer()); store.set(k, b); return { size: b.length }; },
  get: async (k, o) => { const b = store.get(k); if (!b) return null; const r = o && o.range ? b.slice(o.range.offset, o.range.offset + o.range.length) : b; return { body: r, size: b.length, httpEtag: '"e"' }; },
  head: async (k) => { const b = store.get(k); return b ? { size: b.length, httpEtag: '"e"' } : null; },
  delete: async (k) => { store.delete(k); },
  createMultipartUpload: async (k) => { const id = 'up' + Math.random().toString(36).slice(2) + 'abcdefgh'; mps.set(id, { k, parts: new Map() }); return { uploadId: id }; },
  resumeMultipartUpload: (k, id) => { const m = mps.get(id); return {
    uploadPart: async (n, buf) => { m.parts.set(n, new Uint8Array(buf)); return { etag: 'et' + n, partNumber: n }; },
    complete: async (parts) => { const arr = parts.map((p) => m.parts.get(p.partNumber)); const tot = arr.reduce((a, x) => a + x.length, 0); const o = new Uint8Array(tot); let off = 0; for (const x of arr) { o.set(x, off); off += x.length; } store.set(k, o); return { size: tot }; },
    abort: async () => { mps.delete(id); } }; },
};
const env = { ZOHAR_KV, AUDIO };
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost:' + port);
    const p = decodeURIComponent(url.pathname);
    if (p === '/__debug/store') { res.end(JSON.stringify([...store.keys()])); return; }
    let handler = null, params = {};
    if (mods[p]) handler = mods[p];
    else if (p.startsWith('/api/audio/file/')) { handler = fileMod; params = { path: p.slice('/api/audio/file/'.length).split('/') }; }
    if (handler) {
      const chunks = []; for await (const c of req) chunks.push(c);
      const body = Buffer.concat(chunks);
      const init = { method: req.method, headers: req.headers };
      if (!['GET', 'HEAD'].includes(req.method)) init.body = body;
      const r = await handler.onRequest({ request: new Request('http://localhost:' + port + req.url, init), env, params });
      const h = {}; r.headers.forEach((v, k) => { h[k] = v; });
      res.writeHead(r.status, h);
      res.end(Buffer.from(await r.arrayBuffer()));
      return;
    }
    let f = null;
    const rel = p === '/' ? '/index.html' : p;
    for (const d of statics) { const c = path.join(d, rel); if (fs.existsSync(c) && fs.statSync(c).isFile()) { f = c; break; } const c2 = path.join(d, rel + '.html'); if (fs.existsSync(c2)) { f = c2; break; } }
    if (!f) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' });
    res.end(fs.readFileSync(f));
  } catch (e) { res.writeHead(500); res.end(String(e && e.stack || e)); }
}).listen(parseInt(port, 10), '127.0.0.1', () => console.log('mock site on', port));
