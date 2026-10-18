/* ข้อมูลหลักของเกม: ทีม รายชื่อ อาชีพ ไอเทม กิจกรรม และค่าสมดุลเริ่มต้น
   ค่าสมดุลทุกตัวใน DEFAULT_SETTINGS ปรับทับได้จากหน้า Admin (เก็บใน game/settings) */
window.GameData = (function () {
  const TEAMS = {
    red:    { id: 'red',    name: 'ทีมแดง',   color: '#e5484d', dark: '#8f1d22', emoji: '🔥' },
    yellow: { id: 'yellow', name: 'ทีมเหลือง', color: '#f5c518', dark: '#8a6d00', emoji: '⚡' },
    blue:   { id: 'blue',   name: 'ทีมฟ้า',    color: '#3b9eff', dark: '#0f4c8a', emoji: '🌊' },
    purple: { id: 'purple', name: 'ทีมม่วง',   color: '#a86bff', dark: '#4a1f8f', emoji: '🔮' },
  };
  const TEAM_ORDER = ['red', 'yellow', 'blue', 'purple'];

  // รายชื่อจากไวท์บอร์ด (แก้ได้ในหน้า Admin)
  const ROSTER = {
    red:    ['พีช', 'อีฟ', 'เขม', 'น้ำ', 'พี่นิคกี้', 'พี่เดือน', 'โค้ชเต้ย', 'อ้อม', 'เจ้ยี่หวา'],
    yellow: ['ริง', 'ปิ่น', 'พี่นะฮ์', 'โค้ชเต้ล', 'พี่พลอย', 'พี่กานลง', 'พี่ชัย', 'โค้ชม่อน'],
    blue:   ['ฝ้าย', 'มาย', 'พริม', 'มะปราง', 'โค้ชเฟิส', 'เดียร์', 'พี่แอน', 'โค้ชเบนซ์'],
    purple: ['เจเวฟ', 'โบตั๋น', 'ข้าวแป้ง', 'แก้ว', 'โค้ชใจ', 'โค้ชกฤษ', 'พี่น้อย', 'อัย'],
  };

  const CLASSES = {
    cav:    { id: 'cav',    name: 'ทหารม้า', emoji: '🐎', short: 'ม้า',
              desc: 'เร็ว พุ่งข้ามแนวหน้าไปตีแถวหลัง', beats: 'archer', weak: 'spear' },
    spear:  { id: 'spear',  name: 'หอก',     emoji: '🔱', short: 'หอก',
              desc: 'เลือดหนา ตั้งรับแนวหน้าได้ดี', beats: 'cav', weak: 'archer' },
    archer: { id: 'archer', name: 'ธนู',     emoji: '🏹', short: 'ธนู',
              desc: 'ยิงไกลจากแถวหลัง ไม่ต้องเข้าประชิด', beats: 'spear', weak: 'cav' },
    medic:  { id: 'medic',  name: 'แพทย์',   emoji: '⚕️', short: 'หมอ',
              desc: 'ไม่โจมตี แต่ฮีลเพื่อนข้างเคียงทุก 2 วิ (ทีมละไม่เกิน 2)', beats: null, weak: null },
  };
  const CLASS_ORDER = ['cav', 'spear', 'archer', 'medic'];

  const PLANS = {
    front: { id: 'front', name: 'ปะทะหน้า', emoji: '🔴', desc: 'ตีตัวที่ใกล้สุด ตรงไปตรงมา แรงขึ้น 10%' },
    flank: { id: 'flank', name: 'เข้าด้านข้าง', emoji: '🟡', desc: 'เลี่ยงแนวหน้า ไปตีเลนที่ศัตรูอ่อนที่สุด' },
    back:  { id: 'back',  name: 'โอบหลัง', emoji: '🟣', desc: 'พุ่งหาแถวหลัง/หมอ แต่โดนตีแรงขึ้น 20% ระหว่างทาง (ธนูทำไม่ได้)' },
  };

  // กิจกรรม outing → ไอเทม (ระดับ 1-4 ตามอันดับ)
  const ACTIVITIES = {
    pool:  { id: 'pool',  name: 'ตักบอลใต้ถุนร้าน', item: 'net' },
    kart:  { id: 'kart',  name: 'โกคาร์ท',          item: 'wheel' },
    legs:  { id: 'legs',  name: '3 คน 4 ขา',        item: 'chain' },
    water: { id: 'water', name: 'เข็นน้ำขึ้นภูเขา',  item: 'water' },
  };
  const ACTIVITY_ORDER = ['pool', 'kart', 'legs', 'water'];

  const TIER_NAMES = ['เทพ', 'แกร่ง', 'ธรรมดา', 'ขำๆ'];
  const ITEMS = {
    net:   { id: 'net',   name: 'ตาข่ายเทพ', emoji: '🕸️',
             desc: 'หลังเริ่มยก 2 วิ โยนตาข่ายใส่ศัตรูที่บุกเข้ามาใกล้สุด ขยับ/ตีไม่ได้ และโดนตีแรงขึ้น 30% ระหว่างติดตาข่าย',
             tiers: [4, 3.5, 2.5, 2], unit: 'วินาที', counts: [4, 3, 3, 2] },
    wheel: { id: 'wheel', name: 'ล้อไฟ', emoji: '🔥',
             desc: 'ทั้งทีมพลังโจมตีเพิ่มขึ้นตลอดยก',
             tiers: [35, 25, 18, 10], unit: '%' },
    chain: { id: 'chain', name: 'โซ่สามัคคี', emoji: '⛓️',
             desc: 'ทั้งทีมได้เกราะ รับดาเมจน้อยลงตลอดยก',
             tiers: [40, 28, 20, 12], unit: '%' },
    water: { id: 'water', name: 'น้ำมนต์สับสน', emoji: '🌀',
             desc: 'สาดใส่ศัตรูตอนเริ่มยก ตัวที่โดน "งง" หันไปตีพวกเดียวกันเอง และโจมตีช้าลง 30%',
             tiers: [4, 4, 4, 3], unit: 'วินาที', counts: [4, 3, 2, 2] },
  };

  const DEFAULT_SETTINGS = {
    pin: '1234',
    prizes: [3200, 2500, 1900, 1400],
    // เวลา (วินาที)
    tPlan: 40, tWave1: 15, tPause: 20, tWave2: 15, tWave3: 20, tResult: 30, roundsToWin: 2,
    // สมดุลอาชีพ
    hp:  { cav: 300, spear: 420, archer: 250, medic: 290 },
    atk: { cav: 14, spear: 13, archer: 13, medic: 0 },
    speed: { cav: 2.4, spear: 1.2, archer: 1.4, medic: 1.3 },
    healAmt: 28, healEvery: 1.5, medicMax: 2,
    counterWin: 1.25, counterLose: 0.8,
    waveMult: [1.0, 1.15, 1.4],
    varMin: 0.85, varMax: 1.15, critChance: 0.10, critMult: 2.0,
    moraleMax: 0.15, moraleHeal: 0.25, tapsPerPersonFull: 40,
    planFrontBonus: 1.10, planBackExposed: 1.15, cavCharge: 1.4, netDelay: 2, stunVuln: 1.3,
    attackEvery: 1.0, atkEvery: { cav: 1.0, spear: 1.0, archer: 1.15, medic: 1.0 }, confuseSlow: 0.3, archerRange: 0.38, meleeRange: 0.055, healRange: 0.2,
  };

  function slug(name) {
    // id ที่ปลอดภัยสำหรับ path ของฐานข้อมูล
    let h = 0;
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
    return 'p' + h.toString(36);
  }

  return { TEAMS, TEAM_ORDER, ROSTER, CLASSES, CLASS_ORDER, PLANS, ACTIVITIES, ACTIVITY_ORDER,
           TIER_NAMES, ITEMS, DEFAULT_SETTINGS, slug };
})();
