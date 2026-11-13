// Product pictures for the shop's example articles: one studio shot per product, drawn as SVG and saved as JPG.
// Run from the repository root (needs Playwright with Chromium and a connection for the fonts):
//   node tools/shop-art.js [id ...]   -> img/shop/<id>.jpg (1000 x 1000 px); without ids: all of them
// To change a picture, edit its drawing below (text, colour) and run it again. A real photo simply replaces the JPG.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const OUT = process.env.OUT || path.join(__dirname, '..', 'img', 'shop');
const FONTS = "@import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:ital,wght@1,800&family=Inter:wght@400;600&display=swap');";

const MINT = '#5ee6a8', BLUE = '#5ab0ff', VIOLET = '#b18cff', ORANGE = '#ff9a4d', PINK = '#ff6b9d', GOLD = '#ffcf5a', WHITE = '#f4f5f7';

const defs = `
<defs>
  <radialGradient id="bg" cx="50%" cy="36%" r="78%"><stop offset="0" stop-color="#5b616e"/><stop offset="0.45" stop-color="#33373f"/><stop offset="1" stop-color="#16181c"/></radialGradient>
  <radialGradient id="shadow"><stop offset="0" stop-color="#000" stop-opacity="0.75"/><stop offset="0.6" stop-color="#000" stop-opacity="0.35"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
  <linearGradient id="cyl" x1="0" x2="1"><stop offset="0" stop-color="#000" stop-opacity=".62"/><stop offset=".14" stop-color="#000" stop-opacity=".18"/><stop offset=".27" stop-color="#fff" stop-opacity=".2"/><stop offset=".36" stop-color="#fff" stop-opacity=".04"/><stop offset=".7" stop-color="#000" stop-opacity=".08"/><stop offset=".88" stop-color="#000" stop-opacity=".34"/><stop offset="1" stop-color="#000" stop-opacity=".68"/></linearGradient>
  <linearGradient id="cylv" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity=".5"/><stop offset=".2" stop-color="#fff" stop-opacity=".16"/><stop offset=".34" stop-color="#fff" stop-opacity="0"/><stop offset=".75" stop-color="#000" stop-opacity=".25"/><stop offset="1" stop-color="#000" stop-opacity=".7"/></linearGradient>
  <linearGradient id="fabric" x1="0" x2="1"><stop offset="0" stop-color="#000" stop-opacity=".45"/><stop offset=".2" stop-color="#fff" stop-opacity=".05"/><stop offset=".5" stop-color="#fff" stop-opacity=".09"/><stop offset=".8" stop-color="#fff" stop-opacity=".03"/><stop offset="1" stop-color="#000" stop-opacity=".5"/></linearGradient>
  <linearGradient id="wood" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="#ecd2a6"/><stop offset=".5" stop-color="#d2ab72"/><stop offset="1" stop-color="#a97f4b"/></linearGradient>
  <linearGradient id="steel" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#f1f3f6"/><stop offset=".45" stop-color="#9aa1ad"/><stop offset="1" stop-color="#5b616c"/></linearGradient>
  <linearGradient id="leather" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="#d9ad76"/><stop offset="1" stop-color="#a87543"/></linearGradient>
  <filter id="soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="14"/></filter>
  <filter id="grain"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="4"/><feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.05 0"/></filter>
</defs>`;

const bg = (shadowY = 835, rx = 300, ry = 34) => `<rect width="1000" height="1000" fill="url(#bg)"/><rect width="1000" height="1000" filter="url(#grain)"/>
  <ellipse cx="500" cy="${shadowY}" rx="${rx}" ry="${ry}" fill="url(#shadow)"/>`;

// The LEVEL-UP mark: the figure on the pull-up bar between two posts (100 x 100 around 0,0)
const logo = (x, y, s, c = WHITE, post = '#aeb3bd') => `<g transform="translate(${x} ${y}) scale(${s})">
  <rect x="-45" y="-50" width="6" height="100" rx="2" fill="${post}"/><rect x="39" y="-50" width="6" height="100" rx="2" fill="${post}"/>
  <rect x="-52" y="-43" width="104" height="4.5" rx="2" fill="${post}"/>
  <path d="M-21 -40 L-19 -22 L-7 -11 M21 -40 L19 -22 L7 -11" fill="none" stroke="${c}" stroke-width="7.5" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="0" cy="-26" r="8.6" fill="${c}"/>
  <path d="M-9.5 -14 H9.5 V38 A4.4 4.4 0 0 1 0.9 38 V10 H-0.9 V38 A4.4 4.4 0 0 1 -9.5 38 Z" fill="${c}"/>
</g>`;

const T = (x, y, s, size, fill = WHITE, o = {}) => `<text x="${x}" y="${y}" text-anchor="${o.anchor || 'middle'}" font-family="${o.sans ? 'Inter' : "'Barlow Condensed'"}" font-weight="${o.weight || (o.sans ? 600 : 800)}" font-style="${o.sans ? 'normal' : 'italic'}" font-size="${size}" fill="${fill}" letter-spacing="${o.ls ?? 1}"${o.len ? ` textLength="${o.len}" lengthAdjust="spacingAndGlyphs"` : ''}${o.op ? ` opacity="${o.op}"` : ''}>${s}</text>`;
// A size that makes a condensed caps line fit a width
const fit = (s, width, max) => Math.min(max, Math.floor(width / (s.length * 0.46)));

const zoom = (k, inner, cy = 510) => `<g transform="translate(500 ${cy}) scale(${k}) translate(-500 ${-cy})">${inner}</g>`;

// ---------- Tub (powders) ----------
function tub({ color, name, name2, tag, foot, lidColor = '#16171b' }) {
  const body = 'M312,292 L312,788 Q500,826 688,788 L688,292 Z';
  const label = 'M312,356 Q500,386 688,356 L688,752 Q500,784 312,752 Z';
  const size = Math.min(fit(name.length > (name2 || '').length ? name : name2, 330, 74), name2 ? 70 : 74);
  const tagY = Math.min(676, 506 + size * (name2 ? 1.86 : 0.98) + 14);
  const ribs = Array.from({ length: 33 }, (_, i) => `<line x1="${302 + i * 12.4}" y1="214" x2="${302 + i * 12.4}" y2="286" stroke="#000" stroke-opacity=".35" stroke-width="3"/>`).join('');
  return `${bg(900, 300, 34)}${zoom(1.24, `
  <clipPath id="tb"><path d="${body}"/></clipPath>
  <path d="${body}" fill="#0d0e10"/>
  <g clip-path="url(#tb)">
    <path d="${label}" fill="#141519"/>
    <path d="M312,356 Q500,386 688,356 L688,372 Q500,402 312,372 Z" fill="${color}"/>
    <path d="M312,736 Q500,768 688,736 L688,752 Q500,784 312,752 Z" fill="${color}"/>
    ${logo(500, 436, 0.66)}
    ${T(500, 506, 'LEVEL-UP', 36, WHITE, { ls: 5 })}
    ${T(500, 506 + size * 0.98, name, size, color)}
    ${name2 ? T(500, 506 + size * 1.86, name2, size, color) : ''}
    ${tag ? `<rect x="${500 - tag.length * 7.4 - 18}" y="${tagY}" width="${tag.length * 14.8 + 36}" height="30" rx="15" fill="${WHITE}"/>${T(500, tagY + 22, tag, 21, '#0b0c0e', { ls: 2 })}` : ''}
    ${foot ? T(500, 728, foot, 15, '#aeb3bd', { sans: true, ls: 1.5 }) : ''}
    <path d="${body}" fill="url(#cyl)"/>
  </g>
  <path d="M296,214 Q296,196 314,194 Q500,178 686,194 Q704,196 704,214 L704,280 Q704,292 692,294 Q500,312 308,294 Q296,292 296,280 Z" fill="${lidColor}"/>
  <clipPath id="lid"><path d="M296,214 Q296,196 314,194 Q500,178 686,194 Q704,196 704,214 L704,280 Q704,292 692,294 Q500,312 308,294 Q296,292 296,280 Z"/></clipPath>
  <g clip-path="url(#lid)">${ribs}<rect x="296" y="180" width="408" height="130" fill="url(#cyl)"/><ellipse cx="500" cy="196" rx="204" ry="15" fill="#fff" opacity=".1"/></g>`)}`;
}

