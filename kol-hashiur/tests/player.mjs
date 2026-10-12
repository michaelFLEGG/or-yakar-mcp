import { chromium } from 'playwright-core';
const base = 'http://127.0.0.1:8766';
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
const c = await b.newContext({ viewport: { width: 1000, height: 900 }, acceptDownloads: true });
const p = await c.newPage();
const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && !/404|Failed to load resource/.test(m.text()) && errs.push(m.text()));
const log = (...a) => console.log(...a);
await p.goto(base + '/' + encodeURIComponent('זוהר-אודיו.html'));
await p.waitForSelector('.rec');
log('recs shown:', await p.$$eval('.rec', (e) => e.length), '(draft hidden from public)');
log('rec1 badges:', await p.$eval('.rec', (e) => e.innerText.replace(/\n/g, ' | ').slice(0, 200)));
log('series options:', await p.$$eval('#fSeries option', (o) => o.map((x) => x.textContent)));
// play first
await p.click('.rec .pbtn'); await p.waitForTimeout(1200);
log('playing:', await p.evaluate(() => !ZAudioCore.au.paused), 'ticks:', await p.$$eval('#zapTicks i', (e) => e.length), 'chap:', await p.$eval('#zapChap', (e) => e.textContent));
// open sheet
await p.click('#zapMore'); await p.waitForTimeout(300);
log('sheet tabs ok:', await p.$$eval('#zapSheet [data-tab]', (e) => e.length));
// silence skip: enable, seek to 5.5 (inside 5-8)
await p.click('[data-do=sil]'); await p.evaluate(() => { ZAudioCore.au.currentTime = 5.5; }); await p.waitForTimeout(700);
log('after silence skip t =', (await p.evaluate(() => ZAudioCore.au.currentTime)).toFixed(2), '(expect ~7.8)');
// sleep timer
await p.click('[data-do=sleep][data-v="5"]'); log('sleep label:', await p.$eval('#zapSleepLbl', (e) => e.textContent)); await p.click('[data-do=sleep][data-v=off]');
// loop
await p.evaluate(() => { ZAudioCore.au.currentTime = 9; }); await p.click('[data-do=loopA]'); await p.evaluate(() => { ZAudioCore.au.currentTime = 11; }); await p.click('[data-do=loopB]'); await p.waitForTimeout(2800);
log('loop count>=1:', await p.$eval('#zapBody .note', (e) => e.parentElement.innerText.replace(/\n/g, ' ').slice(0, 160)));
await p.click('[data-do=loopC]');
// version switch
await p.selectOption('#zapVar', 'recordings/rec_t1abc_v2.mp3'); await p.waitForTimeout(800);
log('variant src:', await p.evaluate(() => ZAudioCore.au.currentSrc.split('/').pop()));
// marks tab: chapter jump + bookmark
await p.click('#zapSheet [data-tab=marks]'); await p.click('#zapBody .it:nth-of-type(3) [data-do=goto]'); await p.waitForTimeout(500);
log('after chapter jump t =', (await p.evaluate(() => ZAudioCore.au.currentTime)).toFixed(1), 'chap label:', await p.$eval('#zapChap', (e) => e.textContent));
await p.fill('#zapBmNote', 'כאן מבאר'); await p.click('[data-do=bmAdd]');
log('bookmark list:', await p.$eval('#zapBody', (e) => e.innerText.replace(/\n/g, ' | ').slice(-120)));
// offline save
await p.click('#zapSheet [data-tab=keep]'); await p.click('[data-do=offToggle]'); await p.waitForFunction(() => /שמור במכשיר/.test(document.querySelector('[data-do=offToggle]').textContent), null, { timeout: 15000 });
log('offline saved:', await p.evaluate(() => Object.keys(window.ZAP ? {} : {}).length), await p.$eval('#zapBody', (e) => e.innerText.slice(0, 160).replace(/\n/g, ' | ')));
await p.evaluate(() => ZAudioCore.au.pause()); await p.click('#zapSheet [data-tab=x]');
// reload from list and play offline (block network for file endpoint)
await p.reload(); await p.waitForSelector('.rec'); await p.waitForTimeout(800);
await p.route('**/api/audio/file/**', (r) => r.abort());
await p.click('.rec .pbtn'); await p.waitForTimeout(1500);
log('offline playback src:', await p.evaluate(() => ZAudioCore.au.currentSrc.slice(0, 10)), 'playing:', await p.evaluate(() => !ZAudioCore.au.paused), 'badge:', await p.$eval('.rec', (e) => /שמור במכשיר/.test(e.innerText)));
await p.unroute('**/api/audio/file/**');
// series autoplay: jump near end of rec 1
await p.evaluate(() => { ZAudioCore.au.currentTime = ZAudioCore.au.duration - 1.5; }); await p.waitForTimeout(3500);
log('series next playing:', await p.evaluate(() => ZAudioCore.cur().id), 'heard badge on 1:', await p.$eval('.rec', (e) => /נשמע/.test(e.innerText)));
// bookmarks view
await p.click('#chips button[data-view=bm]'); await p.waitForTimeout(300);
log('bm view count:', await p.$$eval('.rec', (e) => e.length));
// stats via beacon
await p.waitForTimeout(500);
const st = await (await fetch(base + '/api/audio/stat', { headers: { 'x-admin-key': 'SECRET' } })).json();
log('stats:', JSON.stringify(Object.fromEntries(Object.entries(st.recs).map(([k, v]) => [k, { p: v.p, d: v.d }]))));
// drive mode
await p.click('#zapMore'); await p.click('[data-do=drive]'); log('drive visible:', await p.$eval('#zapDrive', (e) => e.classList.contains('show'))); await p.click('#zdX');
// keyboard
await p.keyboard.press('Space'); await p.waitForTimeout(300); log('space toggled, paused =', await p.evaluate(() => ZAudioCore.au.paused));
// embed
const p2 = await c.newPage(); await p2.goto(base + '/' + encodeURIComponent('זוהר-אודיו.html') + '?rec=rec_t1abc&embed=1'); await p2.waitForTimeout(1200);
log('embed: header hidden', await p2.$eval('.site-head', (e) => getComputedStyle(e).display), 'player visible', await p2.$eval('#playerBar', (e) => getComputedStyle(e).display));
await p2.screenshot({ path: '' + (process.env.TEST_AUDIO_DIR || '.') + '/embed.png' });
await p.screenshot({ path: '' + (process.env.TEST_AUDIO_DIR || '.') + '/player.png' });
log('errors:', JSON.stringify(errs));
await b.close();
