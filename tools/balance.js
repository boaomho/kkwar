// node tools/balance.js  — จำลองสมดุลหลายร้อยศึก
global.window = {};
require('../js/data.js'); require('../js/sim.js');
const D = window.GameData, Sim = window.Sim;
const S = JSON.parse(JSON.stringify(D.DEFAULT_SETTINGS));

function mk(comp, team) {
  // comp: array of 8 classes in cell order (front row first: cells 0,1,2 then 3,4,5 then 6,7)
  const cells = {}, roster = {};
  comp.forEach((cls, i) => { const pid = team + i; cells[i] = pid; roster[pid] = { name: team + i, cls }; });
  return { cells, roster };
}
const COMPS = {
  'ม้า8':        ['cav','cav','cav','cav','cav','cav','cav','cav'],
  'หอก8':        ['spear','spear','spear','spear','spear','spear','spear','spear'],
  'ธนู8':        ['archer','archer','archer','archer','archer','archer','archer','archer'],
  'สมดุล3-3-2':   ['spear','spear','spear','cav','cav','cav','archer','archer'],
  'หอกหน้า+ธนูหลัง+หมอ': ['spear','spear','spear','archer','archer','medic','archer','medic'],
  'ม้าหลัง(โผล่ทีหลัง)': ['spear','spear','spear','medic','archer','archer','cav','cav'],
  'หมอ2+ม้า':   ['cav','cav','cav','medic','medic','cav','cav','cav'],
};
const PLANS = ['front','flank','back'];
function run(a, b, plansA, plansB, n) {
  let wa = 0;
  for (let i = 0; i < n; i++) {
    const A = mk(COMPS[a], 'A'), B = mk(COMPS[b], 'B');
    const roster = { ...A.roster, ...B.roster };
    const r = Sim.simulateMatch({ A: { team: 'red', cells: A.cells, plans: plansA, items: [null,null,null], morale: 0.5 },
                                  B: { team: 'blue', cells: B.cells, plans: plansB, items: [null,null,null], morale: 0.5 } }, roster, S, 'seed' + i);
    if (r.result.winner === 'A') wa++;
  }
  return wa / n;
}
const names = Object.keys(COMPS);
const N = +process.argv[2] || 60;
console.log('อัตราชนะของแถว vs คอลัมน์ (แผนปะทะหน้า ทั้งคู่)');
const head = ['', ...names.map(n => n.slice(0, 9).padEnd(9))].join(' | ');
console.log(head);
for (const a of names) {
  const row = [a.slice(0, 14).padEnd(14)];
  for (const b of names) row.push((run(a, b, ['front','front','front'], ['front','front','front'], N) * 100).toFixed(0).padStart(7) + '%');
  console.log(row.join(' | '));
}
console.log('\nแผนมีผลไหม? สมดุล3-3-2 vs สมดุล3-3-2:');
for (const pa of PLANS) for (const pb of PLANS) console.log(pa, 'vs', pb, (run('สมดุล3-3-2','สมดุล3-3-2',[pa,pa,pa],[pb,pb,pb],N)*100).toFixed(0)+'%');
