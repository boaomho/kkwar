/* ตัววาดสนามรบบน canvas: เล่นผลจำลอง (frames + events) ตามเวลาจริง */
window.BattleRenderer = (function () {
  const D = window.GameData, Sim = window.Sim;
  const TICK = Sim.TICK;

  function teamColor(teamId) { return (D.TEAMS[teamId] || {}).color || '#888'; }
  function teamDark(teamId) { return (D.TEAMS[teamId] || {}).dark || '#444'; }

  class BattleRenderer {
    constructor(canvas, opts) {
      this.canvas = canvas; this.ctx = canvas.getContext('2d');
      this.opts = opts || {};
      this.teams = (opts && opts.teams) || { A: 'red', B: 'blue' };
      this.commentaryEl = opts && opts.commentaryEl;
      this.onTick = opts && opts.onTick;
      this.units = []; this.wave = null; this.start = 0; this.effects = []; this.evIdx = 0;
      this.lastComment = -9; this.comments = []; this.mode = 'static'; this.speed = 1;
      this.running = false; this.dpr = Math.min(2, window.devicePixelRatio || 1);
      this._loop = this._loop.bind(this);
      this.resize();
    }
    resize() {
      const rect = this.canvas.getBoundingClientRect();
      const w = Math.max(320, rect.width), h = Math.max(180, rect.height);
      if (this.canvas.width !== Math.round(w * this.dpr)) { this.canvas.width = Math.round(w * this.dpr); this.canvas.height = Math.round(h * this.dpr); }
      this.w = w; this.h = h;
    }
    setTeams(teams) { this.teams = teams; }
    /* แสดงนิ่งๆ (ช่วงวางแผน/พัก) */
    setStatic(units) {
      this.mode = 'static'; this.wave = null; this.units = units || []; this.effects = []; this.evIdx = 0; this.comments = [];
      this.pos = {}; for (const u of this.units) this.pos[u.id] = { x: u.x, y: u.y, hp: u.hp, alive: u.alive, deployed: u.deployed, stun: false };
      this.run();
    }
    /* เล่นระลอก: wave = ผลจาก Sim.simulateWave, startMs = เวลาเริ่ม (server ms), speed = ตัวคูณเวลา */
    playWave(wave, startMs, speed) {
      this.mode = 'play'; this.wave = wave; this.start = startMs; this.speed = speed || 1;
      this.units = wave.units; this.effects = []; this.evIdx = 0; this.lastComment = -9; this.comments = [];
      this.pos = {};
      this.run();
    }
    run() { if (!this.running) { this.running = true; requestAnimationFrame(this._loop); } }
    stop() { this.running = false; }
    now() { return this.opts.now ? this.opts.now() : Date.now(); }

    _loop() {
      if (!this.running) return;
      this.resize();
      const ctx = this.ctx; ctx.save(); ctx.scale(this.dpr, this.dpr);
      this._drawField(ctx);
      if (this.mode === 'play' && this.wave) this._advance();
      this._drawUnits(ctx);
      this._drawEffects(ctx);
      ctx.restore();
      requestAnimationFrame(this._loop);
    }
    elapsed() { return Math.max(0, (this.now() - this.start) / 1000 * this.speed); }
    _advance() {
      const w = this.wave, el = this.elapsed();
      const tickF = el / TICK;
      const last = Math.min(w.frames.length - 1, w.endTick);
      const i0 = Math.min(last, Math.floor(tickF)), i1 = Math.min(last, i0 + 1);
      const f0 = w.frames[i0], f1 = w.frames[i1]; const a = Math.min(1, tickF - i0);
      const map1 = {}; for (const r of f1) map1[r[0]] = r;
      const pos = {};
      for (const r of f0) {
        const r1 = map1[r[0]] || r;
        pos[r[0]] = { x: r[1] + (r1[1] - r[1]) * a, y: r[2] + (r1[2] - r[2]) * a, hp: r1[3], alive: !!(r1[4] & 1), deployed: !!(r1[4] & 2), stun: !!(r1[4] & 4) };
      }
      this.pos = pos;
      // เหตุการณ์
      const tEnd = Math.min(el, w.endTick * TICK + 0.001);
      while (this.evIdx < w.events.length && w.events[this.evIdx].t <= tEnd) {
        this._event(w.events[this.evIdx], el); this.evIdx++;
      }
      if (this.onTick) this.onTick(el, i0 >= last);
    }
    unitById(id) { return this.units.find((u) => u.id === id); }
    _moving(id) {
      const w = this.wave; if (!w) return false;
      const i = Math.min(w.frames.length - 1, Math.floor(this.elapsed() / TICK)); const j = Math.max(0, i - 2);
      const a = w.frames[j].find((r) => r[0] === id), b = w.frames[i].find((r) => r[0] === id); if (!a || !b) return false;
      return Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) > 0.002;
    }
    _event(ev, el) {
      const p = (id) => this.pos[id];
      const uf = this.unitById(ev.from), ut = this.unitById(ev.to);
      if (ev.type === 'hit' && p(ev.to)) {
        const t = p(ev.to);
        if (ev.ranged && p(ev.from)) this.effects.push({ k: 'arrow', x0: p(ev.from).x, y0: p(ev.from).y, x1: t.x, y1: t.y, t0: el, dur: 0.25, color: teamColor(uf.team) });
        this.effects.push({ k: 'num', x: t.x, y: t.y, txt: (ev.crit ? '💥' : '') + '-' + ev.dmg, t0: el + (ev.ranged ? 0.25 : 0), dur: 0.9, color: ev.crit ? '#ffd23f' : (ev.counter === 'win' ? '#ff8a5c' : '#fff'), big: ev.crit || ev.charge });
        this.effects.push({ k: 'flash', id: ev.to, t0: el + (ev.ranged ? 0.25 : 0), dur: 0.2 });
        if (!ev.ranged && p(ev.from)) this.effects.push({ k: 'lunge', id: ev.from, tx: t.x, ty: t.y, t0: el, dur: 0.3 });
        if (ev.crit) this._comment(`💥 คริติคอล! ${uf.name} ซัด ${ut.name} ไป ${ev.dmg}`, 'crit', el, 2);
        else if (ev.charge) this._comment(`🐎 ${uf.name} ควบม้าพุ่งชน ${ut.name} เต็มแรง!`, 'crit', el, 1);
        else if (ev.counter === 'win') this._comment(`${D.CLASSES[uf.cls].emoji} ${uf.name} ไล่ถล่ม ${ut.name} แพ้ทางเต็มๆ`, '', el, 1);
        else if (ev.counter === 'lose') this._comment(`${uf.name} ตี ${ut.name} แต่แพ้ทาง เจ็บแค่ ${ev.dmg}`, '', el, 0);
      } else if (ev.type === 'die') {
        const u = this.unitById(ev.id);
        this.effects.push({ k: 'death', id: ev.id, t0: el, dur: 1.2 });
        const tn = D.TEAMS[u.team].name;
        if (u.cls === 'medic') this._comment(`☠️ หมอ ${u.name} โดนเชือด ${tn} หมดคนฮีลแล้ว!`, 'die', el, 3);
        else this._comment(`☠️ ${u.name} (${D.CLASSES[u.cls].short}) ของ${tn} ล้มแล้ว!`, 'die', el, 3);
      } else if (ev.type === 'heal' && p(ev.to)) {
        this.effects.push({ k: 'num', x: p(ev.to).x, y: p(ev.to).y, txt: '+' + ev.amt, t0: el, dur: 0.9, color: '#5ef0a0' });
        this.effects.push({ k: 'sparkle', id: ev.to, t0: el, dur: 0.6 });
        if (!ev.item && uf) this._comment(`💚 หมอ ${uf.name} ฮีล ${ut.name} +${ev.amt}`, 'heal', el, 0);
      } else if (ev.type === 'enter') {
        this.effects.push({ k: 'ring', id: ev.id, t0: el, dur: 0.8 });
      } else if (ev.type === 'stun') {
        this.effects.push({ k: 'stun', id: ev.to, t0: el, dur: ev.dur });
      } else if (ev.type === 'item') {
        const it = D.ITEMS[ev.item]; const tn = D.TEAMS[this.teams[ev.side]].name;
        if (ev.item === 'chain' || ev.item === 'wheel') for (const u of this.units) if (u.side === ev.side && u.alive) this.effects.push({ k: ev.item === 'chain' ? 'shield' : 'fire', id: u.id, t0: el, dur: this.wave ? this.wave.duration : 15 });
        this._comment(`${it.emoji} ${tn} ใช้ ${it.name} ระดับ${D.TIER_NAMES[ev.tier]}!`, 'crit', el, 3);
        this.effects.push({ k: 'banner', txt: `${it.emoji} ${it.name}`, side: ev.side, t0: el, dur: 1.6 });
      } else if (ev.type === 'revive') {
        this._comment(`✨ น้ำทิพย์ชุบชีวิต ${ev.name} กลับมาสู้ต่อ!`, 'heal', el, 3);
        this.effects.push({ k: 'ring', id: ev.id, t0: el, dur: 1 });
      }
    }
    _comment(txt, cls, el, prio) {
      if (!this.commentaryEl) return;
      if (prio < 2 && el - this.lastComment < 1.3) return;
      if (prio >= 2 && el - this.lastComment < 0.3) return;
      this.lastComment = el;
      this.comments.push({ txt, cls });
      if (this.comments.length > 3) this.comments.shift();
      this.commentaryEl.innerHTML = this.comments.map((c) => `<div class="${c.cls}">${c.txt}</div>`).join('');
    }

    _drawField(ctx) {
      const w = this.w, h = this.h;
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#163a22'); g.addColorStop(1, '#0c2416');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      // แถบสีทีมสองฝั่ง
      const gl = ctx.createLinearGradient(0, 0, w * 0.5, 0); gl.addColorStop(0, teamColor(this.teams.A) + '33'); gl.addColorStop(1, 'transparent');
      ctx.fillStyle = gl; ctx.fillRect(0, 0, w * 0.5, h);
      const gr = ctx.createLinearGradient(w, 0, w * 0.5, 0); gr.addColorStop(0, teamColor(this.teams.B) + '33'); gr.addColorStop(1, 'transparent');
      ctx.fillStyle = gr; ctx.fillRect(w * 0.5, 0, w * 0.5, h);
      // เส้นเลน
      ctx.strokeStyle = 'rgba(255,255,255,0.07)'; ctx.lineWidth = 1;
      for (const y of [0.37, 0.63]) { ctx.beginPath(); ctx.moveTo(0, y * h); ctx.lineTo(w, y * h); ctx.stroke(); }
      ctx.setLineDash([6, 8]); ctx.strokeStyle = 'rgba(255,255,255,0.18)';
      ctx.beginPath(); ctx.moveTo(w / 2, 0); ctx.lineTo(w / 2, h); ctx.stroke(); ctx.setLineDash([]);
      // พื้นหญ้า ลายจางๆ
      ctx.fillStyle = 'rgba(255,255,255,0.035)';
      for (let i = 0; i < 14; i++) { const gx = ((i * 137) % 100) / 100 * w, gy = ((i * 71 + 13) % 100) / 100 * h; ctx.beginPath(); ctx.ellipse(gx, gy, w * 0.06, h * 0.03, 0, 0, Math.PI * 2); ctx.fill(); }
      // ต้นไม้ขอบบน-ล่าง และธงทีม
      if (window.Sprites) {
        const th = h * 0.2;
        const spots = [[0.05, 0, 0], [0.18, 1, -0.02], [0.33, 0, 0.01], [0.5, 1, -0.01], [0.66, 0, 0], [0.8, 1, -0.02], [0.94, 0, 0.01]];
        for (const [fx, k, dy] of spots) { const img = Sprites.tree(k); if (img.complete && img.naturalWidth) { ctx.globalAlpha = 0.9; ctx.drawImage(img, fx * w - th * 0.19, -th * 0.45 + dy * h, th * 0.75, th); ctx.drawImage(img, (1 - fx) * w - th * 0.19, h - th * 0.55 + dy * h, th * 0.75, th); ctx.globalAlpha = 1; } }
        const bA = Sprites.banner(teamColor(this.teams.A), teamDark(this.teams.A)), bB = Sprites.banner(teamColor(this.teams.B), teamDark(this.teams.B));
        const bh = h * 0.3;
        if (bA.complete && bA.naturalWidth) ctx.drawImage(bA, w * 0.012, h * 0.1, bh / 3, bh);
        if (bB.complete && bB.naturalWidth) { ctx.save(); ctx.translate(w - w * 0.012, 0); ctx.scale(-1, 1); ctx.drawImage(bB, 0, h * 0.1, bh / 3, bh); ctx.restore(); }
      }
      // ชื่อทีม
      ctx.font = `800 ${Math.max(12, w * 0.028)}px Kanit, sans-serif`; ctx.textBaseline = 'top';
      ctx.fillStyle = teamColor(this.teams.A); ctx.textAlign = 'left'; ctx.fillText(D.TEAMS[this.teams.A].name, w * 0.05, 8);
      ctx.fillStyle = teamColor(this.teams.B); ctx.textAlign = 'right'; ctx.fillText(D.TEAMS[this.teams.B].name, w - w * 0.05, 8);
    }
    _drawUnits(ctx) {
      const w = this.w, h = this.h, R = Math.max(12, w * 0.034);
      const el = this.mode === 'play' ? this.elapsed() : 0;
      const order = [...this.units].sort((a, b) => { const pa = this.pos[a.id] || a, pb = this.pos[b.id] || b; const da = pa.alive === false ? 0 : 1, db = pb.alive === false ? 0 : 1; return da !== db ? da - db : pa.y - pb.y; });
      for (const u of order) {
        const p = this.pos[u.id] || { x: u.x, y: u.y, hp: u.hp, alive: u.alive, deployed: u.deployed };
        let x = p.x * w, y = p.y * h;
        // lunge
        for (const e of this.effects) if (e.k === 'lunge' && e.id === u.id) { const k = Math.sin(Math.min(1, (el - e.t0) / e.dur) * Math.PI); x += (e.tx * w - x) * 0.35 * k; y += (e.ty * h - y) * 0.35 * k; }
        const dead = !p.alive;
        const ghost = !p.deployed && !dead;
        const H = R * 4.4, W = H * 100 / 114;
        const spr = window.Sprites ? Sprites.get(u.cls, teamColor(u.team), teamDark(u.team)) : null;
        const ok = spr && spr.complete && spr.naturalWidth;
        const flip = u.side === 'B';
        ctx.save();
        if (dead) {
          ctx.globalAlpha = 0.28;
          if (ok) { ctx.translate(x, y + R * 0.9); ctx.rotate(flip ? Math.PI / 2 : -Math.PI / 2); ctx.drawImage(spr, -W * 0.35, -H * 0.7 + R * 0.3, W * 0.7, H * 0.7); ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); }
          ctx.globalAlpha = 0.6; ctx.font = `${R * 0.9}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('💀', x, y);
          ctx.globalAlpha = 0.5; this._label(ctx, u.name, x, y + R * 0.9, R * 0.8, '#777');
          ctx.restore(); continue;
        }
        if (ghost) ctx.globalAlpha = 0.3;
        // เงา
        ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(x, y + R * 0.9, R * 1.1, R * 0.35, 0, 0, Math.PI * 2); ctx.fill();
        let flash = false; for (const e of this.effects) if (e.k === 'flash' && e.id === u.id && el >= e.t0 && el < e.t0 + e.dur) flash = true;
        const moving = this.mode === 'play' && this._moving(u.id);
        const bob = moving ? Math.abs(Math.sin(el * 14 + u.id.length)) * R * 0.25 : Math.sin(el * 3 + u.id.length) * R * 0.06;
        if (ok) {
          ctx.save(); ctx.translate(x, y + R * 0.9 - bob); if (flip) ctx.scale(-1, 1);
          if (flash) ctx.filter = 'brightness(2.2) saturate(0.4)';
          ctx.drawImage(spr, -W / 2, -H, W, H);
          ctx.restore();
        } else {
          const grad = ctx.createRadialGradient(x - R * 0.3, y - R * 0.4, R * 0.2, x, y, R * 1.1);
          grad.addColorStop(0, flash ? '#fff' : teamColor(u.team)); grad.addColorStop(1, flash ? '#ffd' : teamDark(u.team));
          ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(x, y, R, 0, Math.PI * 2); ctx.fill();
          ctx.font = `${R * 1.25}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(D.CLASSES[u.cls].emoji, x, y + R * 0.05);
        }
        // sparkle / stun / ring
        for (const e of this.effects) {
          if (e.id !== u.id || el < e.t0 || el > e.t0 + e.dur) continue;
          ctx.font = `${R}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          if (e.k === 'sparkle') ctx.fillText('✨', x + R * 1.1, y - R * 2.2);
          if (e.k === 'shield') { ctx.globalAlpha = 0.85; ctx.fillText('🛡️', x - R * 1.3, y - R * 1.2); ctx.globalAlpha = 1; }
          if (e.k === 'fire') { const f = 0.8 + 0.2 * Math.sin(el * 12); ctx.font = `${R * f}px sans-serif`; ctx.fillText('🔥', x + R * 1.2, y - R * 1.0); }
          if (e.k === 'stun') { ctx.font = `${R * 1.1}px sans-serif`; ctx.fillText('🕸️', x, y - H + R * 0.2); }
          if (e.k === 'ring') { const k = (el - e.t0) / e.dur; ctx.strokeStyle = `rgba(255,255,255,${1 - k})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(x, y + R * 0.9, R * (1 + k * 2), R * 0.4 * (1 + k * 2), 0, 0, Math.PI * 2); ctx.stroke(); }
        }
        // HP
        const bw = R * 2.2, bh = Math.max(4, R * 0.28);
        const hy = y + R * 0.9 - H - bh - 3;
        ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(x - bw / 2, hy, bw, bh);
        const pct = Math.max(0, Math.min(1, p.hp / u.maxHp));
        ctx.fillStyle = pct > 0.5 ? '#3ddc84' : pct > 0.25 ? '#f5c518' : '#ff4d5e';
        ctx.fillRect(x - bw / 2, hy, bw * pct, bh);
        // ชื่อ
        this._label(ctx, u.name, x, y + R * 1.2, R, teamColor(u.team));
        ctx.restore();
      }
    }
    _label(ctx, txt, x, y, R, color) {
      const fs = Math.max(10, R * 0.72);
      ctx.font = `600 ${fs}px Kanit, "Noto Sans Thai", sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const tw = ctx.measureText(txt).width + fs * 0.9;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      const rh = fs * 1.35; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x - tw / 2, y - rh / 2 + fs * 0.5, tw, rh, rh / 2) : ctx.rect(x - tw / 2, y - rh / 2 + fs * 0.5, tw, rh); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.fillText(txt, x, y + fs * 0.5);
    }
    _drawEffects(ctx) {
      const w = this.w, h = this.h, el = this.mode === 'play' ? this.elapsed() : 0;
      const R = Math.max(12, w * 0.034);
      this.effects = this.effects.filter((e) => el <= e.t0 + e.dur + 0.1);
      for (const e of this.effects) {
        if (el < e.t0) continue;
        const k = Math.min(1, (el - e.t0) / e.dur);
        if (e.k === 'num') {
          ctx.font = `800 ${e.big ? R * 1.3 : R * 0.95}px Kanit, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.globalAlpha = 1 - k; ctx.fillStyle = '#000'; ctx.fillText(e.txt, e.x * w + 1.5, e.y * h - R * 3.2 - k * R * 1.8 + 1.5);
          ctx.fillStyle = e.color; ctx.fillText(e.txt, e.x * w, e.y * h - R * 3.2 - k * R * 1.8); ctx.globalAlpha = 1;
        } else if (e.k === 'arrow') {
          const x = (e.x0 + (e.x1 - e.x0) * k) * w, y = (e.y0 + (e.y1 - e.y0) * k) * h - R * 1.6 - Math.sin(k * Math.PI) * R * 2;
          const ang = Math.atan2((e.y1 - e.y0) * h, (e.x1 - e.x0) * w);
          ctx.save(); ctx.translate(x, y); ctx.rotate(ang); ctx.strokeStyle = '#ffe8b0'; ctx.lineWidth = 2.5;
          ctx.beginPath(); ctx.moveTo(-R * 0.9, 0); ctx.lineTo(R * 0.4, 0); ctx.stroke();
          ctx.fillStyle = '#ffe8b0'; ctx.beginPath(); ctx.moveTo(R * 0.6, 0); ctx.lineTo(R * 0.2, -R * 0.25); ctx.lineTo(R * 0.2, R * 0.25); ctx.fill(); ctx.restore();
        } else if (e.k === 'death') {
          const u = this.unitById(e.id), p = this.pos[e.id]; if (!p) continue;
          ctx.globalAlpha = (1 - k) * 0.8; ctx.font = `${R * 1.4}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText('💢', p.x * w, p.y * h - R * 2 - k * R * 2); ctx.globalAlpha = 1;
        } else if (e.k === 'banner') {
          ctx.globalAlpha = k < 0.15 ? k / 0.15 : (k > 0.8 ? (1 - k) / 0.2 : 1);
          ctx.font = `800 ${R * 1.8}px Kanit, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          const x = e.side === 'A' ? w * 0.25 : w * 0.75, y = h * 0.5;
          ctx.fillStyle = 'rgba(0,0,0,0.6)'; const tw = ctx.measureText(e.txt).width + R * 2;
          ctx.fillRect(x - tw / 2, y - R * 1.4, tw, R * 2.8);
          ctx.fillStyle = '#ffe46b'; ctx.fillText(e.txt, x, y); ctx.globalAlpha = 1;
        }
      }
    }
  }
  return BattleRenderer;
})();