// ---------- Jar (capsules) ----------
function jar({ color, name, name2, foot }) {
  const body = 'M372,372 Q372,340 404,334 L596,334 Q628,340 628,372 L628,780 Q500,812 372,780 Z';
  const size = fit(name.length > (name2 || '').length ? name : name2, 220, 64);
  const ribs = Array.from({ length: 19 }, (_, i) => `<line x1="${402 + i * 11}" y1="246" x2="${402 + i * 11}" y2="330" stroke="#000" stroke-opacity=".22" stroke-width="3"/>`).join('');
  return `${bg(900, 250, 30)}${zoom(1.36, `
  <clipPath id="jb"><path d="${body}"/></clipPath>
  <path d="${body}" fill="#17110c"/>
  <g clip-path="url(#jb)">
    <path d="M372,420 Q500,444 628,420 L628,738 Q500,766 372,738 Z" fill="${WHITE}"/>
    <path d="M372,420 Q500,444 628,420 L628,470 Q500,494 372,470 Z" fill="#101114"/>
    ${T(500, 472, 'LEVEL-UP', 30, WHITE, { ls: 4 })}
    ${logo(500, 548, 0.62, '#0b0c0e', '#3a3f49')}
    ${T(500, name2 ? 628 : 650, name, size, '#0b0c0e')}
    ${name2 ? T(500, 628 + size * 0.9, name2, size, '#0b0c0e') : ''}
    <path d="M372,700 Q500,728 628,700 L628,738 Q500,766 372,738 Z" fill="${color}"/>
    ${T(500, 746, foot, 20, '#0b0c0e', { ls: 2 })}
    <path d="${body}" fill="url(#cyl)"/>
  </g>
  <path d="M398,252 Q398,238 412,236 Q500,228 588,236 Q602,238 602,252 L602,326 Q602,336 592,337 Q500,346 408,337 Q398,336 398,326 Z" fill="#e9ebef"/>
  <clipPath id="jc"><path d="M398,252 Q398,238 412,236 Q500,228 588,236 Q602,238 602,252 L602,326 Q602,336 592,337 Q500,346 408,337 Q398,336 398,326 Z"/></clipPath>
  <g clip-path="url(#jc)">${ribs}<rect x="398" y="226" width="204" height="120" fill="url(#cyl)" opacity=".8"/></g>`, 520)}`;
}

function barbox({ color }) {
  return `${bg(880, 360, 34)}${zoom(1.12, `
  <path d="M250,300 L312,238 L772,238 L720,300 Z" fill="#2b2e35"/>
  <path d="M720,300 L772,238 L772,612 L720,680 Z" fill="#090a0b"/>
  <rect x="250" y="300" width="470" height="380" fill="#141519"/>
  <rect x="250" y="300" width="470" height="18" fill="${color}"/>
  ${logo(485, 384, 0.72)}
  ${T(485, 468, 'LEVEL-UP', 40, WHITE, { ls: 5 })}
  ${T(485, 540, 'PROTEIN BAR', 68, color)}
  ${T(485, 584, 'CHOCOLATE · CARAMEL', 23, WHITE, { ls: 3, op: 0.85 })}
  <rect x="250" y="622" width="470" height="58" fill="${color}"/>
  ${T(485, 662, '12 × 55 G', 30, '#0b0c0e', { ls: 4 })}
  <rect x="250" y="300" width="470" height="380" fill="url(#fabric)" opacity=".6"/>
  <g transform="rotate(-7 470 790)">
    <path d="M196,752 l-36,10 l0,62 l36,10 Z M744,752 l36,10 l0,62 l-36,10 Z" fill="#101114"/>
    <g stroke="#000" stroke-opacity=".55" stroke-width="2">${Array.from({ length: 7 }, (_, i) => `<line x1="${164 + i * 4.6}" y1="760" x2="${164 + i * 4.6}" y2="826"/><line x1="${748 + i * 4.6}" y1="760" x2="${748 + i * 4.6}" y2="826"/>`).join('')}</g>
    <rect x="196" y="752" width="548" height="82" rx="8" fill="#17181c"/>
    <rect x="196" y="752" width="548" height="12" fill="${color}"/>
    ${logo(250, 801, 0.42)}
    ${T(300, 814, 'LEVEL-UP PROTEIN BAR', 36, WHITE, { ls: 3, anchor: 'start' })}
    ${T(722, 812, '55 G', 24, color, { ls: 2, anchor: 'end' })}
    <rect x="196" y="752" width="548" height="82" rx="8" fill="url(#cylv)" opacity=".6"/>
  </g>`, 540)}`;
}

function shaker({ color }) {
  const cup = 'M384,318 L616,318 L598,786 Q500,812 402,786 Z';
  const marks = [[372, '600'], [432, '400'], [492, '200']].map(([y, ml]) => `<line x1="${572 - (y - 318) * 0.035}" y1="${y}" x2="${606 - (y - 318) * 0.038}" y2="${y}" stroke="#fff" stroke-opacity=".75" stroke-width="3"/>${T(564 - (y - 318) * 0.035, y + 7, ml, 18, '#fff', { anchor: 'end', sans: true, ls: 0, op: 0.75 })}`).join('');
  return `${bg(900, 250, 30)}${zoom(1.22, `
  <clipPath id="sc"><path d="${cup}"/></clipPath>
  <path d="${cup}" fill="#30343d"/>
  <g clip-path="url(#sc)">
    <rect x="370" y="610" width="260" height="220" fill="#1d2026"/>
    <path d="M384,610 Q500,624 616,610" fill="none" stroke="#fff" stroke-opacity=".14" stroke-width="3"/>
    ${logo(458, 452, 0.8)}
    ${T(500, 566, 'LEVEL-UP', 40, WHITE, { ls: 5 })}
    <rect x="450" y="582" width="100" height="5" rx="2.5" fill="${color}"/>
    ${marks}
    ${T(500, 748, '700 ML', 20, '#aeb3bd', { sans: true, ls: 3 })}
    <path d="${cup}" fill="url(#cyl)"/>
  </g>
  <path d="M370,262 Q370,248 384,246 L616,246 Q630,248 630,262 L630,312 Q630,322 620,322 L380,322 Q370,322 370,312 Z" fill="#101114"/>
  <rect x="370" y="246" width="260" height="76" rx="12" fill="url(#cyl)" opacity=".8"/>
  <rect x="370" y="302" width="260" height="8" fill="${color}"/>
  <path d="M440,246 L440,206 Q440,190 456,190 L544,190 Q560,190 560,206 L560,246 Z" fill="#17181c"/>
  <rect x="440" y="190" width="120" height="56" rx="14" fill="url(#cyl)" opacity=".7"/>
  <path d="M560,214 Q612,196 618,246" fill="none" stroke="#17181c" stroke-width="13" stroke-linecap="round"/>
  <rect x="470" y="170" width="60" height="26" rx="9" fill="${color}"/>`, 500)}`;
}

// ---------- Clothes ----------
const stitch = (d, c = '#fff', op = 0.22) => `<path d="${d}" fill="none" stroke="${c}" stroke-opacity="${op}" stroke-width="2.5" stroke-dasharray="7 6"/>`;

function tank({ color }) {
  const d = 'M410,178 L372,178 C374,300 362,372 300,436 L300,828 Q500,852 700,828 L700,436 C638,372 626,300 628,178 L590,178 C584,286 548,330 500,330 C452,330 416,286 410,178 Z';
  return `${bg(858, 290, 26)}
  <clipPath id="tk"><path d="${d}"/></clipPath>
  <path d="${d}" fill="#111216"/>
  <g clip-path="url(#tk)">
    <rect x="290" y="170" width="420" height="700" fill="url(#fabric)"/>
    <path d="M300,560 C380,600 420,700 400,860 M700,560 C620,600 580,700 600,860" fill="none" stroke="#000" stroke-opacity=".28" stroke-width="26" filter="url(#soft)"/>
    ${logo(500, 520, 1.5)}
    ${T(500, 664, 'LEVEL-UP', 58, WHITE, { ls: 6 })}
    <rect x="445" y="684" width="110" height="6" rx="3" fill="${color}"/>
  </g>
  ${stitch('M300,806 Q500,830 700,806')}
  ${stitch('M421,186 C428,290 460,340 500,340 C540,340 572,290 579,186', '#fff', 0.18)}
  ${stitch('M384,186 C386,304 372,378 312,440', '#fff', 0.18)}${stitch('M616,186 C614,304 628,378 688,440', '#fff', 0.18)}`;
}

