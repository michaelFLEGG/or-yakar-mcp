import { chromium } from 'playwright-core';
const base = 'http://127.0.0.1:8766';
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const c = await b.newContext({ viewport: { width: 1000, height: 1000 } });
const p = await c.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && !/404|Failed to load resource/.test(m.text()) && errs.push(m.text()));
await p.addInitScript(() => { try { localStorage.setItem('zAdminKey', 'SECRET'); } catch (e) {} });
await p.goto(base + '/' + encodeURIComponent('זוהר-אודיו.html')); await p.waitForSelector('.rec');
console.log('recs for admin (with key in storage):', await p.$$eval('.rec', (e) => e.length));
await p.click('button[title^="ניהול ספריית"]'); await p.waitForSelector('#adminPanel.show');
console.log('admin fields:', await p.$$eval('#adminPanel label', (l) => l.map((x) => x.textContent.slice(0, 18)).slice(-8)));
console.log('studio link:', await p.$eval('#adminPanel a[href="זוהר-סטודיו"]', (e) => e.textContent));
await p.waitForSelector('#zapStBody'); await p.waitForTimeout(600);
console.log('stats:', await p.$eval('#zapStBody', (e) => e.innerText.replace(/\n/g, ' | ').slice(0, 200)));
// edit rec2: set hidden
await p.click('.rec:nth-of-type(2) [data-act=edit], .rec [data-act=edit] >> nth=1'); await p.waitForSelector('#aTitle');
await p.fill('#aDesc', 'תיאור בדיקה'); await p.selectOption('#aHidden', '1'); await p.click('#aSave'); await p.waitForTimeout(800);
const cat = await (await fetch(base + '/api/audio/catalog', { headers: { 'x-admin-key': 'SECRET' } })).json();
const r2 = cat.recs.find((r) => r.id === 'rec_t2abc'); console.log('rec2 after edit:', JSON.stringify({ hidden: r2.hidden, desc: r2.desc, size: r2.size, dur: r2.dur, series: r2.series }));
const pub = await (await fetch(base + '/api/audio/catalog')).json(); console.log('public sees:', pub.recs.map((r) => r.id));
// unhide
await fetch(base + '/api/audio/catalog', { method: 'POST', headers: { 'x-admin-key': 'SECRET', 'content-type': 'application/json' }, body: JSON.stringify({ act: 'update', id: 'rec_t2abc', rec: { hidden: false } }) });
console.log('errors', JSON.stringify(errs));
await b.close();
