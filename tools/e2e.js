const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const base = 'http://127.0.0.1:8123/index.html?mock';
  const errors = [];
  const mk = async (url, vp) => { const p = await ctx.newPage(); if (vp) await p.setViewportSize(vp); p.on('pageerror', (e) => errors.push(url + ': ' + e.message)); await p.goto(url); return p; };
  const admin = await mk(base + '#admin', { width: 420, height: 860 });
  await admin.evaluate(() => localStorage.removeItem('kkwar-mock-db')); await admin.reload();
  await admin.waitForSelector('#pin'); await admin.fill('#pin', '1234'); await admin.click('[data-act="pin"]');
  await admin.waitForSelector('[data-act="fill-demo"]'); await admin.click('[data-act="fill-demo"]'); await admin.waitForTimeout(300);
  await admin.click('[data-act="atab"][data-tab="rank"]'); await admin.waitForTimeout(200);
  const order = ['red','yellow','blue','purple'];
  for (const a of ['pool','kart','legs','water']) { const o = [...order].sort(() => Math.random()-0.5); for (let i=0;i<4;i++) { await admin.click(`[data-act="rank-pick"][data-a="${a}"][data-team="${o[i]}"]`); await admin.waitForTimeout(80); } }
  await admin.click('[data-act="save-rank"]'); await admin.waitForTimeout(300);
  await admin.click('[data-act="atab"][data-tab="control"]'); await admin.waitForTimeout(200);
  await admin.click('[data-act="draw"]'); await admin.waitForTimeout(400);
  await admin.click('[data-act="next-match"]'); await admin.waitForTimeout(800);
  const db = async () => JSON.parse(await admin.evaluate(() => localStorage.getItem('kkwar-mock-db'))).kkwar;
  const m = (await db()).match; const teamA = m.a, teamB = m.b;
  // ผู้ควบคุมทีม A บนมือถือ, กองเชียร์ทีม B บนมือถืออีกเครื่อง (context เดียวกันใช้ localStorage ร่วม → แยก context)
  const ctrl = await ctx.newPage(); await ctrl.setViewportSize({ width: 390, height: 844 }); ctrl.on('pageerror', (e) => errors.push('ctrl: ' + e.message));
  await ctrl.goto(base + '#team-' + teamA); await ctrl.waitForSelector('#teampass'); await ctrl.fill('#teampass', { red: '1111', yellow: '2222', blue: '3333', purple: '4444' }[teamA]); await ctrl.click('[data-act="unlock"]');
  await ctrl.waitForSelector('[data-act="role-ctrl"]'); await ctrl.click('[data-act="role-ctrl"]'); await ctrl.waitForTimeout(500);
  await ctrl.screenshot({ path: 'tools/shots/t-plan-wait.png', fullPage: true });
  const fan = await ctx.newPage(); await fan.setViewportSize({ width: 390, height: 844 }); fan.on('pageerror', (e) => errors.push('fan: ' + e.message));
  await fan.goto(base + '#team-' + teamB); await fan.waitForSelector('#teampass'); await fan.fill('#teampass', { red: '1111', yellow: '2222', blue: '3333', purple: '4444' }[teamB]); await fan.click('[data-act="unlock"]');
  await fan.waitForSelector('[data-act="role-fan"]'); await fan.click('[data-act="role-fan"]'); await fan.waitForTimeout(400);
  const screen = await mk(base + '#screen');
  await screen.waitForTimeout(500); await screen.screenshot({ path: 'tools/shots/screen-plan.png' });
  // เริ่มนับเวลาวางแผน
  await admin.click('[data-act="start-plan"]'); await admin.waitForTimeout(500);
  await ctrl.screenshot({ path: 'tools/shots/t-plan.png', fullPage: true });
  for (let i = 0; i < 50; i++) { const b = await fan.$('[data-act="tap"]'); if (b) await b.click(); }
  await fan.waitForTimeout(600); await fan.screenshot({ path: 'tools/shots/t-fan.png', fullPage: true });
  const stageOf = async () => (await db()).match && (await db()).match.stage;
  const waitStage = async (stg, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const cur = await stageOf(); if (cur === stg || cur === 'result') return true; await admin.waitForTimeout(500); } throw new Error('stage ' + stg + ' not reached, at ' + await stageOf()); };
  await admin.click('[data-act="advance"]');
  await waitStage('wave1', 5000); await admin.waitForTimeout(1500);
  await screen.screenshot({ path: 'tools/shots/screen-countdown.png' });
  await admin.waitForTimeout(5000);
  await screen.screenshot({ path: 'tools/shots/screen-wave1.png' });
  await waitStage('pause1', 30000); await admin.waitForTimeout(1500);
  await ctrl.screenshot({ path: 'tools/shots/t-pause-countdown.png' });
  await admin.waitForTimeout(3000);
  await ctrl.screenshot({ path: 'tools/shots/t-pause1.png', fullPage: true });
  const it = await ctrl.$('[data-act="item"]'); if (it) await it.click();
  const pl = await ctrl.$('[data-act="plan"][data-plan="back"]'); if (pl) await pl.click();
  await admin.click('[data-act="advance"]');
  await waitStage('wave2', 30000); await admin.waitForTimeout(6000);
  await screen.screenshot({ path: 'tools/shots/screen-wave2.png' });
  await waitStage('pause2', 30000);
  const it2 = await ctrl.$('[data-act="item"]'); if (it2) await it2.click();
  await admin.click('[data-act="advance"]');
  await waitStage('wave3', 30000); await admin.waitForTimeout(8000);
  await waitStage('result', 60000); await admin.waitForTimeout(1500);
  await screen.screenshot({ path: 'tools/shots/screen-result.png', fullPage: true });
  const decided = async () => { const mm = (await db()).match; return mm.wins.a >= 2 || mm.wins.b >= 2; };
  let guard = 0;
  while (!(await decided()) && guard++ < 3) {
    await admin.click('[data-act="next-round"]'); await waitStage('plan', 5000); await admin.waitForTimeout(500);
    await admin.click('[data-act="start-plan"]').catch(() => {});
    let prev = 'plan'; for (const stg of ['wave1', 'pause1', 'wave2', 'pause2', 'wave3', 'result']) { if (await stageOf() === prev) await admin.click('[data-act="advance"]').catch(() => {}); await waitStage(stg, 40000); if (stg === 'pause1') { const x = await ctrl.$('[data-act="item"]'); if (x) await x.click(); } await admin.waitForTimeout(600); prev = stg; }
  }
  console.log('decided after rounds:', guard + 1);
  const state = await db();
  console.log('match stage', state.match.stage, 'result', JSON.stringify(state.match.result));
  console.log('errors:', errors.length ? errors.join('\n') : 'none');
  await browser.close();
})().catch((e) => { console.error('E2E FAIL', e); process.exit(1); });