function shorts({ color }) {
  const d = 'M296,290 L272,726 Q376,750 482,732 L500,500 L518,732 Q624,750 728,726 L704,290 Z';
  return `${bg(850, 340, 28)}${zoom(1.2, `
  <clipPath id="sh"><path d="${d}"/></clipPath>
  <path d="${d}" fill="#17191d"/>
  <g clip-path="url(#sh)">
    <rect x="260" y="280" width="480" height="480" fill="url(#fabric)"/>
    <path d="M500,330 L500,520" stroke="#000" stroke-opacity=".55" stroke-width="5"/>
    <path d="M318,290 L296,728 L306,730 L328,290 Z" fill="${color}"/>
    <path d="M682,290 L704,728 L694,730 L672,290 Z" fill="${color}"/>
    <path d="M430,330 C420,470 410,560 400,740 M570,330 C580,470 590,560 600,740" fill="none" stroke="#000" stroke-opacity=".25" stroke-width="22" filter="url(#soft)"/>
    ${logo(392, 640, 0.6)}
    ${T(612, 660, 'LEVEL-UP', 32, WHITE, { ls: 4 })}
  </g>
  <rect x="290" y="244" width="420" height="52" rx="10" fill="#1f2228"/>
  <rect x="290" y="244" width="420" height="52" rx="10" fill="url(#fabric)"/>
  <g stroke="#000" stroke-opacity=".35" stroke-width="2">${Array.from({ length: 34 }, (_, i) => `<line x1="${300 + i * 12.2}" y1="248" x2="${300 + i * 12.2}" y2="292"/>`).join('')}</g>
  <path d="M478,292 C470,340 462,372 468,404 M522,292 C530,340 540,366 532,410" fill="none" stroke="${WHITE}" stroke-width="6" stroke-linecap="round"/>
  <circle cx="468" cy="408" r="6" fill="${color}"/><circle cx="532" cy="414" r="6" fill="${color}"/>
  ${stitch('M276,704 Q378,726 480,710')}${stitch('M520,710 Q622,726 724,704')}`, 490)}`;
}

function cap({ color }) {
  const crown = 'M236,628 C222,430 330,300 490,296 C640,292 742,394 752,566 L754,628 Q500,600 236,628 Z';
  const peak = 'M716,566 C810,566 900,606 930,668 C852,690 774,676 700,646 Z';
  return `${bg(730, 360, 30)}
  <path d="${peak}" fill="#0d0e10"/>
  <path d="M716,566 C810,566 900,606 930,668" fill="none" stroke="#fff" stroke-opacity=".16" stroke-width="5"/>
  ${stitch('M720,590 C800,592 868,622 900,662', '#fff', 0.2)}
  <clipPath id="cp"><path d="${crown}"/></clipPath>
  <path d="${crown}" fill="#16181c"/>
  <g clip-path="url(#cp)">
    <rect x="200" y="280" width="580" height="360" fill="url(#fabric)" opacity=".9"/>
    <path d="M490,296 C420,380 392,500 392,640 M490,296 C590,360 632,480 640,640" fill="none" stroke="#000" stroke-opacity=".55" stroke-width="4"/>
    ${stitch('M398,640 C398,500 428,384 494,304', '#fff', 0.12)}${stitch('M632,640 C624,486 584,366 488,302', '#fff', 0.12)}
    <ellipse cx="330" cy="470" rx="7" ry="6" fill="#050506"/><ellipse cx="456" cy="372" rx="7" ry="6" fill="#050506"/>
    <path d="M236,628 Q500,600 754,628 L754,606 Q500,578 236,606 Z" fill="${color}"/>
    ${logo(574, 470, 1.02)}
    <path d="M236,640 C240,592 300,566 336,640 Z" fill="#33373f"/>
    <path d="M240,612 Q292,590 332,624" fill="none" stroke="#0d0e10" stroke-width="16"/>
  </g>
  <ellipse cx="490" cy="296" rx="19" ry="8" fill="#23262d"/>
  ${T(700, 560, 'LEVEL-UP', 17, '#aeb3bd', { ls: 3 }).replace('<text', '<text transform="rotate(84 700 560)"')}`;
}

function socks({ color }) {
  const sock = 'M0,0 L132,0 L132,372 C132,410 150,430 186,448 L276,494 C332,522 330,604 264,612 L160,612 C62,612 0,548 0,452 Z';
  const one = (fill, ink, x, y, rot, id) => `<g transform="translate(${x} ${y}) rotate(${rot})">
    <clipPath id="${id}"><path d="${sock}"/></clipPath>
    <path d="${sock}" fill="${fill}"/>
    <g clip-path="url(#${id})">
      <rect x="-10" y="28" width="160" height="16" fill="${color}"/><rect x="-10" y="56" width="160" height="16" fill="${ink}"/>
      <g stroke="${ink}" stroke-opacity=".16" stroke-width="2">${Array.from({ length: 13 }, (_, i) => `<line x1="${6 + i * 10.4}" y1="0" x2="${6 + i * 10.4}" y2="20"/>`).join('')}</g>
      ${logo(66, 190, 0.74, ink, ink === WHITE ? '#aeb3bd' : '#3a3f49')}
      ${T(66, 286, 'LEVEL-UP', 26, ink, { ls: 3 })}
      <path d="M150,612 C80,600 20,540 14,452" fill="none" stroke="${ink}" stroke-opacity=".14" stroke-width="30"/>
      <path d="M232,470 C290,500 300,580 262,612 L340,612 L340,470 Z" fill="${ink}" opacity=".12"/>
      <rect x="-20" y="-10" width="380" height="640" fill="url(#fabric)" opacity=".8"/>
    </g></g>`;
  return `${bg(840, 320, 28)}
  ${one('#15161a', WHITE, 478, 140, 9, 'sk1')}
  ${one('#eef0f3', '#0b0c0e', 232, 200, -6, 'sk2')}`;
}

function gymbag({ color }) {
  return `${bg(830, 400, 34)}
  <path d="M340,440 C340,236 660,236 660,440" fill="none" stroke="#0c0d0f" stroke-width="30" stroke-linecap="round"/>
  <path d="M340,440 C340,236 660,236 660,440" fill="none" stroke="#fff" stroke-opacity=".08" stroke-width="5"/>
  <rect x="130" y="400" width="740" height="390" rx="100" fill="#16181c"/>
  <clipPath id="gb"><rect x="130" y="400" width="740" height="390" rx="100"/></clipPath>
  <g clip-path="url(#gb)">
    <rect x="130" y="400" width="740" height="390" fill="url(#cylv)" opacity=".85"/>
    <rect x="130" y="400" width="130" height="390" fill="#0c0d0f" opacity=".7"/><rect x="740" y="400" width="130" height="390" fill="#0c0d0f" opacity=".7"/>
    <rect x="256" y="400" width="8" height="390" fill="${color}"/><rect x="736" y="400" width="8" height="390" fill="${color}"/>
    <path d="M190,452 L810,452" stroke="#2b2e35" stroke-width="12"/><path d="M190,452 L810,452" stroke="#8f95a1" stroke-width="2.5" stroke-dasharray="5 4"/>
    <rect x="322" y="452" width="36" height="340" fill="#0c0d0f"/><rect x="642" y="452" width="36" height="340" fill="#0c0d0f"/>
    ${stitch('M330,460 L330,790 M350,460 L350,790 M650,460 L650,790 M670,460 L670,790', '#fff', 0.2)}
    ${logo(500, 592, 1.05)}
    ${T(500, 706, 'LEVEL-UP', 52, WHITE, { ls: 6 })}
    ${T(500, 744, 'TRAIN HARD', 22, color, { ls: 7 })}
  </g>
  <rect x="664" y="436" width="40" height="32" rx="6" fill="url(#steel)"/>
  <path d="M358,440 C358,280 642,280 642,440" fill="none" stroke="#1f2228" stroke-width="30" stroke-linecap="round"/>
  <path d="M358,440 C358,280 642,280 642,440" fill="none" stroke="#fff" stroke-opacity=".08" stroke-width="5"/>
  <rect x="440" y="298" width="120" height="46" rx="16" fill="#2b2e35"/>
  ${stitch('M452,321 L548,321', '#fff', 0.25)}
  <rect x="146" y="570" width="34" height="50" rx="8" fill="url(#steel)"/><rect x="820" y="570" width="34" height="50" rx="8" fill="url(#steel)"/>`;
}

