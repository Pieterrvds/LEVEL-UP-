// The Instagram set for @levelup.movement: profile picture, 9 posts (1080 x 1350), 3 story templates and 6 highlight covers.
// Run from the repository root (needs Playwright with Chromium and a connection for the fonts):
//   node tools/instagram-posts.js [name ...]   -> instagram/<name>.jpg; without names: all of them
// To change a post, edit its text or photo below and run it again. The texts to post with them are in instagram/teksten.md.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const OUT = process.env.OUT || path.join(ROOT, 'instagram');
const img = (f) => `data:image/${/\.png$/i.test(f) ? 'png' : 'jpeg'};base64,${fs.readFileSync(path.join(ROOT, 'img', f)).toString('base64')}`;
const FONTS = "@import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:ital,wght@1,800&family=Inter:wght@400;500;600;700&display=swap');";
const MINT = '#5ee6a8', GOLD = '#ffcf5a', WHITE = '#f4f5f7', BG = '#0b0c0e', MUTED = '#a9afba';

const mark = (size, c = WHITE, post = '#aeb3bd') => `<svg width="${size}" height="${size}" viewBox="-56 -56 112 112">
  <rect x="-45" y="-50" width="6" height="100" rx="2" fill="${post}"/><rect x="39" y="-50" width="6" height="100" rx="2" fill="${post}"/>
  <rect x="-52" y="-43" width="104" height="4.5" rx="2" fill="${post}"/>
  <path d="M-21 -40 L-19 -22 L-7 -11 M21 -40 L19 -22 L7 -11" fill="none" stroke="${c}" stroke-width="7.5" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="0" cy="-26" r="8.6" fill="${c}"/>
  <path d="M-9.5 -14 H9.5 V38 A4.4 4.4 0 0 1 0.9 38 V10 H-0.9 V38 A4.4 4.4 0 0 1 -9.5 38 Z" fill="${c}"/></svg>`;

const css = `${FONTS}
*{box-sizing:border-box;margin:0;padding:0}
html,body{background:${BG}}
body{position:relative;overflow:hidden;color:${WHITE};font-family:Inter,sans-serif}
.d{font-family:'Barlow Condensed',sans-serif;font-style:italic;font-weight:800;text-transform:uppercase}
.bg{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;filter:grayscale(1) contrast(1.15) brightness(.55)}
.shade{position:absolute;inset:0;background:linear-gradient(180deg,rgba(11,12,14,.72) 0%,rgba(11,12,14,.25) 34%,rgba(11,12,14,.55) 60%,rgba(11,12,14,.96) 100%)}
.carbon{position:absolute;inset:0;background:radial-gradient(120% 80% at 50% 0%,#2a2d35 0%,#15171b 45%,${BG} 100%)}
.grid{position:absolute;inset:0;background-image:linear-gradient(rgba(255,255,255,.035) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.035) 1px,transparent 1px);background-size:54px 54px}
.top{position:absolute;left:64px;right:64px;top:56px;display:flex;align-items:center;justify-content:space-between;z-index:3}
.brand{display:flex;align-items:center;gap:14px;font-size:44px;letter-spacing:2px}
.tag{font-size:26px;letter-spacing:4px;color:${MUTED}}
.foot{position:absolute;left:64px;right:64px;bottom:54px;display:flex;align-items:center;justify-content:space-between;z-index:3;font-weight:600;font-size:28px;color:${MUTED}}
.kicker{font-size:38px;letter-spacing:5px;color:${MINT}}
h1{font-size:168px;line-height:.9;letter-spacing:-1px}
h1 span{color:${MINT}}
.sub{font-size:36px;line-height:1.35;color:#d7dae0;font-weight:500}
.pill{display:inline-block;padding:14px 30px 16px;border-radius:14px;background:${WHITE};color:${BG};font-size:44px;letter-spacing:1px;transform:skewX(-8deg)}
.pill.mint{background:${MINT}} .pill.gold{background:${GOLD}}
.card{background:rgba(23,25,29,.94);border:2px solid #30343c;border-radius:26px}
.chip{display:inline-block;padding:10px 22px 12px;border:2px solid #6b7280;border-radius:12px;font-size:36px;letter-spacing:2px;background:rgba(11,12,14,.6)}
.body{position:absolute;left:64px;right:64px;z-index:2}
.body.mid{top:150px;bottom:130px;display:flex;flex-direction:column;justify-content:center}
`;

