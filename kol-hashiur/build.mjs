// בונה את הדף: אתר מותקן (index.html, מניפסט, עובד שירות, סמלילים) וקובץ עצמאי אחד
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const root = path.dirname(new URL(import.meta.url).pathname);
const r = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const dist = path.join(root, 'dist');
fs.mkdirSync(dist, { recursive: true });

const dsp = r('src/dsp.js');
const worklet = r('src/worklet.js');
const appFor = (site) => ['const SITE_MODE = ' + (site ? 'true' : 'false') + ';', dsp, r('src/prestage.js'), r('src/core.js'), r('src/engine.js'), r('src/meta.js'), r('src/ui.js'), r('src/ui-edit.js'), r('src/publish.js'), r('src/ui-publish.js')].join('\n');
const safe = (s) => s.replace(/<\/script/gi, '<\\/script');

// סמלילים
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const page = await browser.newPage();
async function png(svgFile, size, out) {
  const svg = r(svgFile);
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
  await page.screenshot({ path: path.join(dist, out), omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
}
await png('src/icon.svg', 192, 'icon-192.png');
await png('src/icon.svg', 512, 'icon-512.png');
await png('src/icon.svg', 180, 'apple-touch-icon.png');
await png('src/icon-maskable.svg', 512, 'icon-maskable-512.png');
await png('src/icon.svg', 32, 'favicon-32.png');
await browser.close();
fs.copyFileSync(path.join(root, 'src/icon.svg'), path.join(dist, 'icon.svg'));

const manifest = (inline) => JSON.stringify({
  id: './',
  name: 'סטודיו קול השיעור',
  short_name: 'קול השיעור',
  description: 'עיבוד הקלטות שיעורים בדפדפן, בלי שרת. הכל נשאר אצלך.',
  lang: 'he', dir: 'rtl',
  start_url: './', scope: './',
  display: 'standalone', display_override: ['window-controls-overlay', 'standalone'],
  background_color: '#f6f4ef', theme_color: '#0b6b63',
  categories: ['education', 'music', 'productivity'],
  icons: inline ? [
    { src: inline.i192, sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: inline.i512, sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: inline.imask, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ] : [
    { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
  ],
}, null, 2);

function assemble(headLinks, hasStudio, site) {
  let h = r('src/index.template.html');
  const rep = (k, v) => { h = h.split(k).join('\u0000'); h = h.replace('\u0000', () => v); h = h.split('\u0000').join(''); };
  rep('/*CSS*/', r('src/style.css') + (site ? '\n' + r('src/site.css') : ''));
  rep('/*DSP*/', safe(dsp));
  rep('/*WORKLET*/', safe(worklet));
  rep('/*LIB_WAVESURFER*/', safe(r('vendor/wavesurfer.min.js')));
  rep('/*LIB_LAME*/', safe(r('vendor/lame.min.js')));
  rep('/*APP*/', safe(appFor(site)));
  rep('<!--HEAD_LINKS-->', headLinks);
  if (!hasStudio) h = h.replace('<body>', '<body data-has-studio="0">');
  return h;
}
const b64 = (f) => 'data:image/png;base64,' + fs.readFileSync(path.join(dist, f)).toString('base64');

// האתר המותקן
const installHead = [
  '<link rel="manifest" href="manifest.webmanifest">',
  '<link rel="icon" type="image/svg+xml" href="icon.svg">',
  '<link rel="icon" type="image/png" sizes="32x32" href="favicon-32.png">',
  '<link rel="apple-touch-icon" href="apple-touch-icon.png">',
].join('\n');
const siteApp = assemble(installHead, true, false);
fs.writeFileSync(path.join(dist, 'index.html'), siteApp);
fs.writeFileSync(path.join(dist, 'manifest.webmanifest'), manifest(null));

// הקובץ העצמאי: הכל בפנים
const inline = { i192: b64('icon-192.png'), i512: b64('icon-512.png'), imask: b64('icon-maskable-512.png') };
const manUri = 'data:application/manifest+json;base64,' + Buffer.from(manifest(inline)).toString('base64');
const aloneHead = [
  `<link rel="manifest" href="${manUri}">`,
  `<link rel="icon" type="image/png" href="${b64('favicon-32.png')}">`,
  `<link rel="apple-touch-icon" href="${b64('apple-touch-icon.png')}">`,
].join('\n');
const alone = assemble(aloneHead, false, false);
fs.writeFileSync(path.join(dist, 'studio.html'), alone);
fs.writeFileSync(path.join(dist, 'סטודיו קול השיעור.html'), alone);

// גרסת האתר (ממלכת הזוהר): דף אחד שנטמע באתר, עם פרסום לספרייה
const siteHead = [
  '<meta name="robots" content="noindex">',
  '<!-- PWA-BEGIN: הוזרק ב-pwa_inject.py, כמו בשאר דפי האתר -->',
  '<link rel="manifest" href="/manifest.webmanifest">',
  '<meta name="theme-color" content="#9a7620">',
  '<link rel="apple-touch-icon" href="/icons/apple-touch-icon-180.png">',
  '<script src="/pwa.js" defer></script>',
  '<!-- PWA-END -->',
  '<link rel="stylesheet" href="site-fonts.css">',
].join('\n');
fs.mkdirSync(path.join(dist, 'site'), { recursive: true });
fs.writeFileSync(path.join(dist, 'site', 'זוהר-סטודיו.html'), assemble(siteHead, false, true).replace('<title>סטודיו קול השיעור</title>', '<title>סטודיו קול השיעור · ממלכת הזוהר</title>'));

// כשהמקור יושב בתוך מאגר האתר (תיקיית קול-השיעור), הדף נכתב גם לשורש המאגר: שם הוא מתפרסם
const repoRoot = path.dirname(root);
if (fs.existsSync(path.join(repoRoot, 'זוהר-אודיו.html'))) {
  fs.copyFileSync(path.join(dist, 'site', 'זוהר-סטודיו.html'), path.join(repoRoot, 'זוהר-סטודיו.html'));
  console.log('נכתב גם: זוהר-סטודיו.html בשורש המאגר');
}

// עובד שירות לעבודה בלי אינטרנט
const version = Date.now().toString(36);
fs.writeFileSync(path.join(dist, 'sw.js'), `const CACHE = 'kol-hashiur-${version}';
const FILES = ['./', 'index.html', 'studio.html', 'manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png', 'favicon-32.png'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || fetch(e.request).then((res) => {
    const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return res;
  }).catch(() => caches.match('index.html'))));
});
`);
fs.writeFileSync(path.join(dist, '_headers'), '/*\n  Cache-Control: no-cache\n/sw.js\n  Cache-Control: no-cache\n');

// בדיקות שפה: אין מקף ארוך
for (const f of fs.readdirSync(dist)) {
  if (/\.(html|js|webmanifest|svg)$/.test(f)) {
    const t = fs.readFileSync(path.join(dist, f), 'utf8');
    if (/[\u2013\u2014]/.test(t)) { console.error('נמצא מקף ארוך ב-' + f); process.exit(1); }
  }
}
console.log('נבנה בהצלחה:', fs.readdirSync(dist).join(', '));