function towel({ color }) {
  return `${bg(790, 340, 30)}
  <rect x="214" y="640" width="572" height="110" rx="34" fill="#c9ccd3"/>
  <rect x="206" y="560" width="588" height="130" rx="40" fill="#dfe2e7"/>
  <rect x="198" y="330" width="604" height="320" rx="46" fill="#f1f3f6"/>
  <clipPath id="tw"><rect x="198" y="330" width="604" height="320" rx="46"/></clipPath>
  <g clip-path="url(#tw)">
    <rect x="198" y="330" width="604" height="320" fill="url(#cylv)" opacity=".35"/>
    <rect x="198" y="548" width="604" height="14" fill="${color}"/><rect x="198" y="574" width="604" height="40" fill="#101114"/><rect x="198" y="626" width="604" height="14" fill="${color}"/>
    ${T(500, 606, 'LEVEL-UP · TRAIN HARD · LEVEL-UP · TRAIN HARD', 24, WHITE, { ls: 4 })}
    ${logo(500, 438, 1.2, '#101114', '#5b616c')}
    <g stroke="#000" stroke-opacity=".05" stroke-width="3">${Array.from({ length: 40 }, (_, i) => `<line x1="${206 + i * 15}" y1="330" x2="${206 + i * 15}" y2="540"/>`).join('')}</g>
  </g>
  <path d="M206,660 Q500,700 794,660" fill="none" stroke="#000" stroke-opacity=".18" stroke-width="5"/>
  <path d="M214,724 Q500,756 786,724" fill="none" stroke="#000" stroke-opacity=".15" stroke-width="4"/>`;
}

// ---------- Tools ----------
function rings({ color }) {
  const ring = (cx, cy) => `<circle cx="${cx}" cy="${cy}" r="124" fill="none" stroke="url(#wood)" stroke-width="40"/>
    <circle cx="${cx}" cy="${cy}" r="143" fill="none" stroke="#000" stroke-opacity=".25" stroke-width="3"/>
    <circle cx="${cx}" cy="${cy}" r="105" fill="none" stroke="#000" stroke-opacity=".3" stroke-width="3"/>
    <path d="M${cx - 96},${cy - 86} A130,130 0 0 1 ${cx + 60},${cy - 114}" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="7" stroke-linecap="round"/>
    <g fill="none" stroke="#7a5a30" stroke-opacity=".35" stroke-width="2">
      <path d="M${cx - 120},${cy + 44} A128,128 0 0 0 ${cx - 20},${cy + 126}"/><path d="M${cx + 30},${cy + 121} A124,124 0 0 0 ${cx + 118},${cy + 38}"/><path d="M${cx + 112},${cy - 62} A128,128 0 0 0 ${cx + 84},${cy - 96}"/>
    </g>`;
  const strap = (x, cy, buckleY) => `<rect x="${x - 23}" y="-10" width="46" height="${cy - 124 + 10}" fill="#101114"/>
    <rect x="${x - 23}" y="-10" width="46" height="${cy - 124 + 10}" fill="url(#cyl)" opacity=".5"/>
    <g fill="${WHITE}" opacity=".85">${Array.from({ length: 9 }, (_, i) => `<rect x="${x - 11}" y="${40 + i * 52}" width="22" height="4"/>`).join('')}</g>
    ${[1, 3, 5, 7].map((n, i) => T(x, 78 + i * 104, String(n * 5), 17, WHITE, { sans: true, ls: 0, op: 0.8 })).join('')}
    <rect x="${x - 34}" y="${buckleY}" width="68" height="58" rx="8" fill="url(#steel)"/><rect x="${x - 23}" y="${buckleY + 14}" width="46" height="12" fill="#101114"/>
    <rect x="${x - 34}" y="${buckleY + 40}" width="68" height="8" fill="${color}"/>`;
  const wrap = (x, cy) => `<path d="M${x - 23},${cy - 150} L${x + 23},${cy - 150} L${x + 23},${cy - 100} Q${x},${cy - 92} ${x - 23},${cy - 100} Z" fill="#17181c"/><rect x="${x - 23}" y="${cy - 150}" width="46" height="6" fill="#000" opacity=".4"/>`;
  return `${bg(880, 360, 30)}
  ${strap(330, 640, 250)}${strap(670, 640, 330)}
  ${ring(330, 640)}${ring(670, 640)}
  ${wrap(330, 640)}${wrap(670, 640)}
  ${T(330, 792, 'LEVEL-UP', 19, '#6b4c24', { ls: 3 })}${T(670, 792, 'LEVEL-UP', 19, '#6b4c24', { ls: 3 })}`;
}

function rope({ color }) {
  const handle = (x, y, rot) => `<g transform="translate(${x} ${y}) rotate(${rot})">
    <rect x="-29" y="-380" width="58" height="380" rx="25" fill="#16181c"/>
    <rect x="-29" y="-380" width="58" height="380" rx="25" fill="url(#cyl)"/>
    <g stroke="#000" stroke-opacity=".6" stroke-width="4">${Array.from({ length: 12 }, (_, i) => `<line x1="-29" y1="${-340 + i * 16}" x2="29" y2="${-340 + i * 16}"/>`).join('')}</g>
    <rect x="-29" y="-136" width="58" height="16" fill="${color}"/>
    ${T(0, -62, 'LEVEL-UP', 25, WHITE, { ls: 3 }).replace('<text', '<text transform="rotate(-90 0 -62)" dominant-baseline="middle"')}
    <rect x="-17" y="-8" width="34" height="34" rx="7" fill="url(#steel)"/>
    <circle cx="0" cy="34" r="11" fill="#aeb3bd"/><circle cx="0" cy="34" r="5" fill="#3a3f49"/>
  </g>`;
  const cable = 'M352,520 C90,620 170,905 500,905 C830,905 910,620 648,520';
  const coil = 'M352,520 C210,600 250,840 500,840 C750,840 790,600 648,520';
  return `${bg(916, 360, 26)}
  <path d="${cable}" fill="none" stroke="#000" stroke-opacity=".55" stroke-width="12" filter="url(#soft)" transform="translate(0 14)"/>
  <path d="${coil}" fill="none" stroke="#17181c" stroke-width="9" stroke-linecap="round"/>
  <path d="${coil}" fill="none" stroke="#aeb3bd" stroke-width="2" stroke-linecap="round" transform="translate(-2 -3)"/>
  <path d="${cable}" fill="none" stroke="#17181c" stroke-width="10" stroke-linecap="round"/>
  <path d="${cable}" fill="none" stroke="#c9ccd3" stroke-width="2.5" stroke-linecap="round" transform="translate(-2 -3)"/>
  ${handle(366, 486, -20)}${handle(634, 486, 20)}`;
}