const frame = (inner, { tag = 'Aalst', foot = ['@levelup.movement', 'Link in bio →'] } = {}) => `
  <div class="top"><div class="brand d">${mark(58)}LEVEL-UP</div><div class="tag d">${tag}</div></div>
  ${inner}
  <div class="foot"><span>${foot[0]}</span><span style="color:${WHITE}">${foot[1]}</span></div>`;

const POSTS = {
  // 1. Who we are
  'post-1-train-hard': frame(`
    <img class="bg" src="${img('hero-box.jpg')}"><div class="shade"></div>
    <div class="body" style="bottom:170px">
      <p class="kicker d">▸ Personal training · Aalst</p>
      <h1 class="d" style="margin:18px 0 30px">Train hard.<br><span>Level up.</span></h1>
      <p class="sub" style="max-width:820px">1-op-1 coaching en groepslessen.<br>Bij elke sessie verdien je XP in onze app.</p>
    </div>`),

  // 2. How it works
  'post-2-zo-werkt-het': frame(`
    <div class="carbon"></div><div class="grid"></div>
    <div class="body mid">
      <p class="kicker d">▸ In 3 stappen</p>
      <h1 class="d" style="font-size:150px;margin:10px 0 44px">Zo werkt het</h1>
      ${[['1', 'Kies je coach', 'Bekijk de vrije uren en boek in een paar tikken.', WHITE],
         ['2', 'Train', '1-op-1 of in een kleine groep, op jouw niveau.', WHITE],
         ['3', 'Level up', '+75 XP per sessie. Klim van Rookie tot Legend.', MINT]].map(([n, t, s, c]) => `
        <div class="card" style="display:flex;align-items:center;gap:34px;padding:34px 40px;margin-bottom:24px">
          <div class="d" style="flex:none;width:118px;height:118px;border-radius:22px;display:grid;place-items:center;font-size:92px;line-height:1;background:${c};color:${BG};transform:skewX(-8deg)">${n}</div>
          <div><p class="d" style="font-size:66px;line-height:1;color:${c}">${t}</p><p class="sub" style="font-size:33px;margin-top:10px">${s}</p></div>
        </div>`).join('')}
    </div>`, { tag: 'Zo werkt het' }),

  // 3. The coaches
  'post-3-coaches': frame(`
    <div class="carbon"></div><div class="grid"></div>
    <div class="body mid">
      <p class="kicker d">▸ Het team</p>
      <h1 class="d" style="font-size:150px;margin:10px 0 44px">Je coaches</h1>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:22px">
      ${[['pf.jpg', 'Pieter', 'Head coach', '50% 18%', '#ff7eb6'],
         ['filipironmancoach.jpg', 'Filip', 'Triatlon', '50% 12%', '#4fc3f7'],
         ['teammembermaximtshirt.jpg', 'Maxim', 'Wielrennen', '50% 14%', GOLD]].map(([f, n, r, pos, c]) => `
        <div class="card" style="overflow:hidden;border-color:${c}">
          <img src="${img(f)}" style="display:block;width:100%;height:440px;object-fit:cover;object-position:${pos}">
          <div style="padding:20px 22px 26px"><p class="d" style="font-size:62px;line-height:1">${n}</p><p class="d" style="font-size:30px;letter-spacing:3px;color:${c};margin-top:6px">${r}</p></div>
        </div>`).join('')}
      </div>
      <p class="sub" style="margin-top:40px">Elke coach heeft een eigen specialiteit.<br>Jij kiest met wie je traint.</p>
    </div>`, { tag: 'Het team' }),

  // 4. XP and levels
  'post-4-xp': frame(`
    <div class="carbon"></div><div class="grid"></div>
    <div class="body mid">
      <p class="kicker d">▸ Trainen als een game</p>
      <h1 class="d" style="font-size:176px;margin:10px 0 40px">Elke sessie<br><span>+75 XP</span></h1>
      <div class="card" style="padding:36px 40px">
        <div style="display:flex;align-items:center;justify-content:space-between">
          <span class="pill d" style="background:#b18cff;font-size:48px">LVL 5 · Athlete</span>
          <span class="d" style="font-size:40px;color:${MUTED}">340 / 600 XP</span>
        </div>
        <div style="height:34px;margin-top:28px;border-radius:99px;background:#0f1013;border:2px solid #30343c;padding:4px"><div style="width:57%;height:100%;border-radius:99px;background:linear-gradient(90deg,#7d5ad6,#b18cff)"></div></div>
        <div style="display:flex;flex-wrap:wrap;gap:12px;margin-top:30px">
          ${[['Rookie', '#5ee6a8'], ['Trainee', '#5ab0ff'], ['Athlete', '#b18cff'], ['Warrior', '#ff9a4d'], ['Champion', '#ff6b9d'], ['Legend', GOLD]].map(([r, c]) => `<span class="chip d" style="border-color:${c};color:${c};font-size:32px;padding:6px 16px 8px">${r}</span>`).join('')}
        </div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:18px;margin-top:24px">
        ${[['+75', 'per sessie'], ['+50', 'per groepsles'], ['×10', 'per euro in de shop']].map(([a, b]) => `<div class="card" style="padding:22px 24px"><p class="d" style="font-size:78px;line-height:1;color:${GOLD}">${a}</p><p style="font-size:26px;color:${MUTED};margin-top:6px;font-weight:600">${b}</p></div>`).join('')}
      </div>
    </div>`, { tag: 'XP & levels' }),

  // 5. The mascot
  'post-5-levelupy': `
    <img src="${img('mascot/hello.jpg')}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover">
    <div style="position:absolute;inset:0;background:linear-gradient(180deg,rgba(11,12,14,.5) 0%,rgba(11,12,14,0) 18%,rgba(11,12,14,0) 52%,rgba(11,12,14,.97) 78%)"></div>
    <div class="top"><div class="brand d">${mark(58)}LEVEL-UP</div><div class="tag d" style="color:${WHITE}">De mascotte</div></div>
    <div class="body" style="bottom:150px">
      <p class="kicker d">▸ Maak kennis met</p>
      <h1 class="d" style="font-size:190px;margin:6px 0 20px">Levelupy</h1>
      <p class="sub">Hij hangt aan de ringen in onze app, kent je planning<br>en juicht bij elke level die je haalt.</p>
    </div>
    <div class="foot"><span>@levelup.movement</span><span style="color:${WHITE}">Link in bio →</span></div>`,

  // 6. Group classes
  'post-6-groepslessen': frame(`
    <img class="bg" src="${img('jimsgroepstraining.jpg')}" style="object-position:50% 30%"><div class="shade"></div>
    <div class="body" style="bottom:170px">
      <p class="kicker d">▸ Samen sterker</p>
      <h1 class="d" style="font-size:158px;margin:14px 0 34px">Groeps&shy;lessen</h1>
      <div style="display:flex;flex-wrap:wrap;gap:14px;max-width:940px">
        ${['Calisthenics', 'CrossFit', 'Boksen', 'Hyrox', 'Run club'].map((c) => `<span class="chip d">${c}</span>`).join('')}
      </div>
      <p class="sub" style="margin-top:34px">Kleine groepen, een coach erbij en <b style="color:${GOLD}">+50 XP</b> per les.</p>
    </div>`, { tag: 'Groepslessen' }),

  // 7. The first session
  'post-7-eerste-sessie': frame(`
    <img class="bg" src="${img('personaltrainig.jpg')}" style="object-position:50% 20%"><div class="shade" style="background:linear-gradient(180deg,rgba(11,12,14,.8),rgba(11,12,14,.55) 40%,rgba(11,12,14,.95))"></div>
    <div class="body mid">
      <p class="kicker d">▸ Nieuw bij LEVEL-UP?</p>
      <p class="d" style="font-size:96px;line-height:1;margin-top:26px">Je eerste sessie</p>
      <p class="d" style="font-size:430px;line-height:.86;color:${MINT};letter-spacing:-6px;margin-left:-8px">€30</p>
      <div style="display:flex;flex-wrap:wrap;gap:14px;margin-top:26px">
        ${['1 uur', '1-op-1', 'Coach naar keuze'].map((c) => `<span class="chip d">${c}</span>`).join('')}
      </div>
      <p style="margin-top:46px"><span class="pill d" style="font-size:54px;padding:18px 38px 20px">▶ Boek via de link in bio</span></p>
    </div>`, { tag: 'Aanbod' }),

  // 8. The shop
  'post-8-shop': frame(`
    <div class="carbon"></div><div class="grid"></div>
    <div class="body mid">
      <p class="kicker d">▸ Gear up</p>
      <h1 class="d" style="font-size:176px;margin:10px 0 40px">De shop</h1>
      <div style="display:grid;grid-template-columns:1.25fr 1fr;gap:20px">
        <div class="card" style="overflow:hidden;grid-row:span 2"><img src="${img('teammembermaximtruimerch.jpg')}" style="display:block;width:100%;height:604px;object-fit:cover;object-position:50% 20%"></div>
        <div class="card" style="overflow:hidden"><img src="${img('teamembermaximtshirtmerch.jpg')}" style="display:block;width:100%;height:290px;object-fit:cover;object-position:50% 40%"></div>
        <div class="card" style="overflow:hidden;background:#fff"><img src="${img('levelupparalettes.JPG')}" style="display:block;width:100%;height:290px;object-fit:cover"></div>
      </div>
      <div style="display:flex;align-items:center;gap:20px;margin-top:34px">
        <span class="pill gold d">€1 = 10 XP</span>
        <p class="sub" style="font-size:34px">Hoodies, T-shirts en trainingsmateriaal.</p>
      </div>
    </div>`, { tag: 'Shop' }),

  // 9. The high scores
  'post-9-high-scores': frame(`
    <img class="bg" src="${img('chat-bg.jpg')}" style="filter:grayscale(1) brightness(.35)"><div class="shade"></div>
    <div class="body mid">
      <p class="kicker d">▸ Elke maand opnieuw</p>
      <h1 class="d" style="font-size:176px;margin:10px 0 44px">High<br>scores</h1>
      ${[['1', 'Jij?', '+ 1 200 XP', GOLD, 1], ['2', '· · ·', '', '#c9ccd3', .8], ['3', '· · ·', '', '#d9925a', .62]].map(([n, name, xp, c, w]) => `
        <div class="card" style="display:flex;align-items:center;gap:26px;padding:22px 30px;margin-bottom:18px;width:${w * 100}%;border-color:${c}">
          <span class="d" style="flex:none;width:86px;height:86px;border-radius:18px;display:grid;place-items:center;font-size:64px;line-height:1;background:${c};color:${BG}">${n}</span>
          <span class="d" style="font-size:66px;line-height:1;flex:1">${name}</span>
          <span class="d" style="font-size:42px;color:${c}">${xp}</span>
        </div>`).join('')}
      <p class="sub" style="margin-top:30px">Wie het meeste XP verzamelt, staat bovenaan.<br>Neem jij deze maand de eerste plaats?</p>
    </div>`, { tag: 'Klassement' })
};

