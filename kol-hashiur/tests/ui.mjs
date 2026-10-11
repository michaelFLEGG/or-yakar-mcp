import { chromium } from 'playwright-core';
const T = '/tmp/claude-0/-home-user-or-yakar-mcp/f9cc8d6e-a55d-5c1b-a5b6-9431b5dd331b/scratchpad/t';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
const errs = [];
async function run(scheme, w) {
  const c = await b.newContext({ viewport: { width: w, height: 900 }, colorScheme: scheme, permissions: ['microphone'] });
  const p = await c.newPage();
  p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => ['error', 'warning'].includes(m.type()) && errs.push(m.text()));
  await p.goto('http://127.0.0.1:8765/index.html');
  await p.setInputFiles('#file', T + '/sample.mp3');
  await p.waitForSelector('#studio:not(.hide)');
  await p.click('#presets button:has-text("נאום בפאתוס")');
  await p.waitForTimeout(1500);
  await p.screenshot({ path: `${T}/full_${scheme}_${w}.png`, fullPage: true });
  // horizontal overflow check
  const ov = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  console.log(scheme, w, 'overflowX', ov);
  // small buttons check
  const small = await p.evaluate(() => [...document.querySelectorAll('button,select,input[type=range]')].filter((e) => e.offsetParent && (e.getBoundingClientRect().height < 47.5 || e.getBoundingClientRect().width < 47.5)).map((e) => (e.textContent || e.id).trim().slice(0, 20) + ':' + Math.round(e.getBoundingClientRect().width) + 'x' + Math.round(e.getBoundingClientRect().height)));
  console.log(' small:', JSON.stringify(small));
  // English text check
  const eng = await p.evaluate(() => { const t = document.body.innerText; return [...new Set(t.match(/[A-Za-z]{2,}/g) || [])]; });
  console.log(' english words visible:', JSON.stringify(eng));
  if (scheme === 'light' && w === 1200) {
    // zoom, loop, blind, ab
    await p.click('#bZin'); await p.click('#bZin'); await p.waitForTimeout(300);
    await p.click('details.grp:has(#bLA) summary'); await p.click('#bPlay'); await p.waitForTimeout(800);
    await p.click('#bLA'); await p.waitForTimeout(1200); await p.click('#bLB'); await p.waitForTimeout(2500);
    console.log(' loop:', await p.$eval('#loopInfo', (e) => e.innerText));
    await p.click('#bPlay');
    await p.click('#bBlind'); await p.click('#bbA'); await p.waitForTimeout(500); await p.click('#bpA');
    console.log(' blind:', await p.$eval('#blindRes', (e) => e.innerText));
    await p.screenshot({ path: `${T}/desk_zoom.png`, fullPage: false });
    // dialogs
    await p.click('#bSavePreset'); await p.fill('#dlgInput', 'הערכה שלי'); await p.click('#dlgBtns button:has-text("שמור")');
    console.log(' custom presets:', await p.$$eval('#custom button', (bs) => bs.map((x) => x.textContent)));
    await p.click('#btnRec'); await p.waitForTimeout(2200); console.log(' rec clock', await p.$eval('#recClock', (e) => e.innerText));
    await p.click('#btnRecStop'); await p.waitForSelector('#info .chip', { timeout: 15000 }); await p.waitForTimeout(1500);
    console.log(' after rec info:', await p.$eval('#info', (e) => e.innerText.replace(/\n/g, ' | ')));
    await p.click('#aiGo'); console.log(' ai dialog:', await p.$eval('#dlgBody', (e) => e.innerText)); await p.click('#dlgBtns button');
  }
  await c.close();
}
await run('light', 380); await run('dark', 380); await run('light', 1200);
console.log('errors', JSON.stringify(errs));
await b.close();