function chalk({ color }) {
  const body = 'M392,330 Q392,300 422,298 L578,298 Q608,300 608,330 L608,790 Q500,816 392,790 Z';
  return `${bg(900, 240, 30)}${zoom(1.22, `
  <clipPath id="ck"><path d="${body}"/></clipPath>
  <path d="${body}" fill="#eef0f3"/>
  <g clip-path="url(#ck)">
    <path d="M392,400 Q500,420 608,400 L608,712 Q500,734 392,712 Z" fill="#101114"/>
    <path d="M392,400 Q500,420 608,400 L608,414 Q500,434 392,414 Z" fill="${color}"/>
    ${logo(500, 492, 0.72)}
    ${T(500, 578, 'LEVEL-UP', 32, WHITE, { ls: 4 })}
    ${T(500, 634, 'LIQUID', 56, color)}${T(500, 684, 'CHALK', 56, color)}
    ${T(500, 768, '200 ML', 22, '#3a3f49', { ls: 3 })}
    <path d="${body}" fill="url(#cyl)" opacity=".75"/>
  </g>
  <path d="M440,214 Q440,200 454,200 L546,200 Q560,200 560,214 L560,300 L440,300 Z" fill="#131418"/>
  <rect x="440" y="200" width="120" height="100" rx="12" fill="url(#cyl)" opacity=".8"/>
  <rect x="440" y="284" width="120" height="8" fill="${color}"/>
  <rect x="470" y="182" width="60" height="22" rx="8" fill="#23262d"/>`, 500)}`;
}

function wraps({ color }) {
  const turns = Array.from({ length: 9 }, (_, i) => `<circle cx="0" cy="0" r="${24 + i * 11}" fill="none" stroke="#565c68" stroke-width="2"/>`).join('');
  return `${bg(880, 360, 30)}
  <g transform="rotate(-16 430 470)">
    <clipPath id="wr1"><rect x="130" y="390" width="700" height="150" rx="14"/></clipPath>
    <path d="M830,430 C930,400 930,530 830,500" fill="none" stroke="#2b2e35" stroke-width="16" stroke-linecap="round"/>
    <rect x="130" y="390" width="700" height="150" rx="14" fill="#17191d"/>
    <g clip-path="url(#wr1)">
      <rect x="130" y="390" width="700" height="20" fill="${color}"/><rect x="130" y="520" width="700" height="20" fill="${color}"/>
      <rect x="130" y="424" width="700" height="6" fill="${WHITE}" opacity=".8"/><rect x="130" y="500" width="700" height="6" fill="${WHITE}" opacity=".8"/>
      <g stroke="#000" stroke-opacity=".3" stroke-width="2">${Array.from({ length: 70 }, (_, i) => `<line x1="${134 + i * 10}" y1="390" x2="${134 + i * 10}" y2="540"/>`).join('')}</g>
      <rect x="130" y="390" width="150" height="150" fill="#d6d9df"/>
      <g fill="#000" opacity=".22">${Array.from({ length: 126 }, (_, i) => `<circle cx="${140 + (i % 14) * 10}" cy="${400 + Math.floor(i / 14) * 16}" r="2.6"/>`).join('')}</g>
      <rect x="470" y="412" width="190" height="106" rx="8" fill="#0b0c0e"/>
      ${logo(506, 465, 0.56)}
      ${T(598, 476, 'LEVEL-UP', 25, WHITE, { ls: 2 })}
      <rect x="130" y="390" width="700" height="150" fill="url(#cylv)" opacity=".35"/>
    </g>
  </g>
  <g transform="translate(610 706)">
    <path d="M-118,96 L150,96 Q170,96 170,116 L170,128 L-118,128 Z" fill="#17191d"/>
    <rect x="96" y="96" width="74" height="32" fill="#d6d9df"/>
    <circle cx="0" cy="0" r="124" fill="#17191d"/>
    <circle cx="0" cy="0" r="124" fill="none" stroke="${color}" stroke-width="7"/>
    ${turns}
    <circle cx="0" cy="0" r="15" fill="#0b0c0e"/>
    <path d="M-88,-88 A124,124 0 0 1 60,-108" fill="none" stroke="#fff" stroke-opacity=".2" stroke-width="6" stroke-linecap="round"/>
  </g>`;
}

function grips({ color }) {
  const one = (x, y, rot, id) => `<g transform="translate(${x} ${y}) rotate(${rot})">
    <path d="M-92,-250 Q-92,-290 -52,-290 L52,-290 Q92,-290 92,-250 L74,60 L-74,60 Z" fill="url(#leather)"/>
    <clipPath id="${id}"><path d="M-92,-250 Q-92,-290 -52,-290 L52,-290 Q92,-290 92,-250 L74,60 L-74,60 Z"/></clipPath>
    <g clip-path="url(#${id})"><rect x="-100" y="-300" width="200" height="380" filter="url(#grain)" opacity=".9"/><rect x="-100" y="-300" width="200" height="380" fill="url(#fabric)" opacity=".5"/></g>
    <ellipse cx="-36" cy="-226" rx="24" ry="30" fill="#17191d"/><ellipse cx="36" cy="-226" rx="24" ry="30" fill="#17191d"/>
    <ellipse cx="-36" cy="-226" rx="24" ry="30" fill="none" stroke="#7a5326" stroke-width="3"/><ellipse cx="36" cy="-226" rx="24" ry="30" fill="none" stroke="#7a5326" stroke-width="3"/>
    ${stitch('M-80,-250 Q-80,-278 -52,-278 L52,-278 Q80,-278 80,-250 L64,48 L-64,48 Z', '#5d3d18', 0.7)}
    ${logo(0, -92, 0.74, '#3d2710', '#6d4a22')}
    ${T(0, -10, 'LEVEL-UP', 24, '#3d2710', { ls: 3 })}
    <rect x="-112" y="56" width="224" height="92" rx="14" fill="#131418"/>
    <rect x="-112" y="56" width="224" height="92" rx="14" fill="url(#cyl)" opacity=".6"/>
    <rect x="-112" y="64" width="224" height="7" fill="${color}"/>
    <rect x="34" y="78" width="66" height="56" rx="6" fill="#3a3f49"/>
    <rect x="-96" y="84" width="20" height="44" rx="5" fill="none" stroke="url(#steel)" stroke-width="6"/>
  </g>`;
  return `${bg(850, 330, 28)}
  ${one(350, 620, -10, 'gr1')}${one(650, 620, 10, 'gr2')}`;
}

function roller({ color }) {
  const blocks = [];
  for (let r = 0; r < 5; r++) for (let c = 0; c < 9; c++) blocks.push(`<rect x="${214 + c * 62 + (r % 2) * 31}" y="${392 + r * 46}" width="44" height="30" rx="9" fill="#000" opacity=".3"/><rect x="${214 + c * 62 + (r % 2) * 31}" y="${390 + r * 46}" width="44" height="6" rx="3" fill="#fff" opacity=".06"/>`);
  return `${bg(780, 400, 32)}${zoom(1.16, `
  <g transform="rotate(-9 500 500)">
    <clipPath id="rl"><path d="M230,380 L790,380 A44,120 0 0 1 790,620 L230,620 A44,120 0 0 1 230,380 Z"/></clipPath>
    <path d="M230,380 L790,380 A44,120 0 0 1 790,620 L230,620 A44,120 0 0 1 230,380 Z" fill="#17181c"/>
    <g clip-path="url(#rl)">${blocks.join('')}
      <rect x="150" y="380" width="700" height="240" fill="url(#cylv)"/>
      <rect x="470" y="380" width="14" height="240" fill="${color}" opacity=".9"/><rect x="494" y="380" width="5" height="240" fill="${color}" opacity=".9"/>
    </g>
    <ellipse cx="230" cy="500" rx="44" ry="120" fill="#101114"/>
    <ellipse cx="230" cy="500" rx="44" ry="120" fill="none" stroke="#2b2e35" stroke-width="4"/>
    <ellipse cx="230" cy="500" rx="27" ry="76" fill="${color}"/>
    <ellipse cx="230" cy="500" rx="20" ry="58" fill="#050506"/>
    ${T(640, 512, 'LEVEL-UP', 46, WHITE, { ls: 5, op: 0.92 })}
  </g>`, 500)}`;
}

function bands() {
  const band = (c, y, rot, label, id) => `<g transform="rotate(${rot} 500 ${y})">
    <rect x="200" y="${y - 62}" width="600" height="124" rx="62" fill="${c}"/>
    <rect x="200" y="${y - 62}" width="600" height="124" rx="62" fill="url(#cylv)" opacity=".55"/>
    <rect x="236" y="${y - 30}" width="528" height="60" rx="30" fill="#101216"/>
    <rect x="236" y="${y - 30}" width="528" height="60" rx="30" fill="none" stroke="#000" stroke-opacity=".5" stroke-width="5"/>
    ${T(500, y - 39, 'LEVEL-UP · ' + label, 19, '#0b0c0e', { ls: 4 })}
  </g>`;
  return `${bg(800, 380, 30)}
  ${band(VIOLET, 340, -7, 'HEAVY')}${band(BLUE, 500, 4, 'MEDIUM')}${band(MINT, 660, -3, 'LIGHT')}`;
}