// Story templates (1080 x 1920): the middle stays free for your own photo, sticker or text
const story = (kicker, title, lines, note) => `
  <div class="carbon"></div><div class="grid"></div>
  <div class="top" style="top:150px"><div class="brand d">${mark(58)}LEVEL-UP</div><div class="tag d">@levelup.movement</div></div>
  <div class="body" style="top:330px">
    <p class="kicker d">▸ ${kicker}</p>
    <h1 class="d" style="font-size:170px;margin:12px 0 0">${title}</h1>
  </div>
  <div class="body" style="top:820px">${lines}</div>
  <div class="body" style="bottom:300px;text-align:center"><span class="pill d" style="font-size:52px">${note}</span></div>`;
const blank = (label) => `<div class="card" style="display:flex;align-items:center;gap:24px;padding:30px 34px;margin-bottom:22px;min-height:132px"><span class="d" style="font-size:44px;color:${MINT};letter-spacing:2px;flex:none">${label}</span></div>`;
const STORIES = {
  'story-1-vrije-uren': story('Deze week', 'Vrije<br><span>uren</span>', ['Ma', 'Wo', 'Za'].map(blank).join(''), '▶ Boek via de link'),
  'story-2-nieuw-in-de-shop': story('Net binnen', 'Nieuw in<br>de <span>shop</span>', `<div class="card" style="height:620px;display:grid;place-items:center"><p class="d" style="font-size:44px;letter-spacing:3px;color:#565c68">Plaats hier je foto</p></div>`, '€1 = 10 XP'),
  'story-3-speler-van-de-maand': story('Proficiat', 'Speler van<br>de <span style="color:' + GOLD + '">maand</span>', `<div class="card" style="height:620px;display:grid;place-items:center;border-color:${GOLD}"><p class="d" style="font-size:44px;letter-spacing:3px;color:#565c68">Foto + naam + XP</p></div>`, 'Wie volgt?')
};

