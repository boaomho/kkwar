/* ศึกแก่งกระจาน — ตัวแอปหลัก: ผู้เล่น (#) / จอใหญ่ (#screen) / Admin (#admin) */
(function () {
  const D = window.GameData, Sim = window.Sim;
  const store = window.Store.init();
  const ROOT = 'kkwar';
  const R = (p) => store.ref(ROOT + '/' + p);
  const now = () => store.now();
  const $ = (s, el) => (el || document).querySelector(s);
  const app = $('#app');
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---------- สถานะ ----------
  const st = { game: null, players: {}, teams: {}, bracket: null, match: null, ready: false };
  let me = null; try { me = JSON.parse(localStorage.getItem('kkwar-me') || 'null'); } catch (e) {}
  let isAdmin = false; try { isAdmin = localStorage.getItem('kkwar-admin') === '1'; } catch (e) {}
  const ui = { sel: null, tapCount: 0, tapStage: null, showGuide: false, adminTab: 'control', practice: null, pin: '' };

  function settings() {
    const base = JSON.parse(JSON.stringify(D.DEFAULT_SETTINGS));
    const o = (st.game && st.game.settings) || {};
    for (const k of Object.keys(o)) {
      if (o[k] && typeof o[k] === 'object' && !Array.isArray(o[k]) && base[k] && typeof base[k] === 'object') Object.assign(base[k], o[k]);
      else base[k] = o[k];
    }
    return base;
  }
  function roster(team) { const g = st.game && st.game.roster; return (g && g[team]) || D.ROSTER[team]; }
  function captain(team) { const c = st.game && st.game.captains && st.game.captains[team]; return c || roster(team)[0]; }
  function phase() { return (st.game && st.game.phase) || 'lobby'; }
  function teamPlayers(team) { return Object.values(st.players).filter((p) => p && p.team === team); }
  function playerByName(team, name) { return teamPlayers(team).find((p) => p.name === name); }
  function myPlayer() { return me && st.players[me.pid]; }
  function isCaptain() { const p = myPlayer(); return !!p && captain(p.team) === p.name; }
  function rankOf(team, act) { let r = st.game && st.game.rankings && st.game.rankings[act]; if (!r) return -1; if (!Array.isArray(r)) r = [0, 1, 2, 3].map((i) => r[i] || null); return r.indexOf(team); }
  function teamItems(team) {
    const out = [];
    for (const a of D.ACTIVITY_ORDER) {
      const tier = rankOf(team, a); const itemId = D.ACTIVITIES[a].item;
      const used = !!(st.teams[team] && st.teams[team].itemsUsed && st.teams[team].itemsUsed[itemId]);
      out.push({ id: itemId, tier, used, activity: a, locked: tier < 0 });
    }
    return out;
  }
  function prizeFor(rank) { return settings().prizes[rank] || 0; }

  // ---------- ศึกปัจจุบัน ----------
  const STAGES = ['plan', 'wave1', 'pause1', 'wave2', 'pause2', 'wave3', 'result'];
  const STAGE_NAME = { plan: 'วางแผนตาบอด', wave1: 'ระลอก 1', pause1: 'พักปรับทัพ 1', wave2: 'ระลอก 2', pause2: 'พักปรับทัพ 2', wave3: 'ระลอก 3 — ชี้ขาด', result: 'ผลการรบ' };
  function stageDur(stage) { const S = settings(); return { plan: S.tPlan, wave1: S.tWave1, pause1: S.tPause, wave2: S.tWave2, pause2: S.tPause, wave3: S.tWave3, result: 0 }[stage] || 0; }
  function waveIndexOf(stage) { return { wave1: 0, wave2: 1, wave3: 2 }[stage]; }
  function sideOf(team) { const m = st.match; if (!m) return null; return m.a === team ? 'A' : m.b === team ? 'B' : null; }
  function teamOfSide(side) { const m = st.match; return side === 'A' ? m.a : m.b; }

  let simCache = { key: null, val: null };
  function computeMatch() {
    const m = st.match; if (!m || !m.waveInputs) return { waves: [], units: [] };
    const nW = Object.keys(m.waveInputs).length;
    const key = m.id + ':' + m.seed + ':' + nW + ':' + JSON.stringify(m.waveInputs[nW - 1] && m.waveInputs[nW - 1].ts);
    if (simCache.key === key) return simCache.val;
    const S = settings(); const durs = [S.tWave1, S.tWave2, S.tWave3];
    const ros = {}; let units = []; const waves = [];
    for (let w = 0; w < 3; w++) {
      const inp = m.waveInputs[w]; if (!inp) break;
      for (const side of ['A', 'B']) Object.assign(ros, inp[side].roster || {});
      if (w === 0) units = Sim.createUnits({ A: inp.A, B: inp.B }, ros, S);
      const r = Sim.simulateWave(units, w, inp, ros, S, m.seed, durs[w]);
      waves.push(r); units = r.units;
    }
    simCache = { key, val: { waves, units } };
    return simCache.val;
  }
  function tapTotals(side) {
    const m = st.match; if (!m || !m.taps) return 0; let n = 0;
    for (const stg of Object.keys(m.taps)) { const s = m.taps[stg][side]; if (s) for (const k of Object.keys(s)) n += +s[k] || 0; }
    return n;
  }
  function tapsInStages(side, stages) {
    const m = st.match; if (!m || !m.taps) return 0; let n = 0;
    for (const stg of stages) { const s = m.taps[stg] && m.taps[stg][side]; if (s) for (const k of Object.keys(s)) n += +s[k] || 0; }
    return n;
  }
  function moraleFor(side, stages) {
    const S = settings(); const team = teamOfSide(side);
    const n = Math.max(1, Math.min(8, teamPlayers(team).length));
    return Math.min(1, tapsInStages(side, stages) / (n * S.tapsPerPersonFull));
  }
  const MORALE_STAGES = { wave1: ['plan'], wave2: ['wave1', 'pause1'], wave3: ['wave2', 'pause2'] };
  function currentTapStage() { const m = st.match; if (!m) return null; return m.stage === 'result' ? null : m.stage; }

  // ---------- การเขียน ----------
  async function joinAs(team, name) {
    const pid = D.slug(team + ':' + name);
    me = { pid, name, team };
    try { localStorage.setItem('kkwar-me', JSON.stringify(me)); } catch (e) {}
    const ex = st.players[pid];
    await R('players/' + pid).set({ name, team, cls: (ex && ex.cls) || null, cell: ex && ex.cell != null ? ex.cell : null, ts: now() });
  }
  async function setClass(cls) {
    const p = myPlayer(); if (!p) return;
    if (cls === 'medic') { const n = teamPlayers(p.team).filter((x) => x.cls === 'medic' && x.name !== p.name).length; if (n >= settings().medicMax) return toast('ทีมมีหมอครบ ' + settings().medicMax + ' คนแล้ว'); }
    await R('players/' + me.pid).update({ cls });
  }
  async function moveHero(pid, cell) {
    const p = st.players[pid]; if (!p) return;
    const occupant = teamPlayers(p.team).find((x) => x.cell === cell && x !== p);
    const upd = {}; upd[pid + '/cell'] = cell;
    if (occupant) upd[D.slug(p.team + ':' + occupant.name) + '/cell'] = p.cell == null ? null : p.cell;
    await R('players').update(upd);
  }
  function canMove(pid) {
    const p = st.players[pid]; const mine = myPlayer(); if (!p || !mine || p.team !== mine.team) return false;
    if (st.match && sideOf(p.team) && /^wave/.test(st.match.stage)) return false;
    if (st.match && sideOf(p.team) && st.match.stage !== 'plan' && st.match.stage !== 'result') { const u = computeMatch().units.find((x) => x.id === pid); if (u && u.deployed) return false; }
    return pid === me.pid || isCaptain() || isAdmin;
  }
  let tapTimer = null;
  function tap() {
    const p = myPlayer(); const side = p && sideOf(p.team); const stg = currentTapStage(); if (!side || !stg) return;
    if (ui.tapStage !== stg) { ui.tapStage = stg; ui.tapCount = 0; }
    ui.tapCount++;
    const el = $('#tapcount'); if (el) el.textContent = ui.tapCount;
    if (!tapTimer) tapTimer = setTimeout(() => { tapTimer = null; R('match/taps/' + stg + '/' + side + '/' + me.pid).set(ui.tapCount); }, 350);
    if (navigator.vibrate) try { navigator.vibrate(8); } catch (e) {}
  }

  // ---------- ตัวควบคุมศึก (host) ----------
  function snapshotSide(team) {
    const cells = {}, ros = {};
    for (const p of teamPlayers(team)) { if (p.cell != null && p.cls) { cells[p.cell] = D.slug(team + ':' + p.name); ros[cells[p.cell]] = { name: p.name, cls: p.cls }; } }
    const t = st.teams[team] || {};
    return { team, cells, roster: ros, plan: t.plan || 'front' };
  }
  async function startMatch(id, a, b) {
    const S = settings();
    const seed = 'm' + id + '-' + Math.floor(Math.random() * 1e9).toString(36);
    const upd = {}; upd[a + '/plan'] = 'front'; upd[a + '/item'] = null; upd[b + '/plan'] = 'front'; upd[b + '/item'] = null;
    await R('teams').update(upd);
    await R('match').set({ id, a, b, stage: 'plan', stageStart: now(), stageEnds: now() + S.tPlan * 1000, seed, waveInputs: null, taps: null, result: null });
    await R('game').update({ phase: 'battle' });
  }
  async function advanceStage() {
    const m = st.match; if (!m || m.stage === 'result') return;
    const S = settings(); const idx = STAGES.indexOf(m.stage); let next = STAGES[idx + 1];
    const upd = {};
    if (/^wave/.test(m.stage)) {
      // จบระลอก: ถ้าล้มหมดไปผล
      const cm = computeMatch(); const hs = Sim.hpSummary(cm.units);
      if (hs.A.alive === 0 || hs.B.alive === 0 || m.stage === 'wave3') next = 'result';
    }
    if (/^wave/.test(next)) {
      const w = waveIndexOf(next); const inputs = { ts: now() };
      for (const side of ['A', 'B']) {
        const team = teamOfSide(side); const snap = snapshotSide(team);
        const t = st.teams[team] || {};
        let item = null;
        if (w > 0 && t.item && t.item.id) {
          const its = teamItems(team).find((x) => x.id === t.item.id);
          if (its && !its.used && !its.locked) { item = { id: its.id, tier: its.tier }; upd['__teams/' + team + '/itemsUsed/' + its.id] = true; }
        }
        inputs[side] = { team, cells: snap.cells, roster: snap.roster, plan: snap.plan, item, morale: moraleFor(side, MORALE_STAGES[next]) };
        upd['__teams/' + team + '/item'] = null;
      }
      upd['waveInputs/' + w] = inputs;
    }
    if (next === 'result') {
      const cm = computeMatch(); const res = Sim.decide(cm.units, tapTotals('A'), tapTotals('B'), m.seed);
      upd.result = { winner: res.winner, team: teamOfSide(res.winner), loser: teamOfSide(res.winner === 'A' ? 'B' : 'A'), reason: res.reason, pctA: res.s.A.pct, pctB: res.s.B.pct, aliveA: res.s.A.alive, aliveB: res.s.B.alive };
    }
    upd.stage = next; upd.stageStart = now(); upd.stageEnds = now() + stageDur(next) * 1000;
    const teamUpd = {}; for (const k of Object.keys(upd)) if (k.startsWith('__teams/')) { teamUpd[k.slice(8)] = upd[k]; delete upd[k]; }
    if (Object.keys(teamUpd).length) await R('teams').update(teamUpd);
    await R('match').update(upd);
    if (next === 'result' && st.bracket) {
      const bu = {}; bu['matches/' + m.id + '/winner'] = upd.result.team; bu['matches/' + m.id + '/loser'] = upd.result.loser;
      await R('bracket').update(bu);
    }
  }
  function waveFinished() {
    const m = st.match; if (!m || !/^wave/.test(m.stage)) return false;
    const w = waveIndexOf(m.stage); const cm = computeMatch(); const r = cm.waves[w]; if (!r) return false;
    const el = (now() - m.stageStart) / 1000;
    return el >= Math.min(r.endTick * Sim.TICK + 2.5, r.duration + 0.5);
  }
  let advancing = false;
  async function hostTick() {
    if (!isAdmin || !st.match || st.match.stage === 'result') return;
    const m = st.match;
    const due = /^wave/.test(m.stage) ? waveFinished() : now() >= m.stageEnds + 400;
    if (due && !advancing) { advancing = true; try { await advanceStage(); } catch (e) { console.error(e); } setTimeout(() => { advancing = false; }, 1500); }
  }
  async function drawBracket() {
    const order = [...D.TEAM_ORDER].sort(() => Math.random() - 0.5);
    await R('bracket').set({ order, drawnAt: now(), matches: {
      m1: { a: order[0], b: order[1], label: 'รอบรอง 1' }, m2: { a: order[2], b: order[3], label: 'รอบรอง 2' },
      m3: { a: null, b: null, label: 'ชิงที่ 3' }, m4: { a: null, b: null, label: 'ชิงชนะเลิศ' } } });
    await R('game').update({ phase: 'bracket' });
  }
  function nextMatchId() {
    const b = st.bracket; if (!b) return null; const M = b.matches;
    if (!M.m1.winner) return 'm1'; if (!M.m2.winner) return 'm2'; if (!M.m3.winner) return 'm3'; if (!M.m4.winner) return 'm4'; return null;
  }
  async function startNextMatch() {
    const b = st.bracket; if (!b) return; const M = b.matches; const id = nextMatchId();
    if (!id) { await R('game').update({ phase: 'done' }); await R('match').set(null); return; }
    let a = M[id].a, bb = M[id].b;
    if (id === 'm3') { a = M.m1.loser; bb = M.m2.loser; }
    if (id === 'm4') { a = M.m1.winner; bb = M.m2.winner; }
    const bu = {}; bu['matches/' + id + '/a'] = a; bu['matches/' + id + '/b'] = bb; bu.current = id;
    await R('bracket').update(bu);
    await startMatch(id, a, bb);
  }
  function finalRanking() {
    const b = st.bracket; if (!b || !b.matches.m4.winner) return null; const M = b.matches;
    return [M.m4.winner, M.m4.loser, M.m3.winner, M.m3.loser];
  }

  // ---------- มุมมอง: ร่วมกัน ----------
  function toast(msg) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(() => { t.hidden = true; }, 2500); }
  function teamChip(team) { const t = D.TEAMS[team]; return `<span class="chip team" style="background:${t.color}">${t.emoji} ${t.name}</span>`; }
  function fmtTime(ms) { const s = Math.max(0, Math.ceil(ms / 1000)); return s; }
  function stageBar(big) {
    const m = st.match; if (!m) return '';
    const cls = /^wave/.test(m.stage) ? 'wave' : m.stage === 'result' ? '' : 'pause';
    const t = m.stage === 'result' ? '' : fmtTime(m.stageEnds - now());
    return `<div class="stage ${cls} ${big ? 'big-stage' : ''}"><div class="nm">${STAGE_NAME[m.stage]}</div><div class="tm">${t}</div></div>`;
  }
  function boardHtml(team, opts) {
    opts = opts || {};
    const ps = teamPlayers(team); const byCell = {}; for (const p of ps) if (p.cell != null) byCell[p.cell] = p;
    const cm = (st.match && sideOf(team)) ? computeMatch() : null;
    const unitOf = (p) => cm && cm.units.find((u) => u.id === D.slug(team + ':' + p.name));
    const rows = ['หน้า', 'กลาง', 'หลัง'];
    let h = `<div class="board-head"><div></div><div>เลนบน</div><div>เลนกลาง</div><div>เลนล่าง</div></div><div class="board">`;
    for (let r = 0; r < 3; r++) {
      h += `<div class="rowlab"><b>${rows[r]}</b><span>ระลอก ${r + 1}</span></div>`;
      for (let l = 0; l < 3; l++) {
        const c = r * 3 + l; const p = byCell[c];
        if (!p) { h += `<div class="cell ${ui.sel && opts.interactive ? 'target' : ''}" data-act="cell" data-team="${team}" data-cell="${c}"></div>`; continue; }
        const pid = D.slug(team + ':' + p.name); const u = unitOf(p);
        const mine = me && pid === me.pid; const dead = u && !u.alive; const dep = u && u.deployed && u.alive;
        const hp = u ? `<div class="hpbar"><i style="width:${Math.round(100 * u.hp / u.maxHp)}%"></i></div>` : '';
        h += `<div class="cell filled ${mine ? 'mine' : ''} ${dead ? 'dead' : ''} ${dep ? 'deployed' : ''} ${ui.sel === pid ? 'dragging' : ''}" data-act="cell" data-team="${team}" data-cell="${c}" data-pid="${pid}">
          <div class="em">${p.cls ? D.CLASSES[p.cls].emoji : '❔'}</div><div class="nm">${esc(p.name)}</div>${hp}</div>`;
      }
    }
    h += `</div>`;
    const bench = ps.filter((p) => p.cell == null);
    if (bench.length || opts.interactive) {
      h += `<div class="hint">ยังไม่ลงสนาม (${bench.length})</div><div class="bench">` + bench.map((p) => { const pid = D.slug(team + ':' + p.name); return `<div class="cell filled ${me && pid === me.pid ? 'mine' : ''} ${ui.sel === pid ? 'dragging' : ''}" data-act="bench" data-team="${team}" data-pid="${pid}"><div class="em">${p.cls ? D.CLASSES[p.cls].emoji : '❔'}</div><div class="nm">${esc(p.name)}</div></div>`; }).join('') + `</div>`;
    }
    return h;
  }
  function itemsHtml(team, interactive) {
    const sel = st.teams[team] && st.teams[team].item && st.teams[team].item.id;
    return `<div class="item-grid">` + teamItems(team).map((it) => {
      const I = D.ITEMS[it.id]; const tierTxt = it.locked ? 'รอผลกิจกรรม' : `ระดับ${D.TIER_NAMES[it.tier]} · ${I.tiers[it.tier]}${I.unit}`;
      const cls = `item-card tier-${it.tier} ${it.used ? 'used' : ''} ${it.locked ? 'locked' : ''} ${sel === it.id ? 'sel' : ''}`;
      const act = interactive && !it.used && !it.locked ? `data-act="item" data-item="${it.id}"` : '';
      return `<div class="${cls}" ${act}><div class="em">${I.emoji}</div><div><div class="nm">${I.name} ${it.used ? '(ใช้แล้ว)' : ''}</div><div class="tier">${tierTxt}</div><div class="ds">${I.desc} — จาก${D.ACTIVITIES[it.activity].name}</div></div></div>`;
    }).join('') + `</div>`;
  }
  function plansHtml(team, interactive) {
    const sel = (st.teams[team] && st.teams[team].plan) || 'front';
    return `<div class="plan-grid">` + Object.values(D.PLANS).map((p) => `<button class="plan-btn ${sel === p.id ? 'sel' : ''}" ${interactive ? `data-act="plan" data-plan="${p.id}"` : 'disabled'}><span>${p.emoji}</span><b>${p.name}</b></button>`).join('') + `</div><div class="hint">${D.PLANS[sel].desc}</div>`;
  }
  function guideHtml() {
    const S = settings();
    return `<div class="panel guide"><h2>📖 คู่มือศึกแก่งกระจาน</h2>
      <h3>เกมคืออะไร</h3><div>ทีมละ 8 ฮีโร่ (คุณเองนั่นแหละ) เลือกอาชีพ วางตำแหน่ง แล้วให้สนามจำลองสู้กันเอง 3 ระลอก ใครเหลือเลือดรวมมากกว่าชนะ แข่งแบบจับฉลาก รอบรอง → ชิงที่ 3 → ชิงชนะเลิศ รางวัล ${S.prizes.map((p) => p.toLocaleString()).join(' / ')} บาท</div>
      <h3>อาชีพแพ้ทางเป็นวงกลม</h3><div class="counter-table"><div>🐎 ม้า<br><b>ชนะ</b> ธนู 🏹</div><div>🔱 หอก<br><b>ชนะ</b> ม้า 🐎</div><div>🏹 ธนู<br><b>ชนะ</b> หอก 🔱</div></div>
      <div class="small muted">ตีคู่ที่ชนะทาง ×${S.counterWin} / ตีคู่ที่แพ้ทาง ×${S.counterLose} · ⚕️ หมอไม่โจมตี ฮีลเพื่อนใกล้ๆ ทุก ${S.healEvery} วิ (ทีมละไม่เกิน ${S.medicMax}) · ม้าที่วิ่งมาไกลพุ่งชนครั้งแรกแรง ×${S.cavCharge}</div>
      <h3>แถวที่วาง = จังหวะที่ออก</h3><ol><li><b>แถวหน้า</b> ออกวินาทีที่ 0 (ระลอก 1)</li><li><b>แถวกลาง</b> ออกระลอก 2</li><li><b>แถวหลัง</b> ไพ่ตาย ออกระลอก 3 ดาเมจทุกคน ×${S.waveMult[2]}</li></ol>
      <div class="small">มี 9 ช่อง 8 คน เลนบน/กลาง/ล่าง มีผล: หอกตีคนที่ใกล้ในเลนตัวเองก่อน ม้าพุ่งข้ามไปหาแถวหลัง ธนูยิงจากไกล</div>
      <h3>ช่วงพักปรับทัพ (${S.tPause} วิ) ทำได้ 4 อย่าง</h3><ol><li>ย้ายฮีโร่ที่ <b>ยังไม่ออก</b> ไปช่องไหนก็ได้</li><li>กัปตันเลือก <b>แผนเข้าตี</b>: ปะทะหน้า / เข้าด้านข้าง / โอบหลัง</li><li>กัปตันเลือก <b>ไอเทม</b> 1 ชิ้น (มี 4 ใช้ได้แค่ 2 ครั้ง)</li><li><b>ทุกคนรัวกด</b> เติมขวัญกำลังใจ → ระลอกถัดไปตีแรงขึ้นสูงสุด +${Math.round(S.moraleMax * 100)}%</li></ol>
      <h3>ไอเทมจากกิจกรรม outing</h3><div class="small">ทุกทีมได้ครบ 4 ชิ้น แต่ <b>ระดับต่างกันตามอันดับ</b>: ที่ 1 = เทพ, ที่ 2 = แกร่ง, ที่ 3 = ธรรมดา, ที่ 4 = ขำๆ</div>
      ${Object.values(D.ITEMS).map((I) => `<div class="small">${I.emoji} <b>${I.name}</b> — ${I.desc}: ${I.tiers.map((v, i) => D.TIER_NAMES[i] + ' ' + v + I.unit).join(' / ')}</div>`).join('')}
      <h3>ตัดสินผล</h3><div class="small">ฝ่ายไหนล้มหมดก่อนแพ้ทันที → ครบ 3 ระลอกวัด % เลือดรวม → เท่ากันวัดยอดรัวกด · ดาเมจมีสุ่ม ±15% และคริติคอล 10% ×2 เพื่อให้ลุ้น แต่การวางแผนคือตัวตัดสินหลัก</div>
      <button class="ghost" data-act="guide-close">ปิดคู่มือ</button></div>`;
  }

  // ---------- มุมมองผู้เล่น ----------
  function viewPlayer() {
    if (ui.showGuide) return `<div class="wrap">${guideHtml()}</div>`;
    const p = myPlayer();
    if (!me || !p) return viewJoin();
    const team = p.team; const T = D.TEAMS[team];
    let h = `<div class="wrap"><div class="topbar"><div class="brand">ศึกแก่งกระจาน<small>${esc(p.name)} · ${isCaptain() ? '👑 กัปตัน' : 'ฮีโร่'}</small></div>${teamChip(team)}</div>`;
    const inMatch = st.match && sideOf(team) && phase() === 'battle';
    if (!p.cls) h += viewPickClass(p);
    else if (inMatch) h += viewBattlePlayer(p);
    else if (phase() === 'battle' && st.match) h += viewSpectate();
    else if (phase() === 'done') h += viewPodium();
    else h += viewLobbyPlayer(p);
    h += `<div class="row"><button class="ghost" data-act="guide">📖 คู่มือ</button><button class="ghost" data-act="change-class">เปลี่ยนอาชีพ</button><button class="ghost" data-act="leave">ออก/เปลี่ยนชื่อ</button></div></div>`;
    return h;
  }
  function viewJoin() {
    let h = `<div class="wrap"><div class="center"><div class="hero-title">ศึกแก่งกระจาน</div><div class="sub">Outing BSG 2569 · เลือกทีมของคุณ</div></div>`;
    if (!ui.joinTeam) {
      h += `<div class="team-grid">` + D.TEAM_ORDER.map((t) => `<button class="team-btn team-${t}" data-act="join-team" data-team="${t}">${D.TEAMS[t].emoji} ${D.TEAMS[t].name}<small>${teamPlayers(t).length}/${roster(t).length} เข้าแล้ว</small></button>`).join('') + `</div>`;
    } else {
      const t = ui.joinTeam;
      h += `<div class="panel"><div class="row"><h2 class="grow">${D.TEAMS[t].emoji} ${D.TEAMS[t].name} — คุณคือใคร?</h2><button class="ghost" data-act="join-back">กลับ</button></div><div class="name-grid">` +
        roster(t).map((n) => { const taken = !!playerByName(t, n); return `<button class="name-btn ${taken ? 'taken' : ''}" data-act="join-name" data-team="${t}" data-name="${esc(n)}">${esc(n)}${taken ? ' ✓' : ''}</button>`; }).join('') +
        `</div><div class="hint">ถ้าชื่อมีเครื่องหมาย ✓ แปลว่ามีคนเลือกไปแล้ว ถ้าเป็นคุณเองก็กดได้เลย</div></div>`;
    }
    return h + `<button class="ghost" data-act="guide">📖 อ่านคู่มือก่อน</button></div>`;
  }
  function viewPickClass(p) {
    const S = settings(); const medics = teamPlayers(p.team).filter((x) => x.cls === 'medic' && x.name !== p.name).length;
    return `<div class="panel"><h2>เลือกอาชีพของคุณ</h2><div class="class-grid">` + D.CLASS_ORDER.map((c) => { const C = D.CLASSES[c]; const full = c === 'medic' && medics >= S.medicMax;
      return `<button class="class-card ${p.cls === c ? 'sel' : ''} ${full ? 'full' : ''}" data-act="class" data-cls="${c}"><div class="em">${C.emoji}</div><div class="nm">${C.name}</div><div class="ds">${C.desc}</div><div class="ct">${C.beats ? `ชนะ ${D.CLASSES[C.beats].name} · แพ้ ${D.CLASSES[C.weak].name}` : `เลือด ${S.hp.medic} ฮีล ${S.healAmt}/${S.healEvery}วิ`}</div><div class="ds">เลือด ${S.hp[c]} · พลัง ${S.atk[c]}</div></button>`; }).join('') + `</div></div>`;
  }
  function viewLobbyPlayer(p) {
    const team = p.team;
    let h = `<div class="panel"><div class="row"><h2 class="grow">จัดทัพ ${D.TEAMS[team].name}</h2><span class="badge">${teamPlayers(team).filter((x) => x.cell != null).length}/8 ลงสนาม</span></div>
      <div class="hint">${ui.sel ? '👉 แตะช่องว่างที่จะวาง (แตะช่องที่มีคนเพื่อสลับ)' : 'แตะตัวเอง' + (isCaptain() ? ' หรือเพื่อนร่วมทีม (กัปตันย้ายได้ทุกคน)' : '') + ' แล้วแตะช่องที่จะวาง · แถวหน้าออกก่อน แถวหลังออกทีหลัง'}</div>
      ${boardHtml(team, { interactive: true })}</div>`;
    h += `<div class="panel"><h2>แผนเข้าตีระลอกแรก ${isCaptain() ? '' : '<span class="small muted">(กัปตันเลือก)</span>'}</h2>${plansHtml(team, isCaptain())}</div>`;
    h += `<div class="panel"><h2>ไอเทมของทีม</h2><div class="hint">ได้จากอันดับกิจกรรม outing ใช้ได้ในช่วงพักปรับทัพ</div>${itemsHtml(team, false)}</div>`;
    h += `<div class="panel"><h2>สมาชิก</h2><div class="roster-list">` + roster(team).map((n) => { const q = playerByName(team, n); return `<div class="u"><span>${q && q.cls ? D.CLASSES[q.cls].emoji : (q ? '❔' : '⬜')}</span><span>${esc(n)} ${captain(team) === n ? '👑' : ''}</span><span class="small muted">${q ? (q.cell != null ? 'ลงสนาม' : 'ยังไม่วาง') : 'ยังไม่เข้า'}</span></div>`; }).join('') + `</div></div>`;
    h += practiceHtml(team);
    if (st.bracket) h += viewBracket();
    return h;
  }
  const PRESETS = {
    balanced: { name: 'สมดุล 3-3-2', comp: ['spear', 'spear', 'spear', 'cav', 'cav', 'cav', 'archer', 'archer'] },
    cav8: { name: 'ม้า 8 บุกตะลุย', comp: ['cav', 'cav', 'cav', 'cav', 'cav', 'cav', 'cav', 'cav'] },
    spear8: { name: 'หอก 8 กำแพงเหล็ก', comp: ['spear', 'spear', 'spear', 'spear', 'spear', 'spear', 'spear', 'spear'] },
    archer8: { name: 'ธนู 8 ฝนลูกศร', comp: ['archer', 'archer', 'archer', 'archer', 'archer', 'archer', 'archer', 'archer'] },
    medic: { name: 'หอกหน้า ธนูหลัง หมอ 2', comp: ['spear', 'spear', 'spear', 'archer', 'archer', 'medic', 'archer', 'medic'] },
  };
  function practiceHtml(team) {
    const pr = ui.practice || {};
    let h = `<div class="panel"><h2>🧪 ซ้อมรบกับหุ่น</h2><div class="hint">ใช้ทัพที่วางอยู่ตอนนี้ สู้กับหุ่นจำลอง เล่นกี่รอบก็ได้ ไม่มีผลกับศึกจริง</div>
      <div class="row"><select id="pr-enemy" class="grow">${Object.keys(PRESETS).map((k) => `<option value="${k}" ${pr.enemy === k ? 'selected' : ''}>หุ่น: ${PRESETS[k].name}</option>`).join('')}</select>
      <select id="pr-plan">${Object.values(D.PLANS).map((p) => `<option value="${p.id}" ${pr.plan === p.id ? 'selected' : ''}>${p.emoji} ${p.name}</option>`).join('')}</select></div>
      <div class="row"><button class="primary" data-act="practice-start">▶ เริ่มซ้อม (เร็ว 1.5 เท่า)</button>${pr.run ? '<button class="ghost" data-act="practice-stop">หยุด</button>' : ''}</div>`;
    if (pr.run) {
      const r = pr.run;
      h += `<div class="stage wave"><div class="nm">${r.done ? 'จบการซ้อม' : 'ระลอก ' + (r.waveIdx + 1)}</div><div class="tm">${r.done ? (r.result.winner === 'A' ? '🏆 ชนะ' : '💀 แพ้') : ''}</div></div>
        <div class="arena"><canvas id="practice-arena"></canvas></div><div class="commentary" id="practice-commentary"></div>`;
      if (r.done) h += `<div class="small">${r.result.winner === 'A' ? 'ทัพนี้ชนะหุ่น' : 'ทัพนี้แพ้หุ่น'} · เลือดเหลือ ${Math.round(r.result.s.A.pct * 100)}% vs ${Math.round(r.result.s.B.pct * 100)}% · ${r.result.reason === 'wipe' ? 'ล้างบาง' : 'วัดเลือดรวม'}</div>` + statsHtml({ waves: r.waves, units: r.units });
    }
    return h + `</div>`;
  }
  let pRenderer = null;
  function practiceStart() {
    const p = myPlayer(); if (!p) return;
    const enemy = $('#pr-enemy', app).value, plan = $('#pr-plan', app).value;
    const S = settings(); const team = p.team;
    const A = snapshotSide(team); if (Object.keys(A.cells).length < 1) return toast('วางทัพก่อนอย่างน้อย 1 คน');
    const eteam = D.TEAM_ORDER.find((t) => t !== team);
    const cells = {}, ros = {}; PRESETS[enemy].comp.forEach((cls, i) => { const id = 'bot' + i; cells[i] = id; ros[id] = { name: 'หุ่น ' + (i + 1), cls }; });
    const roster = { ...A.roster, ...ros };
    const seed = 'practice-' + Date.now();
    const r = Sim.simulateMatch({ A: { team, cells: A.cells, plans: [plan, plan, plan], items: [null, null, null], morale: 0.5 }, B: { team: eteam, cells, plans: ['front', 'front', 'front'], items: [null, null, null], morale: 0.5 } }, roster, S, seed);
    ui.practice = { enemy, plan, run: { waves: r.waves, units: r.units, result: r.result, waveIdx: 0, startedAt: Date.now(), done: false, teams: { A: team, B: eteam } } };
    render(); practiceTick();
  }
  function practiceTick() {
    const pr = ui.practice && ui.practice.run; if (!pr || pr.done) return;
    const c = $('#practice-arena', app); if (!c) return;
    if (!pRenderer || pRenderer.canvas !== c) { if (pRenderer) pRenderer.stop(); pRenderer = new BattleRenderer(c, { teams: pr.teams, commentaryEl: $('#practice-commentary', app), now: () => Date.now() }); pr.playing = -1; }
    const SPEED = 1.5;
    const w = pr.waves[pr.waveIdx];
    if (pr.playing !== pr.waveIdx) { pr.playing = pr.waveIdx; pr.waveStart = Date.now(); pRenderer.playWave(w, pr.waveStart, SPEED); }
    const el = (Date.now() - pr.waveStart) / 1000 * SPEED;
    const len = Math.min(w.duration, w.endTick * Sim.TICK + 1.5);
    if (el >= len) {
      if (pr.waveIdx < pr.waves.length - 1) { pr.waveIdx++; render(); }
      else { pr.done = true; pRenderer.setStatic(pr.units); render(); return; }
    }
    setTimeout(practiceTick, 300);
  }
  function viewBattlePlayer(p) {
    const m = st.match; const team = p.team; const side = sideOf(team); const enemy = side === 'A' ? m.b : m.a;
    let h = `<div class="row"><div class="grow"><b>${D.TEAMS[team].name}</b> <span class="vs">VS</span> <b>${D.TEAMS[enemy].name}</b> · ${st.bracket && st.bracket.matches[m.id] ? st.bracket.matches[m.id].label : ''}</div></div>` + stageBar();
    const wave = /^wave/.test(m.stage);
    if (m.stage === 'result') return h + viewResult() + (st.bracket ? viewBracket() : '');
    if (wave) {
      h += `<div class="arena"><canvas id="arena"></canvas><div class="overlay" id="arena-overlay"></div></div><div class="commentary" id="commentary"></div>` + hpSummaryHtml();
      h += `<div class="panel"><div class="hint">ระหว่างรบรัวกดได้เลย สะสมขวัญกำลังใจไว้ระลอกถัดไป</div>` + tapHtml(side) + `</div>`;
      return h;
    }
    // plan / pause
    const S = settings(); const w = m.stage === 'plan' ? 0 : m.stage === 'pause1' ? 1 : 2;
    const cm = computeMatch();
    if (m.stage !== 'plan') h += hpSummaryHtml();
    h += `<div class="panel"><div class="row"><h2 class="grow">${m.stage === 'plan' ? 'วางทัพ 8 คน' : 'ปรับทัพก่อนระลอก ' + (w + 1)}</h2><span class="badge">${teamPlayers(team).filter((x) => x.cell != null).length}/8</span></div>
      <div class="hint">${ui.sel ? '👉 แตะช่องที่จะวาง' : (m.stage === 'plan' ? 'คู่แข่งยังไม่เห็นทัพคุณ วางแล้วเลือกแผน' : 'ย้ายได้เฉพาะคนที่ยังไม่ออก (⚔️ = ออกสนามแล้ว)')}</div>${boardHtml(team, { interactive: true })}</div>`;
    if (m.stage !== 'plan') {
      h += `<div class="panel"><h3>ทัพศัตรู (${D.TEAMS[enemy].name}) ตอนนี้</h3>${boardHtml(enemy, {})}</div>`;
    }
    h += `<div class="panel"><h2>แผนเข้าตีระลอก ${w + 1} ${isCaptain() ? '' : '<span class="small muted">(กัปตันเลือก)</span>'}</h2>${plansHtml(team, isCaptain())}</div>`;
    if (m.stage !== 'plan') h += `<div class="panel"><h2>ใช้ไอเทมระลอกนี้ ${isCaptain() ? '' : '<span class="small muted">(กัปตันเลือก)</span>'}</h2><div class="hint">เลือกได้ 1 ชิ้น แตะซ้ำเพื่อยกเลิก เหลือโอกาสใช้ ${2 - teamItems(team).filter((x) => x.used).length} ครั้ง</div>${itemsHtml(team, isCaptain())}</div>`;
    h += `<div class="panel sticky-bottom"><h2>🔥 รัวกดเติมขวัญกำลังใจ</h2>` + tapHtml(side) + `</div>`;
    return h;
  }
  function tapHtml(side) {
    const stg = currentTapStage(); const stages = Object.keys(MORALE_STAGES).find((k) => MORALE_STAGES[k].includes(stg));
    const morale = stages ? moraleFor(side, MORALE_STAGES[stages]) : 0;
    const mine = ui.tapStage === stg ? ui.tapCount : 0;
    return `<button class="tap-btn" data-act="tap">⚔️ กด! <span id="tapcount">${mine}</span></button><div class="row"><div class="grow meter ${morale >= 1 ? 'good' : ''}"><i style="width:${Math.round(morale * 100)}%"></i></div><b>${Math.round(morale * 100)}%</b></div><div class="hint">ขวัญทีม ${Math.round(morale * 100)}% → ระลอกถัดไปตีแรงขึ้น +${Math.round(settings().moraleMax * morale * 100)}%</div>`;
  }
  function hpSummaryHtml() {
    const m = st.match; const cm = computeMatch(); if (!cm.units.length) return '';
    const live = liveUnits(); const s = Sim.hpSummary(live);
    const A = D.TEAMS[m.a], B = D.TEAMS[m.b];
    return `<div class="hpsum"><div class="l"><div>${A.name} ${s.A.alive}/${s.A.total}</div><div class="bar"><i style="width:${Math.round(s.A.pct * 100)}%;background:${A.color};margin-left:auto"></i></div></div><div class="vs">${Math.round(s.A.pct * 100)}% · ${Math.round(s.B.pct * 100)}%</div><div class="r"><div>${B.name} ${s.B.alive}/${s.B.total}</div><div class="bar"><i style="width:${Math.round(s.B.pct * 100)}%;background:${B.color}"></i></div></div></div>`;
  }
  // หน่วยตามเวลาจริง (ระหว่างระลอกใช้เฟรมปัจจุบัน)
  function liveUnits() {
    const m = st.match; const cm = computeMatch(); if (!m) return cm.units;
    if (/^wave/.test(m.stage) && renderer && renderer.mode === 'play' && renderer.pos) {
      return cm.units.map((u) => { const p = renderer.pos[u.id]; return p ? { ...u, hp: p.hp, alive: p.alive } : u; });
    }
    return cm.units;
  }
  function viewSpectate() {
    const m = st.match;
    let h = `<div class="panel"><h2>${D.TEAMS[m.a].name} <span class="vs">VS</span> ${D.TEAMS[m.b].name}</h2><div class="hint">ทีมคุณไม่ได้ลงศึกนี้ เชียร์ไปก่อน รอคิวของคุณ</div>` + stageBar() + `</div>`;
    if (/^wave/.test(m.stage)) h += `<div class="arena"><canvas id="arena"></canvas><div class="overlay" id="arena-overlay"></div></div><div class="commentary" id="commentary"></div>` + hpSummaryHtml();
    else if (m.stage === 'result') h += viewResult();
    else h += `<div class="panel"><h3>${D.TEAMS[m.a].name}</h3>${boardHtml(m.a, {})}</div><div class="panel"><h3>${D.TEAMS[m.b].name}</h3>${boardHtml(m.b, {})}</div>`;
    return h + (st.bracket ? viewBracket() : '');
  }
  function viewResult() {
    const m = st.match; const r = m.result; if (!r) return '';
    const W = D.TEAMS[r.team], L = D.TEAMS[r.loser];
    const reason = { wipe: 'ล้างบางทั้งทัพ!', hp: 'เลือดรวมเหลือมากกว่า', taps: 'เลือดเท่ากัน ชนะด้วยยอดรัวกด', coin: 'สูสีจนต้องเสี่ยงดวง' }[r.reason];
    const cm = computeMatch();
    let h = `<div class="panel center"><div class="sub">ผู้ชนะ</div><div class="hero-title" style="font-size:40px">${W.emoji} ${W.name}</div><div>${reason} · ${Math.round(r.pctA * 100)}% vs ${Math.round(r.pctB * 100)}%</div>${hpSummaryHtml()}</div>`;
    h += `<div class="panel"><h3>สถิติ</h3>` + statsHtml(cm) + `</div>`;
    if (isAdmin) h += `<div class="panel"><button class="primary" data-act="next-match">ไปศึกถัดไป ➜</button></div>`;
    return h;
  }
  function statsHtml(cm) {
    const dmg = {}, kills = {}, heals = {};
    for (const w of cm.waves) for (const e of w.events) { if (e.type === 'hit') dmg[e.from] = (dmg[e.from] || 0) + e.dmg; if (e.type === 'die') kills[e.by] = (kills[e.by] || 0) + 1; if (e.type === 'heal' && e.from) heals[e.from] = (heals[e.from] || 0) + e.amt; }
    const rows = cm.units.map((u) => ({ u, d: dmg[u.id] || 0, k: kills[u.id] || 0, h: heals[u.id] || 0 })).sort((a, b) => (b.d + b.h) - (a.d + a.h)).slice(0, 8);
    return `<div class="roster-list">` + rows.map((r) => `<div class="u ${r.u.alive ? '' : 'dead'}"><span>${D.CLASSES[r.u.cls].emoji}</span><span style="color:${D.TEAMS[r.u.team].color}">${esc(r.u.name)}</span><span class="small">${r.u.cls === 'medic' ? 'ฮีล ' + r.h : 'ดาเมจ ' + r.d + (r.k ? ' · ล้ม ' + r.k : '')}</span></div>`).join('') + `</div>`;
  }
  function viewBracket() {
    const b = st.bracket; if (!b) return ''; const M = b.matches; const cur = st.match && st.match.id;
    const card = (id) => { const x = M[id]; const nm = (t) => t ? `<div class="t ${x.winner === t ? 'win' : ''}" style="color:${D.TEAMS[t].color}">${D.TEAMS[t].emoji} ${D.TEAMS[t].name}${x.winner === t ? ' 🏆' : ''}</div>` : `<div class="t muted">รอผล</div>`;
      return `<div class="match-card ${cur === id ? 'current' : ''}"><div class="lab">${x.label}</div>${nm(x.a)}${nm(x.b)}</div>`; };
    return `<div class="panel"><h2>สายการแข่งขัน</h2><div class="bracket">${card('m1')}${card('m2')}${card('m3')}${card('m4')}</div></div>`;
  }
  function viewPodium() {
    const fr = finalRanking(); if (!fr) return viewBracket();
    const S = settings();
    return `<div class="panel center"><div class="sub">ผลการแข่งขันสุดท้าย</div><div class="hero-title">🏆 ${D.TEAMS[fr[0]].name}</div><div class="podium">` + [1, 0, 2, 3].map((i) => `<div class="p" style="background:${D.TEAMS[fr[i]].color};height:${[150, 190, 120, 100][i]}px"><div class="rk">${i + 1}</div><div>${D.TEAMS[fr[i]].name}</div><div class="pz">${S.prizes[i].toLocaleString()} ฿</div></div>`).join('') + `</div></div>` + viewBracket();
  }

  // ---------- จอใหญ่ ----------
  function viewScreen() {
    const m = st.match; const ph = phase();
    let h = `<div class="wrap wide"><div class="topbar"><div class="brand">⚔️ ศึกแก่งกระจาน<small>Outing BSG · เก่งกระจาน 2569</small></div><div class="row">${!isAdmin ? '<button class="ghost small" data-act="admin-login">host</button>' : '<span class="chip">🟢 host</span>'}</div></div>`;
    if (ph === 'lobby' || !m) {
      h += `<div class="row" style="align-items:flex-start"><div class="panel grow" style="min-width:260px"><h2>เข้าร่วมเกม</h2><div class="row"><div id="qr"></div><div><div class="display" style="font-size:22px">${esc(location.origin + location.pathname)}</div><div class="hint">สแกน QR หรือเปิดลิงก์ เลือกทีม → ชื่อ → อาชีพ → วางตำแหน่ง</div></div></div></div>` + (ph === 'done' ? `<div class="grow">${viewPodium()}</div>` : '') + `</div>`;
      h += `<div class="admin-grid">` + D.TEAM_ORDER.map((t) => `<div class="panel"><div class="row"><h2 class="grow" style="color:${D.TEAMS[t].color}">${D.TEAMS[t].emoji} ${D.TEAMS[t].name}</h2><span class="small muted">${teamPlayers(t).length}/${roster(t).length} · ลงสนาม ${teamPlayers(t).filter((x) => x.cell != null).length}/8</span></div>${boardHtml(t, {})}<div class="row small">` + teamItems(t).map((it) => `<span class="chip">${D.ITEMS[it.id].emoji} ${it.locked ? '?' : D.TIER_NAMES[it.tier]}</span>`).join('') + `</div></div>`).join('') + `</div>`;
      if (st.bracket) h += viewBracket();
      return h + `</div>`;
    }
    const A = D.TEAMS[m.a], B = D.TEAMS[m.b];
    const wave = /^wave/.test(m.stage);
    h += `<div class="screen-layout"><div class="side-panel">${sidePanel('A')}</div><div class="side-panel">`;
    h += `<div class="row"><div class="grow center display" style="font-size:26px"><span style="color:${A.color}">${A.name}</span> <span class="vs">VS</span> <span style="color:${B.color}">${B.name}</span> <span class="small muted">· ${st.bracket && st.bracket.matches[m.id] ? st.bracket.matches[m.id].label : ''}</span></div></div>` + stageBar(true);
    if (wave || m.stage === 'result') h += `<div class="arena"><canvas id="arena"></canvas><div class="overlay" id="arena-overlay"></div></div><div class="commentary" id="commentary"></div>` + hpSummaryHtml();
    else {
      h += `<div class="arena"><canvas id="arena"></canvas><div class="overlay"><div class="banner">${m.stage === 'plan' ? '🤫 ทั้งสองทีมกำลังวางทัพลับ' : '⏸ พักปรับทัพ · ใช้ไอเทม · รัวกด!'}</div></div></div>`;
      if (m.stage !== 'plan') h += hpSummaryHtml();
    }
    if (m.stage === 'result') h += viewResult();
    if (isAdmin && m.stage !== 'result') h += `<div class="row"><button class="ghost" data-act="advance">ข้ามไปช่วงถัดไป ⏭</button></div>`;
    h += `</div><div class="side-panel">${sidePanel('B')}</div></div>`;
    if (st.bracket) h += viewBracket();
    return h + `</div>`;
  }
  function sidePanel(side) {
    const m = st.match; const team = teamOfSide(side); const T = D.TEAMS[team];
    const cm = computeMatch(); const live = liveUnits();
    const stg = currentTapStage(); const mk = Object.keys(MORALE_STAGES).find((k) => MORALE_STAGES[k].includes(stg));
    const morale = mk ? moraleFor(side, MORALE_STAGES[mk]) : 0;
    const wi = waveIndexOf(m.stage); const inp = wi != null && m.waveInputs && m.waveInputs[wi] && m.waveInputs[wi][side];
    let h = `<div class="panel"><div class="tname" style="color:${T.color}">${T.emoji} ${T.name}</div>`;
    if (inp) h += `<div class="row small"><span class="chip">${D.PLANS[inp.plan].emoji} ${D.PLANS[inp.plan].name}</span>${inp.item ? `<span class="chip">${D.ITEMS[inp.item.id].emoji} ${D.ITEMS[inp.item.id].name} (${D.TIER_NAMES[inp.item.tier]})</span>` : ''}<span class="chip">🔥 ${Math.round(inp.morale * 100)}%</span></div>`;
    else if (m.stage !== 'result') h += `<div class="small muted">กำลังวางแผน… (ลับ)</div><div class="row"><div class="grow meter ${morale >= 1 ? 'good' : ''}"><i style="width:${Math.round(morale * 100)}%"></i></div><b>${Math.round(morale * 100)}%</b></div>`;
    const ps = teamPlayers(team).filter((p) => p.cell != null).sort((a, b) => a.cell - b.cell);
    h += `<div class="roster-list">` + ps.map((p) => { const pid = D.slug(team + ':' + p.name); const u = live.find((x) => x.id === pid); const pct = u ? u.hp / u.maxHp : 1;
      return `<div class="u ${u && !u.alive ? 'dead' : ''}"><span>${p.cls ? D.CLASSES[p.cls].emoji : '❔'}</span><span>${esc(p.name)} ${u && !u.deployed && u.alive ? '<span class="small muted">(รอ)</span>' : ''}</span><div class="b"><i style="width:${Math.round(pct * 100)}%;background:${pct > .5 ? '#3ddc84' : pct > .25 ? '#f5c518' : '#ff4d5e'}"></i></div></div>`; }).join('') + `</div>`;
    h += `<div class="row small">` + teamItems(team).map((it) => `<span class="chip ${it.used ? 'muted' : ''}">${D.ITEMS[it.id].emoji} ${it.locked ? '?' : D.TIER_NAMES[it.tier]}${it.used ? ' ✓' : ''}</span>`).join('') + `</div></div>`;
    return h;
  }

  // ---------- Admin ----------
  function viewAdmin() {
    if (!isAdmin) return `<div class="wrap"><div class="panel"><h2>🔒 Admin</h2><input id="pin" type="password" inputmode="numeric" placeholder="PIN 4 หลัก" value="${esc(ui.pin)}"><button class="primary" data-act="pin">เข้า</button></div></div>`;
    const ph = phase(); const m = st.match; const S = settings();
    let h = `<div class="wrap"><div class="topbar"><div class="brand">🛠 Admin<small>เฟส: ${ph} ${m ? '· ศึก ' + m.id + ' / ' + m.stage : ''}</small></div><div class="row"><button class="ghost small" data-act="atab" data-tab="control">ควบคุม</button><button class="ghost small" data-act="atab" data-tab="rank">อันดับ</button><button class="ghost small" data-act="atab" data-tab="roster">รายชื่อ</button><button class="ghost small" data-act="atab" data-tab="balance">สมดุล</button></div></div>`;
    if (ui.adminTab === 'control') {
      h += `<div class="panel"><h2>ลำดับการใช้งาน</h2><ol class="small"><li>บนรถ: ทุกคนเข้าเกม เลือกอาชีพ วางตำแหน่ง</li><li>หลังจบแต่ละกิจกรรม: กรอกอันดับในแท็บ "อันดับ"</li><li>ก่อนศึก: กด "จับฉลาก" → เปิด #screen บนจอใหญ่</li><li>กด "เริ่มศึกถัดไป" ทีละศึก ระบบเดินช่วงเองตามเวลา</li></ol></div>`;
      h += `<div class="panel"><h2>ควบคุมศึก</h2>${m ? stageBar() : ''}<div class="row">
        <button class="gold" data-act="draw" ${st.bracket ? '' : ''}>🎲 จับฉลากสาย${st.bracket ? ' (ใหม่)' : ''}</button>
        <button class="primary" data-act="next-match" ${st.bracket ? '' : 'disabled'}>▶ เริ่มศึกถัดไป ${st.bracket ? '(' + (nextMatchId() || 'จบแล้ว') + ')' : ''}</button>
        <button data-act="advance" ${m && m.stage !== 'result' ? '' : 'disabled'}>⏭ ข้ามช่วง</button>
        <button class="ghost" data-act="extend" ${m && m.stage !== 'result' ? '' : 'disabled'}>+15 วิ</button>
        <button class="danger" data-act="restart-match" ${m ? '' : 'disabled'}>↺ เริ่มศึกนี้ใหม่</button>
      </div>${st.bracket ? viewBracket() : ''}</div>`;
      h += `<div class="panel"><h2>สถานะทีม</h2>` + D.TEAM_ORDER.map((t) => `<div class="small"><b style="color:${D.TEAMS[t].color}">${D.TEAMS[t].name}</b> เข้า ${teamPlayers(t).length} · มีอาชีพ ${teamPlayers(t).filter((x) => x.cls).length} · ลงสนาม ${teamPlayers(t).filter((x) => x.cell != null).length}/8 · กัปตัน ${esc(captain(t))}</div>`).join('') + `</div>`;
      h += `<div class="panel"><h2>⚠️ อันตราย</h2><div class="row"><button class="danger" data-act="reset-match">ล้างศึกปัจจุบัน+สาย (กลับไปล็อบบี้)</button><button class="danger" data-act="reset-all">ล้างทุกอย่าง (ผู้เล่น/อันดับ/ตั้งค่า)</button></div><div class="row"><button class="ghost" data-act="fill-demo">🧪 เติมผู้เล่นจำลองให้ครบทุกทีม (ทดสอบ)</button></div></div>`;
    } else if (ui.adminTab === 'rank') {
      h += `<div class="panel"><h2>อันดับกิจกรรม outing → ไอเทม</h2><div class="hint">เลือกทีมที่ได้ที่ 1–4 ของแต่ละกิจกรรม กด "บันทึก" ไอเทมจะเด้งเข้าทุกทีมทันที</div>`;
      for (const a of D.ACTIVITY_ORDER) { const r = (st.game && st.game.rankings && st.game.rankings[a]) || [];
        h += `<div class="rank-row"><div class="small"><b>${D.ACTIVITIES[a].name}</b><br>${D.ITEMS[D.ACTIVITIES[a].item].emoji} ${D.ITEMS[D.ACTIVITIES[a].item].name}</div>` + [0, 1, 2, 3].map((i) => `<select data-rank="${a}" data-pos="${i}"><option value="">ที่ ${i + 1}</option>${D.TEAM_ORDER.map((t) => `<option value="${t}" ${r[i] === t ? 'selected' : ''}>${D.TEAMS[t].name}</option>`).join('')}</select>`).join('') + `</div>`; }
      h += `<button class="primary" data-act="save-rank">บันทึกอันดับ</button></div>`;
    } else if (ui.adminTab === 'roster') {
      h += `<div class="panel"><h2>รายชื่อและกัปตัน</h2><div class="hint">หนึ่งชื่อต่อบรรทัด กัปตันคือคนที่เลือกแผน/ไอเทมและย้ายเพื่อนได้ (ค่าเริ่มต้น = คนแรก)</div>` + D.TEAM_ORDER.map((t) => `<div><b style="color:${D.TEAMS[t].color}">${D.TEAMS[t].name}</b><textarea id="roster-${t}" rows="5" style="width:100%;font:inherit;background:var(--bg2);color:var(--fg);border:1px solid var(--line);border-radius:10px;padding:8px">${esc(roster(t).join('\n'))}</textarea><input id="captain-${t}" placeholder="กัปตัน" value="${esc(captain(t))}"></div>`).join('') + `<button class="primary" data-act="save-roster">บันทึกรายชื่อ</button></div>`;
    } else {
      const flat = []; const walk = (o, pre) => { for (const k of Object.keys(o)) { const v = o[k]; if (typeof v === 'number') flat.push([pre + k, v]); else if (v && typeof v === 'object' && !Array.isArray(v)) walk(v, pre + k + '.'); else if (Array.isArray(v)) flat.push([pre + k, v.join(',')]); } }; walk(S, '');
      h += `<div class="panel"><h2>ค่าสมดุล / เวลา</h2><div class="hint">แก้แล้วกดบันทึก มีผลกับศึกถัดไป (ศึกที่กำลังสู้ใช้ค่าเดิมจนจบ) · ค่าเริ่มต้นในวงเล็บ</div>` + flat.filter(([k]) => k !== 'pin').map(([k, v]) => `<div class="kv"><label>${k} <span class="muted">(${defaultOf(k)})</span></label><input data-setting="${k}" value="${esc(v)}"></div>`).join('') + `<div class="row"><button class="primary" data-act="save-settings">บันทึกค่า</button><button class="ghost" data-act="reset-settings">คืนค่าเริ่มต้น</button></div></div>`;
    }
    return h + `<button class="ghost" data-act="admin-logout">ออกจาก Admin</button></div>`;
  }
  function defaultOf(k) { let o = D.DEFAULT_SETTINGS; for (const p of k.split('.')) o = o == null ? undefined : o[p]; return Array.isArray(o) ? o.join(',') : o; }

  // ---------- เรนเดอร์ ----------
  let renderer = null, lastArenaKey = null, lastWaveKey = null;
  function render() {
    if (!st.ready) return;
    const hash = location.hash.replace('#', '');
    let html;
    if (hash === 'screen') html = viewScreen(); else if (hash === 'admin') html = viewAdmin(); else html = viewPlayer();
    const tmp = document.createElement('div'); tmp.className = 'app'; tmp.innerHTML = html;
    const keepCanvas = $('#arena', app);
    const newCanvas = $('#arena', tmp);
    if (window.morphdom) morphdom(app, tmp, { childrenOnly: true, onBeforeElUpdated: (a, b) => { if (a.tagName === 'CANVAS') return false; if ((a.id === 'commentary' || a.id === 'practice-commentary') && a.children.length) return false; if (a.id === 'pr-enemy' || a.id === 'pr-plan') return false; if (a.id === 'qr' && a.children.length) return false; if (document.activeElement === a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT')) return false; return true; } });
    else app.innerHTML = html;
    const c = $('#arena', app);
    if (c) attachArena(c); else { lastArenaKey = null; lastWaveKey = null; if (renderer) { renderer.stop(); renderer = null; } }
    const q = $('#qr', app); if (q && !q.children.length && window.QRCode) new QRCode(q, { text: location.origin + location.pathname, width: 120, height: 120 });
  }
  function attachArena(c) {
    const m = st.match; if (!m) return;
    if (!renderer || renderer.canvas !== c) { if (renderer) renderer.stop(); renderer = new BattleRenderer(c, { teams: { A: m.a, B: m.b }, commentaryEl: $('#commentary', app), now }); lastWaveKey = null; }
    renderer.commentaryEl = $('#commentary', app); renderer.setTeams({ A: m.a, B: m.b });
    const cm = computeMatch();
    if (/^wave/.test(m.stage)) {
      const w = waveIndexOf(m.stage); const wr = cm.waves[w];
      const key = m.id + ':' + m.stage + ':' + m.stageStart + ':' + cm.waves.length;
      if (wr && lastWaveKey !== key) { lastWaveKey = key; renderer.playWave(wr, m.stageStart + 1200, 1); showBanner(`${STAGE_NAME[m.stage]} ⚔️`); }
    } else {
      const key = m.id + ':' + m.stage;
      if (lastWaveKey !== key) { lastWaveKey = key; renderer.setStatic(cm.units); if (m.stage === 'result' && m.result) showBanner(`🏆 ${D.TEAMS[m.result.team].name} ชนะ!`); }
    }
  }
  function showBanner(txt) { const o = $('#arena-overlay', app); if (!o) return; o.innerHTML = `<div class="banner">${txt}</div>`; setTimeout(() => { if (o.firstChild) o.innerHTML = ''; }, 1800); }

  // ---------- เหตุการณ์ ----------
  app.addEventListener('click', async (ev) => {
    const el = ev.target.closest('[data-act]'); if (!el) return;
    const act = el.dataset.act;
    try {
      if (act === 'join-team') { ui.joinTeam = el.dataset.team; render(); }
      else if (act === 'join-back') { ui.joinTeam = null; render(); }
      else if (act === 'join-name') { await joinAs(el.dataset.team, el.dataset.name); ui.joinTeam = null; render(); }
      else if (act === 'class') { await setClass(el.dataset.cls); }
      else if (act === 'change-class') { await R('players/' + me.pid).update({ cls: null }); }
      else if (act === 'leave') { me = null; try { localStorage.removeItem('kkwar-me'); } catch (e) {} ui.joinTeam = null; render(); }
      else if (act === 'guide') { ui.showGuide = true; render(); window.scrollTo(0, 0); }
      else if (act === 'guide-close') { ui.showGuide = false; render(); }
      else if (act === 'cell' || act === 'bench') {
        const team = el.dataset.team; const pid = el.dataset.pid; const cell = el.dataset.cell != null ? +el.dataset.cell : null;
        const mine = myPlayer(); if (!mine || mine.team !== team) return;
        if (ui.sel) {
          if (pid === ui.sel) { ui.sel = null; render(); return; }
          if (act === 'bench') { if (canMove(ui.sel)) await R('players/' + ui.sel).update({ cell: null }); ui.sel = null; return; }
          if (pid && !canMove(pid)) { toast('ย้ายคนนี้ไม่ได้'); return; }
          await moveHero(ui.sel, cell); ui.sel = null; return;
        }
        if (pid) { if (!canMove(pid)) { toast(pid === me.pid ? 'ตอนนี้ย้ายไม่ได้ (ออกสนามแล้วหรืออยู่ระหว่างรบ)' : 'ย้ายได้เฉพาะตัวเอง (กัปตันย้ายได้ทุกคน)'); return; } ui.sel = pid; render(); }
      }
      else if (act === 'plan') { const p = myPlayer(); if (!p || !(isCaptain() || isAdmin)) return; await R('teams/' + p.team).update({ plan: el.dataset.plan }); }
      else if (act === 'item') { const p = myPlayer(); if (!p || !(isCaptain() || isAdmin)) return; const cur = st.teams[p.team] && st.teams[p.team].item; await R('teams/' + p.team).update({ item: cur && cur.id === el.dataset.item ? null : { id: el.dataset.item } }); }
      else if (act === 'tap') { tap(); }
      else if (act === 'practice-start') { practiceStart(); }
      else if (act === 'practice-stop') { ui.practice = { enemy: ui.practice.enemy, plan: ui.practice.plan }; if (pRenderer) { pRenderer.stop(); pRenderer = null; } render(); }
      else if (act === 'pin' || act === 'admin-login') {
        const v = act === 'pin' ? $('#pin', app).value : prompt_('PIN');
        if (v === settings().pin) { isAdmin = true; try { localStorage.setItem('kkwar-admin', '1'); } catch (e) {} toast('เข้าสู่โหมด host แล้ว'); render(); } else toast('PIN ไม่ถูกต้อง');
      }
      else if (act === 'admin-logout') { isAdmin = false; try { localStorage.removeItem('kkwar-admin'); } catch (e) {} render(); }
      else if (act === 'atab') { ui.adminTab = el.dataset.tab; render(); }
      else if (act === 'draw') { if (st.bracket && !confirmUi(el, 'จับฉลากใหม่จะล้างผลศึกทั้งหมด กดอีกครั้งเพื่อยืนยัน')) return; await R('match').set(null); await drawBracket(); toast('จับฉลากแล้ว'); }
      else if (act === 'next-match') { await startNextMatch(); }
      else if (act === 'advance') { await advanceStage(); }
      else if (act === 'extend') { await R('match').update({ stageEnds: st.match.stageEnds + 15000 }); }
      else if (act === 'restart-match') { if (!confirmUi(el, 'เริ่มศึกนี้ใหม่ทั้งหมด? กดอีกครั้ง')) return; const m = st.match; const upd = {}; for (const t of [m.a, m.b]) upd[t + '/itemsUsed'] = null; await R('teams').update(upd); await startMatch(m.id, m.a, m.b); }
      else if (act === 'reset-match') { if (!confirmUi(el, 'ล้างศึกและสาย? กดอีกครั้ง')) return; await R('match').set(null); await R('bracket').set(null); const upd = {}; for (const t of D.TEAM_ORDER) { upd[t + '/itemsUsed'] = null; upd[t + '/item'] = null; } await R('teams').update(upd); await R('game').update({ phase: 'lobby' }); }
      else if (act === 'reset-all') { if (!confirmUi(el, 'ล้างทุกอย่างจริงๆ? กดอีกครั้ง')) return; await R('').set({ game: { phase: 'lobby' } }); toast('ล้างแล้ว'); }
      else if (act === 'fill-demo') { await fillDemo(); }
      else if (act === 'save-rank') { const r = {}; for (const a of D.ACTIVITY_ORDER) { r[a] = [0, 1, 2, 3].map((i) => $(`select[data-rank="${a}"][data-pos="${i}"]`, app).value || null); const set = new Set(r[a].filter(Boolean)); if (set.size !== r[a].filter(Boolean).length) { toast('กิจกรรม ' + D.ACTIVITIES[a].name + ' มีทีมซ้ำ'); return; } } await R('game/rankings').set(r); toast('บันทึกอันดับแล้ว'); }
      else if (act === 'save-roster') { const ro = {}, cp = {}; for (const t of D.TEAM_ORDER) { ro[t] = $('#roster-' + t, app).value.split('\n').map((s) => s.trim()).filter(Boolean); cp[t] = $('#captain-' + t, app).value.trim() || ro[t][0]; } await R('game').update({ roster: ro, captains: cp }); toast('บันทึกรายชื่อแล้ว'); }
      else if (act === 'save-settings') { const o = {}; app.querySelectorAll('[data-setting]').forEach((inp) => { const k = inp.dataset.setting; const def = defaultOf(k); let v = inp.value; if (typeof def === 'string' && def.includes(',') || Array.isArray(def)) v = v.split(',').map(Number); else v = Number(v); let cur = o; const parts = k.split('.'); parts.forEach((p, i) => { if (i === parts.length - 1) cur[p] = v; else cur = cur[p] = cur[p] || {}; }); }); o.pin = settings().pin; await R('game/settings').set(o); toast('บันทึกค่าแล้ว'); }
      else if (act === 'reset-settings') { await R('game/settings').set({ pin: settings().pin }); toast('คืนค่าเริ่มต้นแล้ว'); }
    } catch (e) { console.error(e); toast('ผิดพลาด: ' + (e.message || e)); }
  });
  app.addEventListener('pointerdown', (ev) => { const el = ev.target.closest('[data-act="tap"]'); if (el) { ev.preventDefault(); tap(); } });
  app.addEventListener('click', (ev) => { const el = ev.target.closest('[data-act="tap"]'); if (el) ev.preventDefault(); }, true);
  function prompt_(label) { const v = window.prompt(label); return v == null ? '' : v; }
  function confirmUi(el, msg) { if (el.dataset.confirm === '1') { el.dataset.confirm = ''; return true; } el.dataset.confirm = '1'; toast(msg); setTimeout(() => { el.dataset.confirm = ''; }, 4000); return false; }
  async function fillDemo() {
    const upd = {};
    for (const t of D.TEAM_ORDER) { roster(t).slice(0, 8).forEach((n, i) => { const pid = D.slug(t + ':' + n); const ex = st.players[pid]; const cls = (ex && ex.cls) || ['spear', 'spear', 'spear', 'cav', 'cav', 'archer', 'archer', 'medic'][i]; upd[pid] = { name: n, team: t, cls, cell: i, ts: now() }; }); }
    await R('players').update(upd); toast('เติมผู้เล่นจำลองแล้ว');
  }

  // ---------- สมัครรับข้อมูล ----------
  let readyCount = 0; const need = 5;
  function markReady() { readyCount++; if (readyCount >= need && !st.ready) { st.ready = true; render(); } }
  R('game').on((v) => { st.game = v || {}; if (st.ready) render(); else markReady(); });
  R('players').on((v) => { st.players = v || {}; if (st.ready) render(); else markReady(); });
  R('teams').on((v) => { st.teams = v || {}; if (st.ready) render(); else markReady(); });
  R('bracket').on((v) => { st.bracket = v; if (st.ready) render(); else markReady(); });
  R('match').on((v) => { st.match = v; if (st.ready) render(); else markReady(); });
  window.addEventListener('hashchange', render);
  setInterval(() => { if (st.match && st.match.stage !== 'result') { render(); hostTick(); } }, 1000);
  setTimeout(() => { if (!st.ready) { st.ready = true; render(); } }, 6000);
})();