// ---------- The fridge: can, bottle, single bar, cup and pouch ----------
function can({ color, name, name2, foot = '330 ML', base = '#101114', ink = WHITE }) {
  const body = 'M392,304 Q392,268 424,252 L576,252 Q608,268 608,304 L608,772 Q608,802 578,810 L422,810 Q392,802 392,772 Z';
  const size = Math.min(fit(name.length > (name2 || '').length ? name : name2, 190, 62), 62);
  return `${bg(880, 230, 28)}${zoom(1.3, `
  <clipPath id="cn"><path d="${body}"/></clipPath>
  <path d="${body}" fill="${base}"/>
  <g clip-path="url(#cn)">
    <rect x="392" y="330" width="216" height="16" fill="${color}"/><rect x="392" y="728" width="216" height="16" fill="${color}"/>
    ${logo(500, 418, 0.6, ink, base === '#101114' ? '#aeb3bd' : '#3a3f49')}
    ${T(500, 492, 'LEVEL-UP', 30, ink, { ls: 4 })}
    ${T(500, 492 + size * 1.02, name, size, color)}
    ${name2 ? T(500, 492 + size * 1.92, name2, size, color) : ''}
    ${T(500, 712, foot, 15, base === '#101114' ? '#aeb3bd' : '#3a3f49', { sans: true, ls: 2 })}
    <path d="${body}" fill="url(#cyl)"/>
  </g>
  <ellipse cx="500" cy="254" rx="80" ry="13" fill="url(#steel)"/>
  <ellipse cx="500" cy="252" rx="64" ry="9" fill="#7d8491"/>
  <ellipse cx="512" cy="251" rx="20" ry="5" fill="#3a3f49"/>
  <path d="M484,250 a14,5 0 1 0 28,0" fill="none" stroke="#e9ebef" stroke-width="3"/>`, 520)}`;
}

function bottle({ color, name, name2, foot = '500 ML', body = '#eef0f3', label = '#101114', cap = '#101114', clear = false }) {
  const d = 'M452,236 L548,236 L548,296 C548,336 604,356 604,416 L604,772 Q604,806 570,810 L430,810 Q396,806 396,772 L396,416 C396,356 452,336 452,296 Z';
  const size = Math.min(fit(name.length > (name2 || '').length ? name : name2, 180, 56), 56);
  return `${bg(880, 230, 28)}${zoom(1.26, `
  <clipPath id="bt"><path d="${d}"/></clipPath>
  <path d="${d}" fill="${clear ? '#9fd4ff' : body}" ${clear ? 'opacity=".42"' : ''}/>
  <g clip-path="url(#bt)">
    ${clear ? '<rect x="396" y="330" width="208" height="480" fill="#cfeaff" opacity=".22"/><path d="M396,372 Q500,388 604,372" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="3"/>' : ''}
    <rect x="396" y="456" width="208" height="262" fill="${label}"/>
    <rect x="396" y="456" width="208" height="12" fill="${color}"/><rect x="396" y="706" width="208" height="12" fill="${color}"/>
    ${logo(500, 518, 0.5)}
    ${T(500, 578, 'LEVEL-UP', 26, WHITE, { ls: 4 })}
    ${T(500, 578 + size * 1.02, name, size, color)}
    ${name2 ? T(500, 578 + size * 1.9, name2, size, color) : ''}
    ${T(500, 760, foot, 15, clear ? '#e9ebef' : '#3a3f49', { sans: true, ls: 2 })}
    <path d="${d}" fill="url(#cyl)" opacity="${clear ? 0.55 : 0.8}"/>
  </g>
  <rect x="444" y="186" width="112" height="54" rx="9" fill="${cap}"/>
  <rect x="444" y="186" width="112" height="54" rx="9" fill="url(#cyl)" opacity=".7"/>
  <g stroke="#000" stroke-opacity=".3" stroke-width="2">${Array.from({ length: 11 }, (_, i) => `<line x1="${452 + i * 9.6}" y1="190" x2="${452 + i * 9.6}" y2="236"/>`).join('')}</g>`, 500)}`;
}

function onebar({ color }) {
  return `${bg(720, 420, 32)}
  <g transform="rotate(-10 500 500) translate(500 500) scale(1.08) translate(-500 -500)">
    <path d="M168,420 l-44,14 l0,132 l44,14 Z M832,420 l44,14 l0,132 l-44,14 Z" fill="#101114"/>
    <g stroke="#000" stroke-opacity=".55" stroke-width="3">${Array.from({ length: 7 }, (_, i) => `<line x1="${130 + i * 5.6}" y1="436" x2="${130 + i * 5.6}" y2="564"/><line x1="${838 + i * 5.6}" y1="436" x2="${838 + i * 5.6}" y2="564"/>`).join('')}</g>
    <rect x="168" y="412" width="664" height="176" rx="14" fill="#17181c"/>
    <rect x="168" y="412" width="664" height="24" fill="${color}"/>
    ${logo(262, 512, 0.9)}
    ${T(340, 500, 'LEVEL-UP', 44, WHITE, { ls: 5, anchor: 'start' })}
    ${T(340, 562, 'PROTEIN BAR', 62, color, { anchor: 'start' })}
    ${T(806, 562, '55 G', 30, WHITE, { ls: 2, anchor: 'end', op: 0.85 })}
    <rect x="168" y="412" width="664" height="176" rx="14" fill="url(#cylv)" opacity=".55"/>
  </g>`;
}

function cup({ color }) {
  const d = 'M352,372 L648,372 L612,770 Q500,800 388,770 Z';
  return `${bg(820, 250, 28)}${zoom(1.12, `
  <clipPath id="cu"><path d="${d}"/></clipPath>
  <path d="${d}" fill="#eef0f3"/>
  <g clip-path="url(#cu)">
    <path d="M340,450 L660,450 L640,700 L360,700 Z" fill="#101114"/>
    <rect x="340" y="450" width="320" height="14" fill="${color}"/>
    ${logo(500, 520, 0.56)}
    ${T(500, 592, 'LEVEL-UP', 28, WHITE, { ls: 4 })}
    ${T(500, 644, 'PROTEIN', 50, color)}${T(500, 688, 'PUDDING', 50, color)}
    ${T(500, 742, '200 G · 20 G PROTEIN', 15, '#3a3f49', { sans: true, ls: 2 })}
    <path d="${d}" fill="url(#cyl)" opacity=".75"/>
  </g>
  <ellipse cx="500" cy="372" rx="158" ry="22" fill="url(#steel)"/>
  <ellipse cx="500" cy="370" rx="146" ry="17" fill="#d6d9df"/>
  <path d="M640,366 q34,-6 44,-30" fill="none" stroke="#c9ccd3" stroke-width="14" stroke-linecap="round"/>
  ${T(500, 377, 'LEVEL-UP', 17, '#6b7280', { ls: 4 })}`, 540)}`;
}