// Highlight covers (1080 x 1920, Instagram shows the middle as a circle)
const ICON = {
  start: `<path d="M-70 -90 L90 0 L-70 90 Z" fill="${WHITE}"/>`,
  coaches: `<circle cx="0" cy="-48" r="44" fill="${WHITE}"/><path d="M-92 96 C-92 20 92 20 92 96 Z" fill="${WHITE}"/>`,
  lessen: `<circle cx="-62" cy="-36" r="34" fill="${WHITE}"/><circle cx="62" cy="-36" r="34" fill="${WHITE}"/><path d="M-128 86 C-128 22 4 22 4 86 Z M-4 86 C-4 22 128 22 128 86 Z" fill="${WHITE}"/>`,
  app: `<rect x="-64" y="-110" width="128" height="220" rx="26" fill="none" stroke="${WHITE}" stroke-width="16"/><rect x="-34" y="-58" width="68" height="16" rx="8" fill="${MINT}"/><rect x="-34" y="-22" width="44" height="16" rx="8" fill="${WHITE}"/><circle cx="0" cy="68" r="12" fill="${WHITE}"/>`,
  shop: `<path d="M-84 -40 H84 L96 104 H-96 Z" fill="none" stroke="${WHITE}" stroke-width="16" stroke-linejoin="round"/><path d="M-40 -40 V-64 A40 40 0 0 1 40 -64 V-40" fill="none" stroke="${WHITE}" stroke-width="16" stroke-linecap="round"/>`,
  prijzen: `<text x="0" y="62" text-anchor="middle" font-family="'Barlow Condensed'" font-style="italic" font-weight="800" font-size="230" fill="${WHITE}">€</text>`
};
const cover = (icon, c) => `<div class="carbon"></div>
  <svg width="1080" height="1920" viewBox="-540 -960 1080 1920" style="position:absolute;inset:0"><circle r="330" fill="#17191d" stroke="${c}" stroke-width="14"/>${ICON[icon]}</svg>`;
