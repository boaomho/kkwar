/* ตัวละคร chibi แบบเวกเตอร์ (SVG → Image) ย้อมสีตามทีม ใช้วาดลง canvas
   ทุกตัวหันขวา (ฝั่ง A) ฝั่ง B กลับด้านตอนวาด  viewBox 0 0 100 110 */
window.Sprites = (function () {
  const cache = {};
  function esc(c) { return c.replace('#', '%23'); }

  // ชิ้นส่วนร่วม
  const head = (skin, extra) => `
    <ellipse cx="50" cy="34" rx="22" ry="21" fill="${skin}"/>
    <circle cx="43" cy="36" r="2.6" fill="#1a1a1a"/><circle cx="57" cy="36" r="2.6" fill="#1a1a1a"/>
    <circle cx="44" cy="35" r="0.9" fill="#fff"/><circle cx="58" cy="35" r="0.9" fill="#fff"/>
    <path d="M45 44 q5 4 10 0" stroke="#7a3b2e" stroke-width="1.6" fill="none" stroke-linecap="round"/>
    <ellipse cx="38" cy="42" rx="3.5" ry="2" fill="#ff9c9c" opacity=".55"/><ellipse cx="62" cy="42" rx="3.5" ry="2" fill="#ff9c9c" opacity=".55"/>
    ${extra || ''}`;
  const shadow = `<ellipse cx="50" cy="104" rx="26" ry="5" fill="#000" opacity=".25"/>`;
  const legs = (pants) => `<rect x="38" y="80" width="9" height="18" rx="4" fill="${pants}"/><rect x="53" y="80" width="9" height="18" rx="4" fill="${pants}"/>
    <ellipse cx="42" cy="99" rx="7" ry="3.5" fill="#2b1d12"/><ellipse cx="58" cy="99" rx="7" ry="3.5" fill="#2b1d12"/>`;
  const body = (team, dark, w) => `<path d="M${50 - w} 60 q${w} -8 ${2 * w} 0 l3 24 h-${2 * w + 6} z" fill="${team}"/>
    <path d="M${50 - w} 60 q${w} -8 ${2 * w} 0 l1 7 h-${2 * w + 2} z" fill="${dark}" opacity=".35"/>`;

  function spear(team, dark, skin) {
    return `${shadow}
      <line x1="78" y1="8" x2="70" y2="98" stroke="#6b4a2b" stroke-width="3.5" stroke-linecap="round"/>
      <path d="M79 3 l6 12 l-6 4 l-6 -4 z" fill="#d8dde6" stroke="#8b949e" stroke-width="1"/>
      ${body(team, dark, 15)}
      <rect x="40" y="60" width="20" height="18" rx="3" fill="#b8bec9"/><rect x="43" y="63" width="14" height="4" fill="#8b949e"/>
      ${legs('#4a4a52')}
      <path d="M18 62 q-10 14 0 28 q12 6 22 0 q10 -14 0 -28 q-10 -6 -22 0 z" fill="${team}" stroke="#2b2b2b" stroke-width="2.5"/>
      <path d="M20 72 l18 -8 M20 84 l18 -8" stroke="#fff" stroke-width="3" opacity=".8" stroke-linecap="round"/>
      ${head(skin)}
      <path d="M28 30 a22 22 0 0 1 44 0 v6 h-44 z" fill="#8b949e"/><rect x="26" y="30" width="48" height="6" rx="3" fill="#6c757d"/>
      <path d="M50 8 l4 10 h-8 z" fill="${team}"/>`;
  }
  function archer(team, dark, skin) {
    return `${shadow}
      <path d="M78 28 q22 27 0 54" stroke="#8a5a2b" stroke-width="4" fill="none" stroke-linecap="round"/>
      <line x1="78" y1="28" x2="78" y2="82" stroke="#e8e8e8" stroke-width="1.2"/>
      <line x1="60" y1="55" x2="92" y2="55" stroke="#6b4a2b" stroke-width="2.2"/><path d="M92 55 l-6 -3 v6 z" fill="#d8dde6"/>
      ${body('#5b4a3a', '#000', 13)}
      <path d="M38 60 h24 l-2 22 h-20 z" fill="${team}"/>
      ${legs('#3a4a3a')}
      <rect x="20" y="52" width="9" height="28" rx="3" fill="#6b4a2b"/><path d="M22 52 l2 -8 l3 8 M24 52 l2 -8 l3 8" stroke="#d8dde6" stroke-width="1.5" fill="none"/>
      ${head(skin)}
      <path d="M26 36 q4 -30 24 -30 q20 0 24 30 q-8 -4 -24 -4 q-16 0 -24 4 z" fill="${team}"/>
      <path d="M30 34 q6 -22 20 -22 q14 0 20 22" fill="none" stroke="${dark}" stroke-width="2" opacity=".5"/>`;
  }
  function medic(team, dark, skin) {
    return `${shadow}
      <line x1="76" y1="30" x2="76" y2="96" stroke="#c8b08a" stroke-width="3" stroke-linecap="round"/><circle cx="76" cy="26" r="5" fill="#5ef0a0" stroke="#2a9d5a" stroke-width="1.5"/>
      ${body('#f4f4f8', '#000', 16)}
      <rect x="44" y="62" width="12" height="12" fill="#e5484d"/><rect x="47" y="59" width="6" height="18" fill="#e5484d"/>
      <path d="M35 60 h6 v24 h-8 z" fill="${team}"/><path d="M59 60 h6 l2 24 h-8 z" fill="${team}"/>
      ${legs('#d9d9e0')}
      <rect x="18" y="66" width="16" height="12" rx="2" fill="#6b4a2b"/><rect x="22" y="69" width="8" height="2" fill="#e5484d"/>
      ${head(skin)}
      <path d="M30 32 q3 -16 20 -16 q17 0 20 16 h-40 z" fill="#f4f4f8"/><rect x="28" y="30" width="44" height="5" rx="2" fill="${team}"/>
      <rect x="47" y="19" width="6" height="2" fill="#e5484d"/><rect x="49" y="17" width="2" height="6" fill="#e5484d"/>`;
  }
  function cav(team, dark, skin) {
    return `<ellipse cx="50" cy="105" rx="40" ry="5" fill="#000" opacity=".25"/>
      <!-- ม้า -->
      <path d="M14 70 q-10 6 -12 22 q8 -4 14 -14 z" fill="#4a2e14"/>
      <rect x="22" y="78" width="8" height="24" rx="3" fill="#6e4422"/><rect x="34" y="80" width="8" height="22" rx="3" fill="#5a3618"/>
      <rect x="56" y="80" width="8" height="22" rx="3" fill="#5a3618"/><rect x="68" y="78" width="8" height="24" rx="3" fill="#6e4422"/>
      <ellipse cx="50" cy="72" rx="33" ry="15" fill="#8b5a2b"/>
      <path d="M70 64 q10 -4 16 -22 q6 -4 12 0 q-2 16 -12 26 q-8 6 -16 2 z" fill="#8b5a2b"/>
      <ellipse cx="90" cy="46" rx="10" ry="7" fill="#8b5a2b"/><ellipse cx="97" cy="48" rx="4" ry="3" fill="#6e4422"/>
      <circle cx="90" cy="44" r="1.8" fill="#1a1a1a"/><path d="M84 38 l3 -7 l4 6 z" fill="#6e4422"/>
      <path d="M72 42 q8 2 14 10" stroke="#3a2412" stroke-width="4" fill="none" stroke-linecap="round"/>
      <path d="M30 62 h40 v12 h-40 z" fill="${team}"/><path d="M30 62 h40 v4 h-40 z" fill="${dark}" opacity=".35"/>
      <!-- คนขี่ -->
      <line x1="78" y1="2" x2="80" y2="60" stroke="#6b4a2b" stroke-width="3.5" stroke-linecap="round"/><path d="M78 -2 l6 10 l-7 3 l-5 -5 z" fill="#d8dde6" stroke="#8b949e"/>
      <path d="M38 36 q12 -8 24 0 l3 24 h-30 z" fill="${team}"/>
      <path d="M40 58 h8 v14 h-8 z" fill="#4a4a52"/><ellipse cx="44" cy="73" rx="6" ry="3" fill="#2b1d12"/>
      <ellipse cx="50" cy="24" rx="18" ry="17" fill="${skin}"/>
      <circle cx="44" cy="26" r="2.2" fill="#1a1a1a"/><circle cx="56" cy="26" r="2.2" fill="#1a1a1a"/>
      <path d="M45 33 q5 3 10 0" stroke="#7a3b2e" stroke-width="1.5" fill="none" stroke-linecap="round"/>
      <path d="M32 22 a18 18 0 0 1 36 0 v5 h-36 z" fill="#8b949e"/><rect x="30" y="22" width="40" height="5" rx="2" fill="#6c757d"/>
      <path d="M50 0 q9 4 7 13 l-7 -4 l-7 4 q-2 -9 7 -13 z" fill="${team}"/>`;
  }
  const DRAW = { spear, archer, medic, cav };

  function svgFor(cls, team, dark) {
    const skin = '#f6d3b0';
    const inner = DRAW[cls](team, dark, skin);
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -4 100 114" width="200" height="228">${inner}</svg>`;
  }
  function get(cls, team, dark) {
    const key = cls + '|' + team;
    if (cache[key]) return cache[key];
    const img = new Image();
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgFor(cls, team, dark));
    cache[key] = img;
    return img;
  }
  // ของตกแต่งสนาม
  function tree(kind) {
    const key = 'tree' + kind; if (cache[key]) return cache[key];
    const svg = kind === 0
      ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 80" width="120" height="160"><ellipse cx="30" cy="76" rx="20" ry="4" fill="#000" opacity=".2"/><rect x="26" y="50" width="8" height="26" fill="#5a3a1b"/><circle cx="30" cy="34" r="22" fill="#2f7d3a"/><circle cx="20" cy="42" r="14" fill="#3a9447"/><circle cx="42" cy="40" r="15" fill="#2a6e33"/><circle cx="30" cy="24" r="14" fill="#44a553"/></svg>`
      : `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 80" width="120" height="160"><ellipse cx="30" cy="76" rx="18" ry="4" fill="#000" opacity=".2"/><rect x="27" y="56" width="6" height="20" fill="#5a3a1b"/><path d="M30 4 l22 30 h-12 l14 22 h-48 l14 -22 h-12 z" fill="#2f7d3a"/><path d="M30 4 l22 30 h-12 l6 10 h-32 l6 -10 h-12 z" fill="#44a553" opacity=".7"/></svg>`;
    const img = new Image(); img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); cache[key] = img; return img;
  }
  function banner(team, dark, emoji) {
    const key = 'banner' + team; if (cache[key]) return cache[key];
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 120" width="80" height="240"><rect x="18" y="10" width="4" height="110" fill="#5a3a1b"/><path d="M22 12 h16 l-5 20 l5 20 h-16 z" fill="${team}"/><path d="M22 12 h16 l-5 20 h-11 z" fill="${dark}" opacity=".35"/><circle cx="20" cy="9" r="4" fill="#f5c518"/></svg>`;
    const img = new Image(); img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); cache[key] = img; return img;
  }
  return { get, tree, banner, svgFor };
})();