function pouch({ color, name, name2, foot, k = 1.1, tag }) {
  const d = 'M322,250 L678,250 L700,772 Q500,820 300,772 Z';
  const size = Math.min(fit(name.length > (name2 || '').length ? name : name2, 310, 80), 80);
  return `${bg(870, 300, 32)}${zoom(k, `
  <clipPath id="po"><path d="${d}"/></clipPath>
  <path d="${d}" fill="#141519"/>
  <g clip-path="url(#po)">
    <rect x="290" y="250" width="420" height="44" fill="#23262d"/>
    <path d="M300,318 L700,318" stroke="#000" stroke-opacity=".6" stroke-width="5"/><path d="M300,326 L700,326" stroke="#fff" stroke-opacity=".12" stroke-width="2"/>
    <rect x="290" y="360" width="420" height="16" fill="${color}"/>
    ${logo(500, 452, 0.78)}
    ${T(500, 540, 'LEVEL-UP', 40, WHITE, { ls: 5 })}
    ${T(500, 540 + size * 1.0, name, size, color)}
    ${name2 ? T(500, 540 + size * 1.9, name2, size, color) : ''}
    ${tag ? `<rect x="${500 - tag.length * 7.4 - 18}" y="${540 + size * (name2 ? 1.9 : 1) + 18}" width="${tag.length * 14.8 + 36}" height="30" rx="15" fill="${WHITE}"/>${T(500, 540 + size * (name2 ? 1.9 : 1) + 40, tag, 21, '#0b0c0e', { ls: 2 })}` : ''}
    ${T(500, 756, foot, 17, '#aeb3bd', { sans: true, ls: 2 })}
    <rect x="290" y="250" width="420" height="570" fill="url(#fabric)" opacity=".9"/>
    <path d="M360,300 C420,420 380,600 340,790" fill="none" stroke="#fff" stroke-opacity=".06" stroke-width="40"/>
  </g>
  <path d="M322,250 l-6,22 M678,250 l6,22" stroke="#0b0c0e" stroke-width="5"/>`, 520)}`;
}

// ---------- More merch and tools ----------
function beanie({ color }) {
  const crown = 'M300,640 C296,400 396,262 500,262 C604,262 704,400 700,640 Z';
  return `${bg(800, 300, 28)}
  <clipPath id="bn"><path d="${crown}"/></clipPath>
  <path d="${crown}" fill="#17191d"/>
  <g clip-path="url(#bn)">
    <g stroke="#000" stroke-opacity=".42" stroke-width="6">${Array.from({ length: 27 }, (_, i) => `<path d="M${500 + (i - 13) * 16},660 C${500 + (i - 13) * 15},480 ${500 + (i - 13) * 9},340 ${500 + (i - 13) * 2.4},262" fill="none"/>`).join('')}</g>
    <rect x="290" y="250" width="420" height="400" fill="url(#fabric)"/>
  </g>
  <rect x="280" y="596" width="440" height="150" rx="30" fill="#1d1f24"/>
  <clipPath id="bc"><rect x="280" y="596" width="440" height="150" rx="30"/></clipPath>
  <g clip-path="url(#bc)">
    <g stroke="#000" stroke-opacity=".45" stroke-width="6">${Array.from({ length: 28 }, (_, i) => `<line x1="${288 + i * 16}" y1="596" x2="${288 + i * 16}" y2="746"/>`).join('')}</g>
    <rect x="280" y="596" width="440" height="150" fill="url(#fabric)"/>
    <rect x="280" y="730" width="440" height="8" fill="${color}"/>
  </g>
  <rect x="430" y="622" width="140" height="92" rx="10" fill="#0b0c0e"/>
  ${logo(500, 666, 0.7)}
  ${stitch('M438,630 h124 v76 h-124 Z', '#fff', 0.3)}`;
}

function longsleeve({ color }) {
  const d = 'M404,196 C440,236 560,236 596,196 L706,238 L862,706 L772,742 L684,480 L684,826 Q500,848 316,826 L316,480 L228,742 L138,706 L294,238 Z';
  return `${bg(862, 330, 26)}
  <clipPath id="ls"><path d="${d}"/></clipPath>
  <path d="${d}" fill="#131418"/>
  <g clip-path="url(#ls)">
    <rect x="120" y="180" width="760" height="680" fill="url(#fabric)"/>
    <path d="M316,470 C330,560 330,700 316,830 M684,470 C670,560 670,700 684,830" fill="none" stroke="#000" stroke-opacity=".3" stroke-width="20" filter="url(#soft)"/>
    <path d="M306,250 L330,470 M694,250 L670,470" stroke="#000" stroke-opacity=".5" stroke-width="4"/>
    <path d="M150,700 L236,736 L244,712 L158,676 Z M850,700 L764,736 L756,712 L842,676 Z" fill="${color}"/>
    ${logo(500, 430, 1.25)}
    ${T(500, 556, 'LEVEL-UP', 50, WHITE, { ls: 6 })}
    <rect x="452" y="574" width="96" height="6" rx="3" fill="${color}"/>
  </g>
  <path d="M404,196 C440,236 560,236 596,196 C570,262 430,262 404,196 Z" fill="#1f2228"/>
  ${stitch('M320,802 Q500,824 680,802')}`;
}

function steelbottle({ color }) {
  const d = 'M452,300 C452,270 548,270 548,300 C548,330 600,350 600,400 L600,780 Q600,810 570,812 L430,812 Q400,810 400,780 L400,400 C400,350 452,330 452,300 Z';
  return `${bg(880, 230, 28)}${zoom(1.24, `
  <clipPath id="sb"><path d="${d}"/></clipPath>
  <path d="${d}" fill="#17191d"/>
  <g clip-path="url(#sb)">
    <rect x="400" y="720" width="200" height="10" fill="${color}"/>
    ${logo(500, 500, 0.86)}
    ${T(500, 600, 'LEVEL-UP', 36, WHITE, { ls: 5 })}
    ${T(500, 700, '750 ML · HOT &amp; COLD', 14, '#aeb3bd', { sans: true, ls: 2 })}
    <path d="${d}" fill="url(#cyl)"/>
  </g>
  <rect x="446" y="214" width="108" height="72" rx="12" fill="#23262d"/>
  <rect x="446" y="214" width="108" height="72" rx="12" fill="url(#cyl)" opacity=".8"/>
  <rect x="446" y="268" width="108" height="8" fill="${color}"/>
  <path d="M470,214 C470,160 530,160 530,214" fill="none" stroke="#23262d" stroke-width="14" stroke-linecap="round"/>`, 500)}`;
}

function straps({ color }) {
  // two straps side by side: a loop at the top, a long tail below
  const one = (x, rot) => `<g transform="rotate(${rot} ${x} 560)">
    <ellipse cx="${x}" cy="262" rx="50" ry="84" fill="none" stroke="#17191d" stroke-width="34"/>
    <ellipse cx="${x}" cy="262" rx="50" ry="84" fill="none" stroke="#fff" stroke-opacity=".16" stroke-width="2.5" stroke-dasharray="7 6"/>
    <rect x="${x - 38}" y="330" width="76" height="520" rx="8" fill="#17191d"/>
    <rect x="${x - 38}" y="330" width="76" height="520" rx="8" fill="url(#cyl)" opacity=".45"/>
    ${stitch(`M${x - 27},338 V842 M${x + 27},338 V842`, '#fff', 0.22)}
    <rect x="${x - 38}" y="330" width="76" height="54" fill="#2b2e35"/>
    ${stitch(`M${x - 30},338 h60 v38 h-60 Z`, '#fff', 0.3)}
    <rect x="${x - 38}" y="816" width="76" height="34" rx="8" fill="${color}"/>
    ${logo(x, 560, 0.52)}
    ${T(x, 622, 'LEVEL-UP', 15, WHITE, { ls: 1 })}
  </g>`;
  return `${bg(884, 300, 28)}
  ${one(390, -7)}${one(610, 7)}`;
}

function kettlebell({ color }) {
  return `${bg(862, 300, 34)}
  <defs><radialGradient id="kb" cx="38%" cy="30%" r="80%"><stop offset="0" stop-color="#4a4f5a"/><stop offset=".45" stop-color="#1d1f24"/><stop offset="1" stop-color="#08090a"/></radialGradient></defs>
  <path d="M398,470 C340,250 660,250 602,470" fill="none" stroke="#17191d" stroke-width="58" stroke-linecap="round"/>
  <path d="M398,470 C340,250 660,250 602,470" fill="none" stroke="#fff" stroke-opacity=".14" stroke-width="10" stroke-linecap="round" transform="translate(-10 -12)"/>
  <circle cx="500" cy="630" r="218" fill="url(#kb)"/>
  <path d="M356,836 L644,836 L620,860 L380,860 Z" fill="#08090a"/>
  <circle cx="500" cy="630" r="124" fill="#0b0c0e"/>
  <circle cx="500" cy="630" r="124" fill="none" stroke="${color}" stroke-width="8"/>
  ${logo(500, 596, 0.84)}
  ${T(500, 706, '12 KG', 58, color)}`;
}