const COVERS = { 'cover-start': cover('start', MINT), 'cover-coaches': cover('coaches', '#ff7eb6'), 'cover-lessen': cover('lessen', '#5ab0ff'), 'cover-app': cover('app', '#b18cff'), 'cover-shop': cover('shop', GOLD), 'cover-prijzen': cover('prijzen', MINT) };

const PROFILE = { 'profielfoto': `<div class="carbon" style="background:radial-gradient(circle at 50% 42%,#2a2d35,${BG} 72%)"></div>
  <svg width="1080" height="1080" viewBox="-540 -540 1080 1080" style="position:absolute;inset:0"><circle r="486" fill="none" stroke="${MINT}" stroke-width="16"/></svg>
  <div style="position:absolute;inset:0;display:grid;place-items:center">${mark(640)}</div>` };

(async () => {
  const want = process.argv.slice(2);
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch();
  const p = await b.newPage({ deviceScaleFactor: 1 });
  const sets = [[POSTS, 1080, 1350], [STORIES, 1080, 1920], [COVERS, 1080, 1920], [PROFILE, 1080, 1080]];
  for (const [set, w, h] of sets) {
    await p.setViewportSize({ width: w, height: h });
    for (const [name, inner] of Object.entries(set)) {
      if (want.length && !want.includes(name)) continue;
      await p.setContent(`<style>${css} body{width:${w}px;height:${h}px}</style>${inner}`, { waitUntil: 'load' });
      await p.evaluate(() => Promise.all([document.fonts.ready, ...[...document.images].map((i) => i.decode().catch(() => {}))]));
      await p.waitForTimeout(150);
      await p.screenshot({ path: `${OUT}/${name}.jpg`, type: 'jpeg', quality: 92 });
    }
  }
  await b.close();
  console.log(fs.readdirSync(OUT).length, 'files', (fs.readdirSync(OUT).reduce((n, f) => n + fs.statSync(`${OUT}/${f}`).size, 0) / 1e6).toFixed(1), 'MB');
})();
