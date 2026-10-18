global.window = {};
require('../js/data.js'); require('../js/sim.js');
const D = window.GameData, Sim = window.Sim;
const S = JSON.parse(JSON.stringify(D.DEFAULT_SETTINGS));
Object.assign(S, JSON.parse(process.argv[3] || '{}'));
function mk(comp, team) { const cells = {}, roster = {}; comp.forEach((cls, i) => { const pid = team + i; cells[i] = pid; roster[pid] = { name: pid, cls }; }); return { cells, roster }; }
const COMPS = {
  'ม้า8': ['cav','cav','cav','cav','cav','cav','cav','cav'],
  'หอก8': ['spear','spear','spear','spear','spear','spear','spear','spear'],
  'ธนู8': ['archer','archer','archer','archer','archer','archer','archer','archer'],
  'สมดุล': ['spear','spear','spear','cav','cav','cav','archer','archer'],
  'หอก+ธนู+หมอ2': ['spear','spear','spear','archer','archer','medic','archer','medic'],
  'ม้าซุ่มหลัง': ['spear','spear','spear','medic','archer','archer','cav','cav'],
  'ม้า6+หมอ2': ['cav','cav','cav','medic','medic','cav','cav','cav'],
  'ธนู6+หมอ2': ['archer','archer','archer','medic','medic','archer','archer','archer'],
};
const PLANS = ['front','flank','back'];
const N = +process.argv[2] || 30;
function run(a, b, pa, pb) {
  let wa = 0;
  for (let i = 0; i < N; i++) {
    const A = mk(COMPS[a], 'A'), B = mk(COMPS[b], 'B');
    const r = Sim.simulateMatch({ A: { team: 'red', cells: A.cells, plans: [pa,pa,pa], items: [null,null,null], morale: 0.5 },
                                  B: { team: 'blue', cells: B.cells, plans: [pb,pb,pb], items: [null,null,null], morale: 0.5 } }, { ...A.roster, ...B.roster }, S, 'seed' + i);
    if (r.result.winner === 'A') wa++;
  }
  return wa / N;
}
const names = Object.keys(COMPS);
console.log('ค่า maximin ของแถว (เลือกแผนดีสุดของตัวเอง โดยคู่แข่งตอบโต้ดีสุด)');
console.log(''.padEnd(12) + names.map(n => n.slice(0, 7).padStart(8)).join(''));
const avg = {};
for (const a of names) {
  let line = a.slice(0, 12).padEnd(12); avg[a] = 0;
  for (const b of names) {
    let best = -1;
    for (const pa of PLANS) { let worst = 2; for (const pb of PLANS) worst = Math.min(worst, run(a, b, pa, pb)); best = Math.max(best, worst); }
    line += (best * 100).toFixed(0).padStart(7) + '%'; avg[a] += best / names.length;
  }
  console.log(line + '   avg ' + (avg[a]*100).toFixed(0) + '%');
}