function pullbar({ color }) {
  const grip = (x, w) => `<rect x="${x}" y="446" width="${w}" height="68" rx="26" fill="#17191d"/><rect x="${x}" y="446" width="${w}" height="68" rx="26" fill="url(#cylv)"/>
    <g stroke="#000" stroke-opacity=".5" stroke-width="3">${Array.from({ length: Math.floor(w / 14) }, (_, i) => `<line x1="${x + 12 + i * 14}" y1="450" x2="${x + 12 + i * 14}" y2="510"/>`).join('')}</g>`;
  return `${bg(700, 420, 30)}
  <rect x="80" y="464" width="840" height="32" rx="14" fill="url(#steel)"/>
  <rect x="80" y="464" width="840" height="32" rx="14" fill="url(#cylv)" opacity=".5"/>
  ${grip(150, 190)}${grip(405, 190)}${grip(660, 190)}
  <rect x="56" y="420" width="44" height="120" rx="10" fill="#101114"/><rect x="900" y="420" width="44" height="120" rx="10" fill="#101114"/>
  <rect x="56" y="420" width="44" height="120" rx="10" fill="url(#cyl)" opacity=".6"/><rect x="900" y="420" width="44" height="120" rx="10" fill="url(#cyl)" opacity=".6"/>
  <rect x="56" y="470" width="44" height="10" fill="${color}"/><rect x="900" y="470" width="44" height="10" fill="${color}"/>
  ${logo(500, 300, 1.3)}
  ${T(500, 640, 'LEVEL-UP', 60, WHITE, { ls: 8, op: 0.9 })}
  ${T(500, 684, 'DOORWAY PULL-UP BAR', 24, color, { ls: 6 })}`;
}

function balls({ color }) {
  const dots = (cx, cy, r, c) => Array.from({ length: 40 }, (_, i) => { const a = i * 2.39996, d = Math.sqrt((i + 0.5) / 40) * r * 0.86; return `<circle cx="${(cx + Math.cos(a) * d).toFixed(1)}" cy="${(cy + Math.sin(a) * d).toFixed(1)}" r="${(7 - d / r * 3).toFixed(1)}" fill="${c}" opacity=".35"/>`; }).join('');
  return `${bg(800, 380, 30)}
  <defs><radialGradient id="b1" cx="36%" cy="30%" r="80%"><stop offset="0" stop-color="#b9f7da"/><stop offset=".5" stop-color="${color}"/><stop offset="1" stop-color="#1c7a54"/></radialGradient>
  <radialGradient id="b2" cx="36%" cy="30%" r="80%"><stop offset="0" stop-color="#565c68"/><stop offset=".5" stop-color="#1d1f24"/><stop offset="1" stop-color="#08090a"/></radialGradient></defs>
  <circle cx="330" cy="610" r="150" fill="url(#b2)"/><circle cx="560" cy="610" r="150" fill="url(#b2)"/>
  <rect x="330" y="520" width="230" height="180" fill="#131418"/>
  <path d="M330,520 Q445,560 560,520 M330,700 Q445,660 560,700" fill="none" stroke="#000" stroke-opacity=".5" stroke-width="6"/>
  ${dots(330, 610, 150, '#000')}${dots(560, 610, 150, '#000')}
  ${T(445, 624, 'LEVEL-UP', 34, WHITE, { ls: 4 })}
  <circle cx="740" cy="430" r="112" fill="url(#b1)"/>
  ${dots(740, 430, 112, '#0b3d2a')}
  ${logo(740, 430, 0.74, '#0b0c0e', '#17573e')}`;
}

const PRODUCTS = {
  whey: () => tub({ color: BLUE, name: 'WHEY', name2: 'PROTEIN', tag: 'CHOCOLATE', foot: '1 KG · 33 SERVINGS' }),
  creatine: () => tub({ color: WHITE, name: 'CREATINE', name2: 'MONOHYDRATE', foot: '500 G · 166 SERVINGS', lidColor: '#e9ebef' }),
  preworkout: () => tub({ color: ORANGE, name: 'PRE-', name2: 'WORKOUT', tag: 'CITRUS', foot: '300 G · 30 SERVINGS' }),
  electro: () => tub({ color: MINT, name: 'ELECTRO', name2: 'LYTES', tag: 'LEMON', foot: '300 G · 60 SERVINGS' }),
  omega3: () => jar({ color: GOLD, name: 'OMEGA-3', foot: '120 SOFTGELS' }),
  magnesium: () => jar({ color: VIOLET, name: 'MAGNESIUM', foot: '90 CAPSULES' }),
  barbox: () => barbox({ color: PINK }),
  shaker: () => shaker({ color: MINT }),
  tank: () => tank({ color: MINT }),
  shorts: () => shorts({ color: MINT }),
  cap: () => cap({ color: MINT }),
  socks: () => socks({ color: MINT }),
  gymbag: () => gymbag({ color: MINT }),
  towel: () => towel({ color: MINT }),
  rings: () => rings({ color: MINT }),
  rope: () => rope({ color: MINT }),
  chalk: () => chalk({ color: BLUE }),
  wraps: () => wraps({ color: MINT }),
  grips: () => grips({ color: MINT }),
  roller: () => roller({ color: MINT }),
  bands: () => bands(),
  // more supplements, merch and tools
  eaa: () => tub({ color: PINK, name: 'EAA', name2: 'AMINO', tag: 'BERRY', foot: '300 G · 30 SERVINGS' }),
  vitd: () => jar({ color: ORANGE, name: 'VITAMIN', name2: 'D3 + K2', foot: '120 CAPSULES' }),
  pancake: () => pouch({ color: GOLD, name: 'PROTEIN', name2: 'PANCAKES', foot: '500 G · 10 SERVINGS' }),
  beanie: () => beanie({ color: MINT }),
  longsleeve: () => longsleeve({ color: MINT }),
  bottle: () => steelbottle({ color: MINT }),
  straps: () => straps({ color: MINT }),
  kettlebell: () => kettlebell({ color: MINT }),
  pullbar: () => pullbar({ color: MINT }),
  balls: () => balls({ color: MINT }),
  // the fridge
  shake: () => bottle({ color: BLUE, name: 'PROTEIN', name2: 'SHAKE', foot: '330 ML' }),
  bar: () => onebar({ color: PINK }),
  energy: () => can({ color: GOLD, name: 'ENERGY', foot: '250 ML · SUGAR FREE' }),
  water: () => bottle({ color: BLUE, name: 'WATER', foot: '500 ML', clear: true, label: '#101114', cap: '#5ab0ff' }),
  sportsdrink: () => bottle({ color: ORANGE, name: 'ISO', name2: 'SPORT', foot: '500 ML', body: '#ffb469', cap: '#101114' }),
  recovery: () => bottle({ color: VIOLET, name: 'RECOVERY', name2: 'SHAKE', foot: '330 ML', body: '#eef0f3' }),
  coldbrew: () => can({ color: '#c69a6b', name: 'COLD', name2: 'BREW', foot: '250 ML · COFFEE' }),
  pudding: () => cup({ color: VIOLET }),
  gel: () => pouch({ color: ORANGE, name: 'ENERGY', name2: 'GEL', foot: '60 ML · 25 G CARBS', k: 0.74 }),
  nuts: () => pouch({ color: MINT, name: 'NUT MIX', foot: '50 G · UNSALTED', k: 0.86 })
};

(async () => {
  const want = process.argv.slice(2);
  const ids = want.length ? want : Object.keys(PRODUCTS);
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1000, height: 1000 }, deviceScaleFactor: 1 });
  for (const id of ids) {
    await p.setContent(`<style>${FONTS} html,body{margin:0;background:#0b0c0e}</style><svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1000" viewBox="0 0 1000 1000">${defs}${PRODUCTS[id]()}</svg>`);
    await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(150);
    await p.screenshot({ path: `${OUT}/${id}.jpg`, type: 'jpeg', quality: 88 });
  }
  await b.close();
  console.log(ids.length, 'pictures', ids.map((id) => `${id} ${(fs.statSync(`${OUT}/${id}.jpg`).size / 1024).toFixed(0)}k`).join(' '));
})();
