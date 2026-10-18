/* ตัวจำลองการรบ: deterministic (seed เดียว ผลเดียวกันทุกเครื่อง)
   ใช้ทั้งในศึกจริง โหมดซ้อม และการทดสอบสมดุล */
window.Sim = (function () {
  const D = window.GameData;
  const TICK = 0.1; // วินาทีต่อ tick

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hashSeed(s) {
    let h = 2166136261;
    const str = String(s);
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  const ROW_X = [0.36, 0.22, 0.08];
  const LANE_Y = [0.24, 0.5, 0.76];
  function cellPos(side, cell) {
    const row = Math.floor(cell / 3), lane = cell % 3;
    const x = ROW_X[row];
    return { x: side === 'A' ? x : 1 - x, y: LANE_Y[lane], row, lane };
  }

  /* sides: { A: {team, plan, cells:{cell:pid}}, B: {...} }, roster: {pid:{name,cls}} */
  function createUnits(sides, roster, S) {
    const units = [];
    for (const side of ['A', 'B']) {
      const sd = sides[side];
      const cells = sd.cells || {};
      for (const c of Object.keys(cells)) {
        const pid = cells[c];
        const p = roster[pid];
        if (!p || !p.cls) continue;
        const cell = +c;
        const pos = cellPos(side, cell);
        units.push({
          id: pid, name: p.name, cls: p.cls, side, team: sd.team, cell,
          x: pos.x, y: pos.y, hp: S.hp[p.cls], maxHp: S.hp[p.cls],
          alive: true, deployed: false, stunUntil: -1, cd: 0, lastHeal: -99, engaged: false,
        });
      }
    }
    return units;
  }

  function counterMult(aCls, bCls, S) {
    const a = D.CLASSES[aCls];
    if (a.beats === bCls) return { m: S.counterWin, k: 'win' };
    if (a.weak === bCls) return { m: S.counterLose, k: 'lose' };
    return { m: 1, k: null };
  }
  function dist(a, b) { const dx = a.x - b.x, dy = a.y - b.y; return Math.sqrt(dx * dx + dy * dy); }

  /* จำลอง 1 ระลอก
     units: สถานะจากระลอกก่อน (จะถูก clone), waveIdx 0..2,
     inputs: { A:{plan,item:{id,tier}|null,morale,cells}, B:{...} }, duration วินาที */
  function simulateWave(unitsIn, waveIdx, inputs, roster, S, seed, duration) {
    const rnd = mulberry32(hashSeed(seed) + waveIdx * 1000003);
    const units = unitsIn.map((u) => ({ ...u }));
    const byId = {}; units.forEach((u) => { byId[u.id] = u; });
    const events = [];
    const frames = [];
    const waveMult = S.waveMult[waveIdx] || 1;
    const sideMod = { A: {}, B: {} };
    const t0 = 0;

    // อัปเดตตำแหน่งตัวที่ยังไม่ออก + ตัวใหม่ที่เพิ่งถูกเพิ่ม (ย้ายช่องระหว่างพัก)
    for (const side of ['A', 'B']) {
      const inp = inputs[side] || {};
      const cells = inp.cells || {};
      for (const c of Object.keys(cells)) {
        const pid = cells[c];
        let u = byId[pid];
        if (!u) {
          const p = roster[pid]; if (!p || !p.cls) continue;
          u = { id: pid, name: p.name, cls: p.cls, side, team: inp.team, cell: +c, hp: S.hp[p.cls], maxHp: S.hp[p.cls],
                alive: true, deployed: false, stunUntil: -1, cd: 0, lastHeal: -99, engaged: false };
          units.push(u); byId[pid] = u;
        }
        if (u.alive) { u.cell = +c; const pos = cellPos(side, u.cell); u.x = pos.x; u.y = pos.y; } // พักยก: กลับเข้าตำแหน่งที่จัดไว้
      }
      // ไอเทม
      const mod = sideMod[side];
      mod.plan = (inp.plan && D.PLANS[inp.plan]) ? inp.plan : 'front';
      mod.morale = Math.max(0, Math.min(1, +inp.morale || 0));
      mod.wheel = 1; mod.chain = 1;
      const it = inp.item;
      if (it && D.ITEMS[it.id]) {
        const tier = Math.max(0, Math.min(3, (it.tier | 0)));
        const val = D.ITEMS[it.id].tiers[tier];
        mod.item = it.id; mod.itemTier = tier; mod.itemVal = val;
        if (it.id === 'wheel') mod.wheel = 1 + val / 100;
        if (it.id === 'chain') mod.chain = 1 - val / 100;
        events.push({ t: 0, type: 'item', side, item: it.id, tier, val });
      }
    }

    // ส่งตัวเข้าสนามทั้งหมดตั้งแต่ยกแรก
    for (const u of units) {
      if (!u.alive) continue;
      if (!u.deployed) {
        u.deployed = true; u.cd = rnd() * 0.6; // เริ่มตีไม่พร้อมกัน
        events.push({ t: 0, type: 'enter', id: u.id, side: u.side, name: u.name, cls: u.cls });
      }
    }
    // ผลไอเทมตอนเริ่ม
    for (const side of ['A', 'B']) {
      const mod = sideMod[side], enemy = side === 'A' ? 'B' : 'A';
      if (mod.item === 'water') {
        for (const u of units) if (u.side === side && u.alive && u.deployed) {
          const h = Math.round(u.maxHp * mod.itemVal / 100);
          u.hp = Math.min(u.maxHp, u.hp + h);
          events.push({ t: 0, type: 'heal', to: u.id, amt: h, item: true });
        }
        if (mod.itemTier === 0) {
          const dead = units.filter((u) => u.side === side && !u.alive);
          if (dead.length) { const u = dead[0]; u.alive = true; u.deployed = true; u.hp = Math.round(u.maxHp * 0.5);
            events.push({ t: 0, type: 'revive', id: u.id, name: u.name, side }); }
        }
      }
      if (mod.item === 'net') {
        const targets = units.filter((u) => u.side === enemy && u.alive && u.deployed)
          .sort((a, b) => (side === 'A' ? a.x - b.x : b.x - a.x)).slice(0, 3);
        for (const u of targets) { u.stunUntil = mod.itemVal; events.push({ t: 0, type: 'stun', to: u.id, dur: mod.itemVal }); }
      }
    }

    const ticks = Math.round(duration / TICK);
    let endTick = ticks;
    const SPEED_K = 0.09;

    function enemiesOf(u) { return units.filter((e) => e.side !== u.side && e.alive && e.deployed); }
    function pickTarget(u, enemies, plan) {
      if (!enemies.length) return null;
      const nearest = () => enemies.reduce((best, e) => (dist(u, e) < dist(u, best) ? e : best), enemies[0]);
      if (u.cls === 'archer' && plan === 'back') plan = 'front';
      if (plan === 'flank') {
        const laneHp = [0, 0, 0], laneN = [0, 0, 0];
        for (const e of enemies) { const l = Math.round((e.y - 0.24) / 0.26); const li = Math.max(0, Math.min(2, l)); laneHp[li] += e.hp; laneN[li]++; }
        let best = -1;
        for (let l = 0; l < 3; l++) if (laneN[l] && (best < 0 || laneHp[l] < laneHp[best])) best = l;
        const inLane = enemies.filter((e) => Math.max(0, Math.min(2, Math.round((e.y - 0.24) / 0.26))) === best);
        if (inLane.length) return inLane.reduce((b, e) => (dist(u, e) < dist(u, b) ? e : b), inLane[0]);
        return nearest();
      }
      if (plan === 'back') {
        const depth = (e) => (u.side === 'A' ? e.x : 1 - e.x) + (e.cls === 'medic' ? 0.25 : 0) + (e.cls === 'archer' ? 0.08 : 0);
        return enemies.reduce((b, e) => (depth(e) > depth(b) ? e : b), enemies[0]);
      }
      return nearest();
    }

    for (let tick = 0; tick < ticks; tick++) {
      const t = tick * TICK;
      // snapshot เฟรม
      frames.push(units.map((u) => [u.id, +u.x.toFixed(4), +u.y.toFixed(4), Math.max(0, Math.round(u.hp)), (u.alive ? 1 : 0) | (u.deployed ? 2 : 0) | (u.stunUntil > t ? 4 : 0) | (u.engaged ? 8 : 0)]));
      const alive = { A: 0, B: 0 };
      for (const u of units) if (u.alive && u.deployed) alive[u.side]++;
      if (alive.A === 0 || alive.B === 0) { endTick = tick; break; }

      // เฟส 1: ทุกตัวตัดสินใจจากตำแหน่ง ณ ต้น tick (ไม่มีใครได้เปรียบจากลำดับ)
      const snap = {}; for (const u of units) snap[u.id] = { id: u.id, x: u.x, y: u.y, hp: u.hp, alive: u.alive, deployed: u.deployed, cls: u.cls, side: u.side, maxHp: u.maxHp, engaged: u.engaged };
      const moves = [], attacks = [], heals = [];
      for (const u of units) {
        if (!u.alive || !u.deployed) continue;
        if (u.stunUntil > t) continue;
        const mod = sideMod[u.side];
        const speed = S.speed[u.cls] * SPEED_K * (u.cls === 'cav' ? mod.wheel : 1) * TICK;
        const su = snap[u.id];
        if (u.cls === 'medic') {
          const allies = units.filter((a) => a.side === u.side && a.alive && a.deployed && a.id !== u.id).map((a) => snap[a.id]);
          const wounded = allies.filter((a) => a.hp < a.maxHp).sort((a, b) => (a.hp / a.maxHp) - (b.hp / b.maxHp));
          const target = wounded[0] || allies[0];
          if (target) {
            const d = dist(su, target);
            if (d > S.healRange * 0.8) moves.push({ u, dx: (target.x - su.x) / d * speed, dy: (target.y - su.y) / d * speed });
            if (wounded[0] && dist(su, wounded[0]) <= S.healRange && t - u.lastHeal >= S.healEvery) {
              u.lastHeal = t;
              heals.push({ u, to: wounded[0], amt: Math.round(S.healAmt * (1 + 0.5 * mod.morale)) });
            }
          }
          continue;
        }
        const enemies = enemiesOf(u).map((e) => snap[e.id]);
        const target = pickTarget(su, enemies, mod.plan);
        if (!target) continue;
        const range = u.cls === 'archer' ? S.archerRange : S.meleeRange;
        const d = dist(su, target);
        u.engaged = d <= range * 1.4;
        if (d > range) {
          moves.push({ u, dx: (target.x - su.x) / d * speed, dy: (target.y - su.y) / d * speed });
          u.cd = Math.max(u.cd - TICK, 0);
          u.moving = (u.moving || 0) + 1;
          continue;
        }
        u.cd -= TICK;
        if (u.cd > 0) continue;
        u.cd = S.attackEvery;
        attacks.push({ u, target, charge: u.cls === 'cav' && (u.moving || 0) >= 5 });
        u.moving = 0;
      }
      // เฟส 2: ใช้ผล
      for (const m of moves) { m.u.x += m.dx; m.u.y += m.dy; }
      for (const h of heals) {
        const to = byId[h.to.id]; if (!to.alive) continue;
        to.hp = Math.min(to.maxHp, to.hp + h.amt);
        events.push({ t, type: 'heal', from: h.u.id, to: to.id, amt: h.amt });
      }
      for (const a of attacks) {
        const u = a.u, target = byId[a.target.id];
        const mod = sideMod[u.side];
        const cm = counterMult(u.cls, target.cls, S);
        let dmg = S.atk[u.cls] * waveMult * cm.m;
        if (mod.plan === 'front') dmg *= S.planFrontBonus;
        dmg *= 1 + S.moraleMax * mod.morale;
        if (u.cls === 'cav') dmg *= mod.wheel;
        if (a.charge) dmg *= S.cavCharge;
        dmg *= S.varMin + rnd() * (S.varMax - S.varMin);
        const crit = rnd() < S.critChance;
        if (crit) dmg *= S.critMult;
        const tmod = sideMod[target.side];
        dmg *= tmod.chain;
        if (tmod.plan === 'back' && !snap[target.id].engaged && target.cls !== 'archer') dmg *= S.planBackExposed;
        dmg = Math.max(1, Math.round(dmg));
        if (!target.alive) continue; // ล้มไปแล้วใน tick เดียวกัน
        target.hp -= dmg;
        events.push({ t, type: 'hit', from: u.id, to: target.id, dmg, crit, counter: cm.k, ranged: u.cls === 'archer', charge: !!a.charge });
        if (target.hp <= 0) {
          target.hp = 0; target.alive = false;
          events.push({ t, type: 'die', id: target.id, name: target.name, cls: target.cls, side: target.side, by: u.id });
        }
      }
      // กันซ้อนกัน (ฝ่ายเดียวกัน)
      for (let i = 0; i < units.length; i++) {
        const a = units[i]; if (!a.alive || !a.deployed) continue;
        for (let j = i + 1; j < units.length; j++) {
          const b = units[j]; if (!b.alive || !b.deployed || a.side !== b.side) continue;
          const d = dist(a, b);
          if (d < 0.045 && d > 0.0001) { const push = (0.045 - d) / 2; const dx = (a.x - b.x) / d, dy = (a.y - b.y) / d;
            a.x += dx * push; a.y += dy * push; b.x -= dx * push; b.y -= dy * push; }
        }
        a.x = Math.max(0.03, Math.min(0.97, a.x)); a.y = Math.max(0.08, Math.min(0.92, a.y));
      }
    }
    // เฟรมสุดท้าย
    frames.push(units.map((u) => [u.id, +u.x.toFixed(4), +u.y.toFixed(4), Math.max(0, Math.round(u.hp)), (u.alive ? 1 : 0) | (u.deployed ? 2 : 0)]));
    units.forEach((u) => { u.stunUntil = -1; u.engaged = false; });
    return { units, events, frames, endTick, ticks, duration, waveIdx, sideMod };
  }

  function hpSummary(units) {
    const s = { A: { hp: 0, max: 0, alive: 0, total: 0 }, B: { hp: 0, max: 0, alive: 0, total: 0 } };
    for (const u of units) { const o = s[u.side]; o.total++; o.max += u.maxHp; if (u.alive) { o.alive++; o.hp += u.hp; } }
    s.A.pct = s.A.max ? s.A.hp / s.A.max : 0; s.B.pct = s.B.max ? s.B.hp / s.B.max : 0;
    return s;
  }

  /* ตัดสินผล: ฝ่ายล้มหมด → อีกฝ่ายชนะ, ไม่งั้น % เลือดรวม, เสมอ → รัวกดรวม, เสมอ → seed */
  function decide(units, tapsA, tapsB, seed) {
    const s = hpSummary(units);
    if (s.A.alive === 0 && s.B.alive > 0) return { winner: 'B', reason: 'wipe', s };
    if (s.B.alive === 0 && s.A.alive > 0) return { winner: 'A', reason: 'wipe', s };
    if (Math.abs(s.A.pct - s.B.pct) > 0.0005) return { winner: s.A.pct > s.B.pct ? 'A' : 'B', reason: 'hp', s };
    if (tapsA !== tapsB) return { winner: tapsA > tapsB ? 'A' : 'B', reason: 'taps', s };
    return { winner: (hashSeed(seed) % 2) ? 'A' : 'B', reason: 'coin', s };
  }

  /* จำลองทั้งศึกรวดเดียว (ซ้อม/ทดสอบสมดุล) sides: {A:{team,cells,plans:[3],items:[null,{id,tier},{id,tier}],morale}, B} */
  function simulateMatch(sides, roster, S, seed) {
    let units = createUnits(sides, roster, S);
    const waves = [];
    const durs = [S.tWave1, S.tWave2, S.tWave3];
    for (let w = 0; w < 3; w++) {
      const inputs = {};
      for (const side of ['A', 'B']) {
        const sd = sides[side];
        inputs[side] = { team: sd.team, plan: (sd.plans || [])[w] || sd.plan || 'front', item: w === 0 ? null : ((sd.items || [])[w] || null),
                         morale: sd.morale == null ? 0.5 : sd.morale, cells: sd.cells };
      }
      const r = simulateWave(units, w, inputs, roster, S, seed, durs[w]);
      waves.push(r); units = r.units;
      const s = hpSummary(units);
      if (s.A.alive === 0 || s.B.alive === 0) break;
    }
    const res = decide(units, sides.A.taps || 0, sides.B.taps || 0, seed);
    return { waves, units, result: res };
  }

  return { simulateWave, simulateMatch, createUnits, hpSummary, decide, cellPos, TICK, hashSeed, mulberry32 };
})();
