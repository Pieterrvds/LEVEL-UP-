/*!
 * LEVEL-UP Celebrate - viering-animatie (turner aan de ringen doet een muscle-up)
 * Geen afhankelijkheden. Drie vieringen:
 *
 *   LevelUpCelebrate.like({ by: 'Sarah' });                                   // hartjes
 *   LevelUpCelebrate.rankUp({ from: 12, to: 8 });                             // confetti
 *   LevelUpCelebrate.purchase({ subtitle: 'Je 10-beurtenkaart staat klaar.' }); // cadeautjes
 *
 * Alle opties: zie DEFAULTS hieronder.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LevelUpCelebrate = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var DEFAULTS = {
    type: 'rank',              // 'like', 'rank' of 'purchase'
    title: null,               // grote tekst; standaard per type
    subtitle: null,            // kleine tekst eronder
    from: null,                // vorige plaats in de ranking (type 'rank')
    to: null,                  // nieuwe plaats in de ranking (type 'rank')
    by: null,                  // naam van wie de like gaf (type 'like')
    particles: null,           // 'hearts', 'confetti' of 'gifts'; standaard per type
    accent: '#C6FF3D',         // huiskleur (neon-lime)
    glow: null,                // kleur van stralen en schokgolf; standaard per type
    colors: null,              // kleuren van hartjes, confetti of cadeautjes (hex, bv. '#C6FF3D')
    pixel: 0,                  // 0 = vloeiend, 2 tot 5 = pixel-look
    speed: 1.3,                // 1 = normaal, 1.3 = snel
    short: true,               // true = stopt na de muscle-up; false = ook nog een kruishang
    hold: 0,                   // extra seconden dat het eindbeeld blijft staan
    backdrop: 'rgba(8,10,14,.93)',
    dismissOnClick: true,      // klik of Esc sluit de viering
    zIndex: 2147483000,
    container: null,           // standaard document.body
    onDone: null               // callback wanneer de viering weg is
  };

  var KIND = { like: 'hearts', rank: 'confetti', purchase: 'gifts' };
  var HEART = '#FF3B5C';

  var TEXT = {
    like: { title: 'Nieuwe like!', subtitle: 'Iemand heeft je een like gegeven.' },
    purchase: { title: 'Aankoop gelukt!', subtitle: 'Bedankt. Tijd om te trainen.' },
    rank: { title: 'Level up!', subtitle: 'Je bent gestegen in de ranking.' }
  };

  /* ---------- tijdlijn ---------- */
  var T_IN = 0.55;     // ringen en turner zakken in beeld
  var LOCK = 2.12;     // armen gestrekt in steun: confetti
  var KF = [
    { t: 0.00, a: 167, r: 1.00 },
    { t: 0.80, a: 167, r: 1.00 },
    { t: 1.35, a: 150, r: 0.38, e: 'in' },    // optrekken
    { t: 1.72, a: 35, r: 0.48, e: 'lin' },    // overgang boven de ringen
    { t: LOCK, a: 5, r: 1.00, e: 'out' },     // uitduwen tot steun
    { t: 3.45, a: 5, r: 1.00 },
    { t: 4.25, a: 90, r: 1.00, e: 'io' },     // zakken naar kruishang
    { t: 9.00, a: 90, r: 1.00 }
  ];
  var END_FULL = 6.1, END_SHORT = 3.9, FADE = 0.5;

  /* ---------- maten van de turner (ontwerp-eenheden) ---------- */
  var SH = 30, ARM = 80, TOR = 80, AX = 48, AY = -400, LC = 560, RR = 15;
  var SCENE_W = 430, SCENE_H = 470;

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, u) { return a + (b - a) * u; }
  function easeIO(u) { return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2; }
  function easeBack(u) { var c = 1.9; return 1 + (c + 1) * Math.pow(u - 1, 3) + c * Math.pow(u - 1, 2); }
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function pick(arr) { return arr[(Math.random() * arr.length) | 0]; }

  function armPose(t) {
    var i = 1;
    while (i < KF.length - 1 && t > KF[i].t) i++;
    var p = KF[i - 1], q = KF[i];
    var u = clamp((t - p.t) / (q.t - p.t), 0, 1);
    var moving = (p.a !== q.a || p.r !== q.r) && u > 0 && u < 1;
    if (q.e === 'io') u = easeIO(u); else if (q.e === 'in') u = Math.pow(u, 1.7); else if (q.e === 'out') u = 1 - Math.pow(1 - u, 1.7);
    return { a: Math.max(0, lerp(p.a, q.a, u)), r: Math.min(1, lerp(p.r, q.r, u)), moving: moving };
  }

  function isHex(h) { return typeof h === 'string' && /^#[0-9a-f]{6}$/i.test(h); }
  function lum(hex) {
    if (!isHex(hex)) return 0.5;
    var n = parseInt(hex.slice(1), 16);
    return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  }
  function heartPath(c, r) {
    c.beginPath(); c.moveTo(0, r * 0.95);
    c.bezierCurveTo(-r * 1.55, -r * 0.05, -r * 0.8, -r * 1.2, 0, -r * 0.42);
    c.bezierCurveTo(r * 0.8, -r * 1.2, r * 1.55, -r * 0.05, 0, r * 0.95);
    c.closePath();
  }
  function headPath(c, w, h) {
    c.beginPath(); c.moveTo(-w, -h * 0.2);
    c.bezierCurveTo(-w, -h * 0.82, -w * 0.56, -h, 0, -h);
    c.bezierCurveTo(w * 0.56, -h, w, -h * 0.82, w, -h * 0.2);
    c.bezierCurveTo(w, h * 0.26, w * 0.9, h * 0.6, w * 0.62, h * 0.82);
    c.quadraticCurveTo(w * 0.36, h, 0, h);
    c.quadraticCurveTo(-w * 0.36, h, -w * 0.62, h * 0.82);
    c.bezierCurveTo(-w * 0.9, h * 0.6, -w, h * 0.26, -w, -h * 0.2);
    c.closePath();
  }
  function drawGift(c, w, color, dark, ribbon) {
    var h = w * 0.86, lid = w * 0.26, t = -h / 2;
    c.fillStyle = color; c.fillRect(-w / 2, t + lid, w, h - lid);
    c.fillStyle = dark; c.fillRect(-w / 2, t + lid, w, w * 0.09);
    c.fillStyle = color; c.fillRect(-w * 0.56, t, w * 1.12, lid);
    c.fillStyle = ribbon; c.fillRect(-w * 0.1, t, w * 0.2, h);
    c.beginPath(); c.ellipse(-w * 0.2, t - w * 0.1, w * 0.21, w * 0.12, 0.5, 0, 6.2832); c.fill();
    c.beginPath(); c.ellipse(w * 0.2, t - w * 0.1, w * 0.21, w * 0.12, -0.5, 0, 6.2832); c.fill();
    c.fillStyle = dark; c.beginPath(); c.arc(0, t - w * 0.03, w * 0.075, 0, 6.2832); c.fill();
  }
  function shade(hex, f) {
    if (!isHex(hex)) return hex;
    var n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    function ch(v) { return Math.round(f < 0 ? v * (1 + f) : v + (255 - v) * f); }
    return 'rgb(' + ch(r) + ',' + ch(g) + ',' + ch(b) + ')';
  }

  /* ---------- tekenhulpjes ---------- */
  function limb(c, x1, y1, r1, x2, y2, r2, fill, stroke) {
    var ang = Math.atan2(y2 - y1, x2 - x1);
    c.beginPath();
    c.arc(x1, y1, r1, ang + Math.PI / 2, ang - Math.PI / 2);
    c.arc(x2, y2, r2, ang - Math.PI / 2, ang + Math.PI / 2);
    c.closePath();
    if (fill) { c.fillStyle = fill; c.fill(); }
    if (stroke) { c.strokeStyle = stroke; c.stroke(); }
  }
  function blob(c, x, y, rx, ry, rot, fill, alpha) {
    c.save(); c.globalAlpha *= alpha; c.beginPath();
    c.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rot, 0, Math.PI * 2);
    c.fillStyle = fill; c.fill(); c.restore();
  }
  function line(c, x1, y1, x2, y2) { c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke(); }
  function rrect(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r);
    c.lineTo(x + w, y + h - r); c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    c.lineTo(x + r, y + h); c.quadraticCurveTo(x, y + h, x, y + h - r);
    c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y); c.closePath();
  }

  /* ---------- de turner ---------- */
  /* ---------- leven in de beweging ---------- */
  function env(t, t0, k) { return t < t0 ? 0 : Math.exp(-k * (t - t0)); }                 /* schok die uitdooft */
  function bump(t, a, b) { return t <= a || t >= b ? 0 : Math.sin(Math.PI * (t - a) / (b - a)); }
  var PH = [0, 1.9];                                                                      /* links en rechts lopen bewust niet gelijk */

  /* een arm: de rechterarm komt een fractie later dan de linker, en elke ring wiebelt op zijn eigen ritme */
  function sidePose(t, tp, i) {
    var p = armPose(tp - (i ? 0.036 : 0)), ph = PH[i], tau = t - LOCK;
    var wob = 0.8 * Math.sin(t * 5.1 + ph)
      + 2.6 * env(t, T_IN * 0.92, 3) * Math.sin(t * 11 + ph)                              /* na het vastgrijpen */
      + 1.3 * bump(t, 1.62, LOCK) * Math.sin(t * 46 + ph * 3)                             /* trillen tijdens het uitduwen */
      + 4.4 * env(t, LOCK, 2.4) * Math.sin(tau * 13 + ph * 2.2)                           /* ringen schudden na de steun */
      + (tp > 4.25 ? 0.55 * Math.sin(t * 40 + ph) : 0);                                   /* trillen in de kruishang */
    var a = Math.max(-1, p.a + wob), rad = a * Math.PI / 180;
    var vx = p.r * ARM * Math.sin(rad), vy = p.r * ARM * Math.cos(rad);
    var h = SH + vx, dx = h - AX, ry = AY + Math.sqrt(LC * LC - dx * dx);
    return { h: h, ry: ry, handY: ry + RR, sy: ry + RR - vy, moving: p.moving };
  }
  /* het hele stel slingert zijwaarts: stevig bij het binnenkomen, daarna een restje, en opnieuw na de steun */
  function swingAt(t) {
    return 15 * Math.exp(-1.5 * Math.max(0, t)) * Math.sin(5.2 * t + 0.6) + 1.6 * Math.sin(1.3 * t + 1)
      + 5 * env(t, LOCK, 2) * Math.sin((t - LOCK) * 6.5);
  }
  function frameAt(t, short) {
    var tp = short ? Math.min(t, 3.4) : t;
    var L = sidePose(t, tp, 0), Rr = sidePose(t, tp, 1);
    return { L: L, R: Rr, tp: tp, sy: (L.sy + Rr.sy) / 2, roll: clamp(Math.atan2(Rr.sy - L.sy, 2 * SH), -0.17, 0.17) };
  }

  function computeRig(t, short) {
    var F = frameAt(t, short), F1 = frameAt(t - 0.11, short), F2 = frameAt(t - 0.04, short);
    var tp = F.tp, tau = t - LOCK, inCross = tp > 4.25, i, s;
    var rigY = 0.8 * Math.sin(t * 3.7);                                                   /* ademhaling */
    if (t < T_IN) rigY += -(1 - easeBack(t / T_IN)) * 560;
    else if (tau >= 0) rigY += 7 * Math.exp(-4.5 * tau) * Math.sin(22 * tau);
    var sw = swingAt(t), cx = swingAt(t - 0.06) * 1.08, roll = F.roll;
    var vyB = (F.sy - F2.sy) / 0.04;                                                      /* stijgsnelheid van de romp */
    var kip = bump(t, 0.66, 1.34), cr = Math.cos(roll), sr = Math.sin(roll);
    var legBase = roll * 0.7 - (roll - F1.roll) * 1.2 - (sw - swingAt(t - 0.14)) * 0.035
      + 0.09 * env(t, LOCK, 2.2) * Math.sin(tau * 7.5);
    var hw = [], hl = [], legs = [];
    for (i = 0; i < 2; i++) {
      s = i ? 1 : -1;
      var P = i ? F.R : F.L, wx = sw + s * P.h, dxw = wx - cx, dyw = P.handY - F.sy;
      hw.push({ x: wx, y: P.handY, ry: P.ry });                                           /* hand in het beeld */
      hl.push({ x: dxw * cr + dyw * sr, y: -dxw * sr + dyw * cr });                       /* dezelfde hand, gezien vanuit de romp */
      var phi = legBase + s * (0.03 * Math.sin(t * 3.1 + 1 + i) + 0.05 * kip + 0.05 * env(t, LOCK, 2.5) * Math.sin(tau * 9 + i));
      legs.push({ phi: phi, psi: phi - phi * 0.45 + s * 0.03 * Math.sin(t * 4.3 + i * 2), len: 1 - 0.085 * kip - (i ? 0.012 : 0) * kip });
    }
    var blink = Math.max(bump(t, 0.44, 0.58), bump(t, 2.78, 2.92), bump(t, 4.0, 4.14), bump(t, 5.2, 5.34));
    return {
      t: t, moving: F.L.moving || F.R.moving || inCross, happy: tau >= 0 && tp < 3.45,
      cx: cx, sy: F.sy, roll: roll, rigY: rigY, hw: hw, hl: hl, legs: legs,
      hem: Math.sin((legs[0].phi + legs[1].phi) / 2) * 34,
      headTilt: -roll * 0.85 + 0.045 * Math.sin(t * 1.9 + 0.4) + 0.08 * bump(t, 0.95, 1.9) - 0.06 * env(t, LOCK, 2) * Math.sin(tau * 8),
      headDy: 1.2 * bump(t, 0.9, 1.8) - 1.6 * env(t, LOCK, 4) * Math.sin(tau * 10),
      tailY: clamp(-vyB * 0.035, -4, 7) + 0.8 * Math.sin(t * 9), blink: blink,
      strapAmp: 0.8 + 8 * env(t, T_IN * 0.92, 2.4) + 4 * bump(t, 0.8, 1.4) + 3.5 * bump(t, 1.3, 1.85) + 9 * env(t, LOCK, 2.1) + (inCross ? 1.5 : 0),
      twist: 0.22 * (env(t, T_IN * 0.92, 3) + env(t, LOCK, 2.5) + 0.3 * bump(t, 0.8, LOCK))
    };
  }

  function drawGymnast(c, R, col) {
    var s, i, t = R.t;
    var skin = col.skin, sh = col.skinShade, li = col.skinLight, ol = col.outline;
    c.lineJoin = 'round'; c.lineCap = 'round';

    /* riemen en ringen: de riemen golven en trillen mee, de ringen draaien een beetje */
    for (i = 0; i < 2; i++) {
      s = i ? 1 : -1;
      var H0 = R.hw[i], rx = H0.x, ryy = H0.ry, ax0 = s * AX;
      var ux = rx - ax0, uy = ryy - AY, ul = Math.hypot(ux, uy), nxs = -uy / ul, nys = ux / ul;
      var ex0 = rx - ux / ul * RR, ey0s = ryy - uy / ul * RR, ph = PH[i] * 2.3, pts = [], N = 18, j, u, w;
      for (j = 0; j <= N; j++) {
        u = j / N;
        w = R.strapAmp * Math.sqrt(Math.sin(Math.PI * u)) * (0.6 * Math.sin(2 * Math.PI * u * 1.5 - t * 17 + ph) + 0.4 * Math.sin(5 * Math.PI * u + t * 31 + ph * 2));
        pts.push([lerp(ax0, ex0, u) + nxs * w, lerp(AY, ey0s, u) + nys * w]);
      }
      var strap = function () { c.beginPath(); c.moveTo(pts[0][0], pts[0][1]); for (var q = 1; q <= N; q++) c.lineTo(pts[q][0], pts[q][1]); c.stroke(); };
      c.strokeStyle = col.strapEdge; c.lineWidth = 6.2; strap();
      c.strokeStyle = col.strap; c.lineWidth = 4.2; strap();
      /* gesp met een los eindje riem dat naslingert */
      var b0 = pts[N - 3], b1 = pts[N - 2], bang = Math.atan2(b1[1] - b0[1], b1[0] - b0[0]);
      var th = s * 0.28 + (0.18 + R.strapAmp * 0.055) * Math.sin(t * 5.3 + ph) - (H0.x - s * 40) * 0.004;
      var tx = b0[0] + Math.sin(th) * 30, ty = b0[1] + Math.cos(th) * 30;
      var tail = function () { c.beginPath(); c.moveTo(b0[0], b0[1]); c.quadraticCurveTo(b0[0] + Math.sin(th * 0.3) * 16 + s * 3, b0[1] + 15, tx, ty); c.stroke(); };
      c.strokeStyle = col.strapEdge; c.lineWidth = 5.2; tail(); c.strokeStyle = col.strap; c.lineWidth = 3.4; tail();
      c.save(); c.translate(b0[0], b0[1]); c.rotate(bang - Math.PI / 2);
      rrect(c, -5.2, -4.5, 10.4, 9, 1.6); c.fillStyle = '#5b5f68'; c.fill(); c.strokeStyle = '#26282d'; c.lineWidth = 1.2; c.stroke();
      c.fillStyle = '#c9ccd2'; c.fillRect(-3, -1.2, 6, 2.4);
      c.restore();
      /* ring */
      var tw = 1 - Math.abs(R.twist * Math.sin(t * 9 + ph));
      c.beginPath(); c.ellipse(rx, ryy, RR * tw, RR, 0, 0, Math.PI * 2);
      c.strokeStyle = col.ringEdge; c.lineWidth = 7.4; c.stroke();
      c.strokeStyle = col.ring; c.lineWidth = 5; c.stroke();
      c.beginPath(); c.ellipse(rx, ryy, (RR + 0.8) * tw, RR + 0.8, 0, Math.PI * 1.1, Math.PI * 1.55);
      c.strokeStyle = col.ringLight; c.lineWidth = 1.4; c.stroke();
    }

    /* het lichaam staat in zijn eigen, licht gekantelde stelsel: de schouderlijn is nooit perfect recht */
    c.save(); c.translate(R.cx, R.sy); c.rotate(R.roll);
    var cx = 0, sy = 0, hy = TOR;

    /* benen */
    for (s = -1; s <= 1; s += 2) {
      var G = R.legs[s > 0 ? 1 : 0], c1 = Math.cos(G.phi), s1 = Math.sin(G.phi), c2 = Math.cos(G.psi), s2 = Math.sin(G.psi);
      var hx = cx + s * 10.5, hipY = hy + 10, tl = 45 * G.len, sl = 45 * (0.4 + 0.6 * G.len);
      var kx = hx + (-s * 1.9) * c1 + tl * s1, ky = hipY - (-s * 1.9) * s1 + tl * c1;           /* knie */
      var ax = kx + (-s * 2) * c2 + sl * s2, ay = ky - (-s * 2) * s2 + sl * c2;                 /* enkel */
      var bx = ax + (s * 2.4) * c2 + 17 * s2, by = ay - (s * 2.4) * s2 + 17 * c2;               /* bal van de voet */
      var toes = [[-4.5, 5.4, 2.7], [-1.5, 6.9, 2.1], [1.1, 6.7, 1.9], [3.3, 5.8, 1.7], [5.1, 4.4, 1.5]];
      for (i = 0; i < 2; i++) {
        var lf = i ? skin : null, ls = i ? null : ol;
        c.lineWidth = 2.8;
        limb(c, hx, hipY, 14.5, kx, ky, 9.6, lf, ls);
        limb(c, kx, ky, 9, ax, ay, 5, lf, ls);
        limb(c, kx + s * 1.2, ky + 7, 10.6, lerp(kx, ax, 0.55) + s * 0.8, lerp(ky, ay, 0.55), 7, lf, ls);
        for (var j = 0; j < 5; j++) limb(c, bx + s * toes[j][0], by + toes[j][1], toes[j][2], bx + s * toes[j][0], by + toes[j][1] + 0.01, toes[j][2], lf, ls);
        limb(c, ax - s * 4.4, ay - 1.5, 2.3, ax + s * 4.6, ay - 0.5, 2.5, lf, ls);   /* enkelknobbels */
        limb(c, ax, ay, 5, bx, by, 6.6, lf, ls);                                   /* wreef */
      }
      blob(c, lerp(hx, kx, 0.5) + s * 3, lerp(hy + 6, ky, 0.5), 5.6, 18, 0, li, 0.5);
      blob(c, lerp(kx, ax, 0.3) + s * 3, lerp(ky, ay, 0.3), 3.8, 11, 0, li, 0.45);
      blob(c, lerp(ax, bx, 0.6) + s * 1, lerp(ay, by, 0.6), 2.6, 6.5, -s * 0.12, li, 0.45);
      c.strokeStyle = sh; c.lineWidth = 1.2; c.globalAlpha = 0.75;
      c.beginPath(); c.moveTo(lerp(hx, kx, 0.55) - s * 5, lerp(hipY, ky, 0.55)); c.quadraticCurveTo(kx - s * 6, ky - 13, kx - s * 2.5, ky - 4); c.stroke();
      c.beginPath(); c.moveTo(lerp(hx, kx, 0.5) + s * 9, lerp(hipY, ky, 0.5)); c.quadraticCurveTo(kx + s * 8.5, ky - 14, kx + s * 4, ky - 5); c.stroke();
      c.beginPath(); c.arc(kx, ky + 0.5, 4.6, Math.PI * 0.15, Math.PI * 0.85); c.stroke();
      c.beginPath(); c.arc(kx, ky - 1.5, 5.2, Math.PI * 1.2, Math.PI * 1.8); c.stroke();
      c.beginPath(); c.moveTo(kx - s * 1.5, ky + 12); c.quadraticCurveTo(lerp(kx, ax, 0.5) - s * 2.6, lerp(ky, ay, 0.5), ax - s * 1, ay - 7); c.stroke();
      /* tenen aftekenen */
      c.lineWidth = 0.9;
      for (j = 0; j < 4; j++) line(c, bx + s * (toes[j][0] + toes[j + 1][0]) / 2, by + 3.2, bx + s * (toes[j][0] + toes[j + 1][0]) / 2, by + 6.2 - j * 0.5);
      c.globalAlpha = 0.55; blob(c, bx + s * toes[0][0], by + toes[0][1] + 0.4, 1.5, 1.2, 0, li, 1);
      c.globalAlpha = 1;
    }

    /* romp, nek en schouders: eerst een doorlopende omtrek, daarna vullen, zodat er geen naden zijn */
    var ARMS = [];
    for (i = 0; i < 2; i++) {
      s = i ? 1 : -1;
      var hp = R.hl[i], s0x = s * SH, vX = hp.x - s0x, vY = hp.y, dd = Math.max(0.001, Math.hypot(vX, vY)), vxm = s * vX;
      var kk = clamp((Math.abs(Math.atan2(vxm, vY)) * 180 / Math.PI - 90) / 35, -1, 1), hgg = Math.sqrt(Math.max(0, 1600 - dd * dd / 4));
      var bnd = 1 - Math.min(1, dd / ARM), ru = 12.6 + 3.2 * bnd;
      ARMS.push({ px: hp.x, py: hp.y, ex: s0x + vX / 2 + s * kk * hgg * (-vY) / dd, ey: vY / 2 + kk * hgg * vxm / dd, bend: bnd, rU: ru, dR: Math.max(14.4, ru + 1.8) });
    }
    var torso = function () {
      c.beginPath();
      c.moveTo(cx - 8.6, sy - 19); c.lineTo(cx + 8.6, sy - 19);
      c.bezierCurveTo(cx + 9.6, sy - 11.5, cx + 19, sy - 8.5, cx + SH - 1, sy - 4);          /* monnikskapspier */
      c.lineTo(cx + SH, sy + 8);
      c.bezierCurveTo(cx + SH + 6, sy + 22, cx + SH - 2, sy + 40, cx + 17, sy + 58);
      c.quadraticCurveTo(cx + 14.5, sy + 67, cx + 17.5, hy + 4);
      c.lineTo(cx - 17.5, hy + 4);
      c.quadraticCurveTo(cx - 14.5, sy + 67, cx - 17, sy + 58);
      c.bezierCurveTo(cx - SH + 2, sy + 40, cx - SH - 6, sy + 22, cx - SH, sy + 8);
      c.lineTo(cx - SH + 1, sy - 4);
      c.bezierCurveTo(cx - 19, sy - 8.5, cx - 9.6, sy - 11.5, cx - 8.6, sy - 19);
      c.closePath();
    };
    c.strokeStyle = ol; c.lineWidth = 2.8;
    torso(); c.stroke();
    limb(c, cx, sy - 5, 9.4, cx, sy - 18, 8.8, null, ol);
    for (s = -1; s <= 1; s += 2) { c.beginPath(); c.arc(cx + s * (SH + 1.5), sy + 1, ARMS[s > 0 ? 1 : 0].dR, 0, Math.PI * 2); c.stroke(); }
    torso(); c.fillStyle = skin; c.fill();
    limb(c, cx, sy - 5, 9.4, cx, sy - 18, 8.8, skin, null);
    /* zachte aftekening van nek en monnikskapspier */
    c.save(); c.strokeStyle = sh; c.lineWidth = 1.1; c.globalAlpha = 0.5;
    for (s = -1; s <= 1; s += 2) {
      c.beginPath(); c.moveTo(cx + s * 9, sy - 9.5); c.quadraticCurveTo(cx + s * 15, sy - 5.5, cx + s * 22, sy - 4.5); c.stroke();
    }
    c.restore();

    for (s = -1; s <= 1; s += 2) {
      /* borstspier */
      c.beginPath();
      c.moveTo(cx + s * 1.6, sy + 5);
      c.quadraticCurveTo(cx + s * 14, sy + 1, cx + s * 25, sy + 5);
      c.quadraticCurveTo(cx + s * 29, sy + 14, cx + s * 25, sy + 22);
      c.quadraticCurveTo(cx + s * 14, sy + 32, cx + s * 1.6, sy + 26);
      c.closePath();
      c.save(); c.globalAlpha = 0.5; c.fillStyle = li; c.fill(); c.restore();
      c.strokeStyle = sh; c.lineWidth = 1.5;
      c.beginPath(); c.moveTo(cx + s * 26, sy + 20); c.quadraticCurveTo(cx + s * 14, sy + 32, cx + s * 1.8, sy + 26.5); c.stroke();
      /* buikspieren */
      for (i = 0; i < 3; i++) {
        var w = 10.2 - i * 0.7, y0 = sy + 32.5 + i * 10.6;
        rrect(c, s > 0 ? cx + 1.3 : cx - 1.3 - w, y0, w, 8.8, 3);
        c.save(); c.globalAlpha = 0.45; c.fillStyle = li; c.fill(); c.restore();
        c.save(); c.globalAlpha = 0.8; c.strokeStyle = sh; c.lineWidth = 1.1; c.stroke(); c.restore();
      }
      /* zaagspieren, schuine buikspieren, sleutelbeen */
      c.save(); c.globalAlpha = 0.7; c.strokeStyle = sh; c.lineWidth = 1.1;
      line(c, cx + s * 24.5, sy + 30, cx + s * 17.5, sy + 34.5);
      line(c, cx + s * 23, sy + 38, cx + s * 16.5, sy + 42.5);
      line(c, cx + s * 21, sy + 46, cx + s * 15.5, sy + 50.5);
      line(c, cx + s * 15.5, sy + 63, cx + s * 7, sy + 73);
      line(c, cx + s * 3.5, sy - 1.5, cx + s * 20, sy - 3.5);
      c.restore();
    }
    c.strokeStyle = sh; c.lineWidth = 1.2;
    line(c, cx, sy + 6, cx, sy + 26);

    blob(c, cx - 22.5, sy + 34, 3.6, 15, 0.22, sh, 0.2); blob(c, cx + 22.5, sy + 34, 3.6, 15, -0.22, sh, 0.2);
    c.save(); c.globalAlpha = 0.8; c.strokeStyle = sh; c.lineWidth = 1.2;
    c.beginPath(); c.ellipse(cx, sy + 66.2, 1.1, 1.7, 0, 0, Math.PI * 2); c.stroke(); c.restore();

    /* short: sluit aan op de taille en valt ruim over de dijen */
    var lw = R.hem * 0.45, wy = hy - 12;
    c.beginPath();
    c.moveTo(cx - 18.5, wy); c.lineTo(cx + 18.5, wy);
    c.bezierCurveTo(cx + 25, wy + 7, cx + 28.5, hy + 10, cx + 29.5 + lw, hy + 36);
    c.lineTo(cx + 2.2 + lw, hy + 39); c.lineTo(cx, hy + 23); c.lineTo(cx - 2.2 + lw, hy + 39);
    c.lineTo(cx - 29.5 + lw, hy + 36);
    c.bezierCurveTo(cx - 28.5, hy + 10, cx - 25, wy + 7, cx - 18.5, wy);
    c.closePath(); c.fillStyle = col.accent; c.fill(); c.strokeStyle = col.accentDark; c.lineWidth = 1.5; c.stroke();
    c.save(); c.clip();
    c.fillStyle = col.accentDark; c.globalAlpha = 0.9; c.fillRect(cx - 32, wy, 64, 5.4);                 /* tailleband */
    c.globalAlpha = 0.16; c.fillStyle = '#000'; c.fillRect(cx - 32, wy + 5.4, 64, 3);                   /* schaduw eronder */
    c.globalAlpha = 0.22; c.fillStyle = '#fff'; c.fillRect(cx - 19, hy + 2, 7, 30);                     /* glans */
    c.globalAlpha = 1; c.strokeStyle = '#111'; c.lineWidth = 2.6;                                       /* zijstrepen */
    c.beginPath(); c.moveTo(cx - 23.5, wy + 7); c.quadraticCurveTo(cx - 26.5, hy + 12, cx - 26.5 + lw, hy + 40); c.stroke();
    c.beginPath(); c.moveTo(cx + 23.5, wy + 7); c.quadraticCurveTo(cx + 26.5, hy + 12, cx + 26.5 + lw, hy + 40); c.stroke();
    c.strokeStyle = col.accentDark; c.lineWidth = 1.1; c.globalAlpha = 0.85;                            /* zoom en plooien */
    line(c, cx - 30 + lw, hy + 32, cx - 2.6 + lw, hy + 35); line(c, cx + 30 + lw, hy + 32, cx + 2.6 + lw, hy + 35);
    c.beginPath(); c.moveTo(cx, hy + 22); c.quadraticCurveTo(cx - 6, hy + 14, cx - 12, hy + 11); c.stroke();
    c.beginPath(); c.moveTo(cx, hy + 22); c.quadraticCurveTo(cx + 6, hy + 14, cx + 12, hy + 11); c.stroke();
    c.restore();
    c.strokeStyle = '#f4f4f4'; c.lineWidth = 1.3; c.lineCap = 'round';                                  /* koordje */
    c.beginPath(); c.moveTo(cx - 1, wy + 4.5); c.quadraticCurveTo(cx - 4.2, wy + 10, cx - 2.6, wy + 14.5); c.stroke();
    c.beginPath(); c.moveTo(cx + 1, wy + 4.5); c.quadraticCurveTo(cx + 3.8, wy + 9, cx + 2.8, wy + 12.5); c.stroke();

    /* nek en hoofd */
    blob(c, cx, sy - 15.5, 8, 4.4, 0, sh, 0.38);                                                        /* schaduw onder de kin */
    c.save(); c.globalAlpha = 0.6; c.strokeStyle = sh; c.lineWidth = 1.1;
    line(c, cx - 4.2, sy - 12, cx - 1.2, sy - 3.5); line(c, cx + 4.2, sy - 12, cx + 1.2, sy - 3.5); c.restore();

    var HW = 14.4, HH = 18, dark = '#1b1310', ey0 = 2.2, sw2 = R.tailY;
    c.save(); c.translate(cx, sy - 12); c.rotate(R.headTilt); c.translate(0, -23.5 + R.headDy); c.scale(1.08, 1.08);
    /* lintjes van de hoofdband */
    c.fillStyle = col.accent; c.strokeStyle = col.accentDark; c.lineWidth = 1;
    c.beginPath(); c.moveTo(HW - 2, -9); c.lineTo(HW + 10, -11.5 + sw2); c.lineTo(HW + 9, -7.5 + sw2 * 1.1); c.lineTo(HW - 2, -5.5); c.closePath(); c.fill(); c.stroke();
    c.beginPath(); c.moveTo(HW - 2, -7.5); c.lineTo(HW + 8.5, -4.5 + sw2 * 0.7); c.lineTo(HW + 6.5, -1.4 + sw2 * 0.8); c.lineTo(HW - 2, -4.6); c.closePath(); c.fill(); c.stroke();
    /* oren */
    for (s = -1; s <= 1; s += 2) {
      c.beginPath(); c.ellipse(s * (HW + 0.9), 1.6, 3.1, 5, s * 0.14, 0, Math.PI * 2);
      c.fillStyle = skin; c.fill(); c.strokeStyle = ol; c.lineWidth = 1.3; c.stroke();
      c.beginPath(); c.arc(s * (HW + 1.1), 1.8, 2.3, s > 0 ? -Math.PI * 0.45 : Math.PI * 0.55, s > 0 ? Math.PI * 0.45 : Math.PI * 1.45);
      c.strokeStyle = sh; c.lineWidth = 0.9; c.stroke();
    }
    /* haar: volume boven en achter het hoofd */
    c.beginPath(); c.moveTo(-HW - 1.2, -5);
    c.bezierCurveTo(-HW - 2.4, -17.5, -8.5, -23.4, -1, -22.6);
    c.bezierCurveTo(3, -24.6, 9, -23.4, 11, -20.6);
    c.bezierCurveTo(HW + 2.2, -18, HW + 2, -11, HW + 1.2, -5);
    c.closePath(); c.fillStyle = col.hair; c.fill();
    /* hoofd */
    headPath(c, HW, HH); c.fillStyle = skin; c.fill(); c.strokeStyle = ol; c.lineWidth = 1.4; c.stroke();
    c.save(); headPath(c, HW, HH); c.clip();
    blob(c, -5.5, 6.5, 6, 7.5, 0, li, 0.28); blob(c, 9.5, 9, 5, 9, 0.2, sh, 0.16);
    c.fillStyle = col.hair; c.fillRect(-HW - 1, -HH - 1, HW * 2 + 2, 9.4);
    c.fillRect(-HW - 1, -5, 2.4, 4.6); c.fillRect(HW - 1.4, -5, 2.4, 4.6);                              /* bakkebaarden */
    c.fillStyle = col.accent; c.fillRect(-HW - 1, -9.8, HW * 2 + 2, 5.6);
    c.fillStyle = col.accentDark; c.fillRect(-HW - 1, -4.9, HW * 2 + 2, 1); c.globalAlpha = 0.35; c.fillStyle = '#fff'; c.fillRect(-HW - 1, -9.8, HW * 2 + 2, 1.2);
    c.restore();
    c.strokeStyle = '#4b3324'; c.lineWidth = 1.1;                                                       /* lokken */
    c.beginPath(); c.moveTo(-8, -12.4); c.quadraticCurveTo(-5, -19.5, 1, -20.4); c.stroke();
    c.beginPath(); c.moveTo(-2, -12.2); c.quadraticCurveTo(2, -18.6, 8, -19); c.stroke();
    c.beginPath(); c.moveTo(5, -12.2); c.quadraticCurveTo(8, -16, 11.4, -16.4); c.stroke();
    c.beginPath(); c.arc(HW - 1.2, -7, 2.3, 0, Math.PI * 2); c.fillStyle = col.accent; c.fill(); c.strokeStyle = col.accentDark; c.lineWidth = 1; c.stroke();

    /* wenkbrauwen */
    c.strokeStyle = col.hair; c.lineWidth = 2.3; c.lineCap = 'round';
    for (s = -1; s <= 1; s += 2) {
      c.beginPath();
      if (R.happy) { c.moveTo(s * 10.4, ey0 - 4.4); c.quadraticCurveTo(s * 6.6, ey0 - 7.6, s * 2.9, ey0 - 5); }
      else if (R.moving) { c.moveTo(s * 10.6, ey0 - 5.8); c.lineTo(s * 2.5, ey0 - 2.6); }
      else { c.moveTo(s * 10.4, ey0 - 4.6); c.quadraticCurveTo(s * 6.6, ey0 - 5.8, s * 2.9, ey0 - 4.2); }
      c.stroke();
    }
    /* ogen */
    var open = (R.happy ? 2.5 : R.moving ? 1.6 : 2.3) * (1 - 0.92 * R.blink);
    for (s = -1; s <= 1; s += 2) {
      var ex0 = s * 6.3;
      c.beginPath(); c.ellipse(ex0, ey0, 3.7, open, 0, 0, Math.PI * 2); c.fillStyle = '#fff'; c.fill();
      c.save(); c.clip();
      c.beginPath(); c.arc(ex0, ey0 + 0.1, 2.05, 0, Math.PI * 2); c.fillStyle = '#5a3520'; c.fill();
      c.beginPath(); c.arc(ex0, ey0 + 0.1, 1.0, 0, Math.PI * 2); c.fillStyle = '#0d0907'; c.fill();
      c.beginPath(); c.arc(ex0 - 0.9, ey0 - 0.8, 0.7, 0, Math.PI * 2); c.fillStyle = '#fff'; c.fill();
      c.restore();
      c.strokeStyle = sh; c.lineWidth = 0.7; c.beginPath(); c.ellipse(ex0, ey0, 3.7, open, 0, 0, Math.PI * 2); c.stroke(); c.strokeStyle = dark;
      c.lineWidth = 1.4; c.beginPath(); c.ellipse(ex0, ey0, 3.7, open, 0, Math.PI * 1.03, Math.PI * 1.97); c.stroke();
      if (R.happy) { c.strokeStyle = sh; c.lineWidth = 1; c.beginPath(); c.arc(ex0, ey0 + 1.6, 4.4, Math.PI * 0.2, Math.PI * 0.8); c.stroke(); }
    }
    /* neus */
    c.strokeStyle = sh; c.lineWidth = 1.2;
    c.beginPath(); c.moveTo(1.7, ey0 + 1.2); c.quadraticCurveTo(2.9, 6.4, 3.4, 8); c.stroke();
    c.beginPath(); c.moveTo(-3.3, 8.2); c.quadraticCurveTo(-1.9, 10.2, 0, 9.3); c.quadraticCurveTo(1.9, 10.2, 3.3, 8.2); c.stroke();
    blob(c, -0.3, 7, 1.7, 1.4, 0, li, 0.7);
    /* mond */
    c.strokeStyle = dark; c.lineCap = 'round';
    if (R.happy) {
      var grin = function () { c.beginPath(); c.moveTo(-6.3, 10.8); c.quadraticCurveTo(0, 12.2, 6.3, 10.8); c.quadraticCurveTo(4.8, 15.8, 0, 15.8); c.quadraticCurveTo(-4.8, 15.8, -6.3, 10.8); c.closePath(); };
      grin(); c.fillStyle = '#6e1a1a'; c.fill();
      c.save(); c.clip(); c.fillStyle = '#fff'; c.fillRect(-7, 10.2, 14, 3.1); blob(c, 0, 15.9, 3.2, 1.5, 0, '#e56f7c', 1); c.restore();
      grin(); c.strokeStyle = dark; c.lineWidth = 1.1; c.stroke();
      c.strokeStyle = sh; c.lineWidth = 1; line(c, -7.6, 10, -7.2, 11.6); line(c, 7.6, 10, 7.2, 11.6);
      blob(c, -9.6, 7.6, 2.9, 1.8, 0, '#ff6f61', 0.28); blob(c, 9.6, 7.6, 2.9, 1.8, 0, '#ff6f61', 0.28);
    } else if (R.moving) {
      rrect(c, -5, 10.9, 10, 4.2, 1.5); c.fillStyle = '#fff'; c.fill(); c.lineWidth = 1.1; c.stroke();
      c.lineWidth = 0.7; line(c, -4.6, 13, 4.6, 13); line(c, -1.7, 11.2, -1.7, 14.8); line(c, 1.7, 11.2, 1.7, 14.8);
    } else {
      c.lineWidth = 1.5; c.beginPath(); c.moveTo(-4.6, 12.3); c.quadraticCurveTo(0, 13.6, 4.8, 11.9); c.stroke();
      c.strokeStyle = sh; c.lineWidth = 1; line(c, -1.8, 15, 1.8, 15);
    }
    /* kaaklijn */
    c.save(); c.globalAlpha = 0.55; c.strokeStyle = sh; c.lineWidth = 1;
    c.beginPath(); c.moveTo(-HW + 2, 6.5); c.quadraticCurveTo(-HW + 3.4, 12, -HW + 6.8, 14.6); c.stroke();
    c.beginPath(); c.moveTo(HW - 2, 6.5); c.quadraticCurveTo(HW - 3.4, 12, HW - 6.8, 14.6); c.stroke();
    c.restore();
    c.restore();

    /* armen */
    for (s = -1; s <= 1; s += 2) {
      var sx = cx + s * SH, A = ARMS[s > 0 ? 1 : 0];
      var ex = A.ex, ey = A.ey, px = A.px, py = A.py, bend = A.bend, rU = A.rU, dR = A.dR;
      var dxs = sx + s * 1.5, dys = sy + 1;
      for (i = 0; i < 2; i++) {
        var af = i ? skin : null, as = i ? null : ol;
        c.lineWidth = 2.8;
        limb(c, sx, sy, rU, ex, ey, 9.6, af, as);
        limb(c, ex, ey, 10, px, py, 6.2, af, as);
        limb(c, px, py, 6.8, px, py + 0.01, 6.8, af, as);
        /* schouderspier als druppelvorm die uitloopt in de bovenarm */
        limb(c, dxs, dys, dR, lerp(sx, ex, 0.6), lerp(sy, ey, 0.6), lerp(rU, 9.6, 0.6) + 0.5, af, as);
      }
      /* waar de schouder over de romp ligt verdwijnt de omtrek: borst, nek en schouder lopen in elkaar over */
      c.save(); torso(); c.clip();
      c.beginPath(); c.arc(dxs, dys, dR + 1.7, 0, Math.PI * 2); c.fillStyle = skin; c.fill();
      c.restore();
      var ua = Math.atan2(ey - sy, ex - sx), ul2 = Math.hypot(ex - sx, ey - sy);
      var fa = Math.atan2(py - ey, px - ex), fl = Math.hypot(px - ex, py - ey);
      blob(c, lerp(sx, ex, 0.56), lerp(sy, ey, 0.56), ul2 * 0.3, 5.6 + 3.6 * bend, ua, li, 0.55);
      blob(c, lerp(ex, px, 0.3), lerp(ey, py, 0.3), fl * 0.26, 4.8, fa, li, 0.5);
      /* polsband */
      c.lineWidth = 1.2;
      limb(c, lerp(ex, px, 0.66), lerp(ey, py, 0.66), 7.4, lerp(ex, px, 0.8), lerp(ey, py, 0.8), 6.9, '#f4f4f4', '#9a9a9a');
      /* vuist om de ring: vingers en duim */
      rrect(c, px - 7.2, py - 6, 14.4, 12, 4.6); c.fillStyle = skin; c.fill(); c.strokeStyle = ol; c.lineWidth = 1.4; c.stroke();
      c.save(); c.globalAlpha = 0.75; c.strokeStyle = sh; c.lineWidth = 1;
      line(c, px - 3.5, py - 5.2, px - 3.5, py + 1.4); line(c, px, py - 5.4, px, py + 1.6); line(c, px + 3.5, py - 5.2, px + 3.5, py + 1.4);
      c.restore();
      c.beginPath(); c.ellipse(px - s * 3.4, py + 3.3, 4.6, 2.5, s * 0.25, 0, Math.PI * 2);
      c.fillStyle = skin; c.fill(); c.strokeStyle = ol; c.lineWidth = 1.1; c.stroke();
      c.save(); c.globalAlpha = 0.6; c.strokeStyle = '#b9b9b9'; c.lineWidth = 0.9;                       /* polsband: wikkels */
      var w1x = lerp(ex, px, 0.7), w1y = lerp(ey, py, 0.7), w2x = lerp(ex, px, 0.76), w2y = lerp(ey, py, 0.76), nx = -(py - ey) / fl, ny = (px - ex) / fl;
      line(c, w1x - nx * 6, w1y - ny * 6, w1x + nx * 6, w1y + ny * 6); line(c, w2x - nx * 6, w2y - ny * 6, w2x + nx * 6, w2y + ny * 6);
      c.restore();
      /* schouderspier: glans en zachte aftekening */
      blob(c, dxs + s * 1.5, dys - 3.5, 7.6, 6.4, 0, li, 0.5);
      c.save(); c.strokeStyle = sh; c.lineWidth = 1.1;
      var m = Math.atan2(ey - sy, ex - sx);
      c.globalAlpha = 0.55; c.beginPath(); c.arc(dxs, dys, dR - 2, m - 0.8, m + 0.8); c.stroke();                 /* naar de bovenarm */
      c.globalAlpha = 0.4; c.beginPath();                                                                   /* naar de borst */
      if (s > 0) c.arc(dxs, dys, dR - 1.2, Math.PI * 0.6, Math.PI * 1.02); else c.arc(dxs, dys, dR - 1.2, -Math.PI * 0.02, Math.PI * 0.4);
      c.stroke(); c.restore();
    }
    c.restore();
  }

  /* ---------- simulatie: turner + effecten ---------- */
  function createSim(o, W, H) {
    var accent = o.accent;
    var col = {
      skin: '#D99A6C', skinShade: '#9E5E36', skinLight: '#F3C49C', outline: '#6E3D1F',
      hair: '#2a1a12', accent: accent, accentDark: shade(accent, -0.45),
      strap: '#e9e9e9', strapEdge: '#8d8d8d', ring: '#E6BE82', ringEdge: '#7a5a2c', ringLight: '#fff3d6'
    };
    var kind = o.particles || KIND[o.type] || 'confetti';
    var glow = o.glow || (kind === 'hearts' ? HEART : accent);
    var colors = o.colors || (kind === 'hearts' ? [HEART, HEART, '#FF6B8A', '#FF9DB1', '#ffffff', accent]
      : kind === 'gifts' ? [accent, '#ffffff', HEART, '#7CF7FF', '#FFE94A']
      : [accent, '#ffffff', '#e8e8e8', shade(accent, 0.45), '#FFE94A', '#7CF7FF']);
    var amount = kind === 'hearts' ? 0.75 : kind === 'gifts' ? 0.5 : 1;
    var sim = {
      t: 0, W: W, H: H, s: 1, top: 0, ox: 0, end: (o.short ? END_SHORT : END_FULL) + Math.max(0, o.hold || 0), kind: kind,
      conf: [], chalk: [], lines: [], waves: [], stars: [], chev: [],
      flash: 0, shake: 0, burst: false, gripped: false, acc: { rain: 0, lines: 0, chev: 0 }
    };
    var cap;
    sim.resize = function (w, h, textH) {
      sim.W = w; sim.H = h;
      textH = textH || h * 0.2;
      sim.s = clamp(Math.min(w / 400, (h * 0.95 - textH) / SCENE_H), 0.35, 1.5);
      sim.top = Math.max(h * 0.02, (h - SCENE_H * sim.s - textH) / 2);
      sim.ox = w / 2;
      cap = clamp(Math.round(w * h / 5200), 110, 300);
    };
    sim.resize(W, H);
    sim.textTop = function () { return sim.top + (SCENE_H - 12) * sim.s; };

    function toScreen(x, y, R) { return [sim.ox + x * sim.s, sim.top + (y + R.rigY) * sim.s]; }

    function confetti(x, y, ang, spread, v0, v1, n, rise) {
      for (var i = 0; i < n; i++) {
        var a = ang + rnd(-spread, spread), v = rnd(v0, v1) * sim.s, color = pick(colors);
        var p = { x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, ph: rnd(0, 6.28), vph: rnd(5, 13), color: color, life: 0, drag: rnd(1.5, 2.6), g: 1, front: Math.random() < 0.5 };
        if (kind === 'hearts') {
          p.w = rnd(8, 17) * sim.s; p.rot = rnd(-0.45, 0.45); p.vr = 0; p.vph = rnd(3, 6);
          p.g = rise ? -0.16 : 0.5; if (rise) p.drag = rnd(0.3, 0.7);
        } else if (kind === 'gifts') {
          p.w = rnd(17, 31) * sim.s; p.rot = rnd(0, 6.28); p.vr = rnd(-4.5, 4.5); p.g = 1.15;
          p.dark = shade(color, -0.25); p.ribbon = lum(color) > 0.92 ? HEART : lum(color) > 0.55 ? '#15171c' : '#ffffff';
        } else {
          var k2 = Math.random();
          p.w = rnd(6, 11) * sim.s * (k2 > 0.85 ? 0.55 : 1); p.h = rnd(8, 15) * sim.s * (k2 > 0.85 ? 2.4 : 1);
          p.rot = rnd(0, 6.28); p.vr = rnd(-7, 7); p.round = k2 < 0.14;
        }
        sim.conf.push(p);
      }
    }
    function chalkPuff(x, y, n, power) {
      for (var i = 0; i < n; i++) {
        var a = rnd(0, 6.28), v = rnd(10, 70) * power * sim.s;
        sim.chalk.push({ x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 25 * sim.s, r: rnd(3, 9) * sim.s, life: 0, max: rnd(0.5, 1.1) });
      }
    }

    function fireBurst(R) {
      var c0 = toScreen(R.cx, R.sy + 30, R), W = sim.W, H = sim.H, n = cap * amount;
      sim.flash = 1; sim.shake = 1;
      sim.waves.push({ x: c0[0], y: c0[1], life: 0, delay: 0 }, { x: c0[0], y: c0[1], life: 0, delay: 0.16 });
      confetti(W * 0.5 - Math.min(W * 0.46, 330 * sim.s), H * 0.9, -Math.PI * 0.36, 0.34, 700, 1500, Math.round(n * 0.36));
      confetti(W * 0.5 + Math.min(W * 0.46, 330 * sim.s), H * 0.9, -Math.PI * 0.64, 0.34, 700, 1500, Math.round(n * 0.36));
      confetti(c0[0], c0[1], -Math.PI / 2, Math.PI, 250, 900, Math.round(n * 0.28));
      var hl = toScreen(R.hw[0].x, R.hw[0].y, R), hr = toScreen(R.hw[1].x, R.hw[1].y, R);
      chalkPuff(hl[0], hl[1], 12, 1.4); chalkPuff(hr[0], hr[1], 12, 1.4);
      for (var i = 0; i < 16; i++) {
        var a = rnd(0, 6.28), rad = rnd(110, 235) * sim.s;
        sim.stars.push({ x: c0[0] + Math.cos(a) * rad * 1.05, y: c0[1] + Math.sin(a) * rad * 0.85 - 20 * sim.s, size: rnd(7, 17) * sim.s, life: -rnd(0, 0.9), max: rnd(0.5, 0.9), color: Math.random() < 0.55 ? glow : '#fff' });
      }
    }

    sim.step = function (dt) {
      var t0 = sim.t; sim.t += dt; var t = sim.t, s = sim.s, i, p;
      var R = computeRig(t, o.short);
      sim.R = R;
      if (!sim.gripped && t >= T_IN * 0.92) {
        sim.gripped = true;
        var a1 = toScreen(R.hw[0].x, R.hw[0].y, R), a2 = toScreen(R.hw[1].x, R.hw[1].y, R);
        chalkPuff(a1[0], a1[1], 6, 0.8); chalkPuff(a2[0], a2[1], 6, 0.8);
      }
      if (!sim.burst && t >= LOCK) { sim.burst = true; fireBurst(R); if (sim.onBurst) sim.onBurst(); }
      var fadeStart = sim.end - FADE;
      /* snelheidslijnen tijdens het optrekken */
      if (t > 0.85 && t < LOCK) {
        sim.acc.lines += dt * 46;
        while (sim.acc.lines > 1) {
          sim.acc.lines--;
          var lx = sim.ox + rnd(-150, 150) * s;
          sim.lines.push({ x: lx, y: sim.top + rnd(20, 330) * s, len: rnd(30, 90) * s, v: rnd(700, 1200) * s, life: 0, max: rnd(0.18, 0.3) });
        }
      }
      /* confettiregen na de explosie */
      if (sim.burst && t > LOCK + 0.2 && t < fadeStart - 0.2) {
        sim.acc.rain += dt * cap * amount * 0.2;
        while (sim.acc.rain > 1) {
          sim.acc.rain--;
          if (kind === 'hearts') confetti(rnd(0, sim.W), sim.H + 20, -Math.PI / 2, 0.3, 380, 760, 1, true);   // hartjes stijgen op
          else confetti(rnd(0, sim.W), -24, Math.PI / 2, 0.5, 60, 240, 1);
        }
      }
      /* pijltjes omhoog bij een stijging in de ranking */
      if (o.type === 'rank' && sim.burst && t < fadeStart) {
        sim.acc.chev += dt * 7;
        while (sim.acc.chev > 1) {
          sim.acc.chev--;
          var side = Math.random() < 0.5 ? -1 : 1;
          sim.chev.push({ x: sim.ox + side * rnd(150, 205) * s, y: sim.top + rnd(250, 430) * s, v: rnd(150, 260) * s, size: rnd(9, 16) * s, life: 0, max: rnd(0.8, 1.2) });
        }
      }
      var g = 1500 * s;
      for (i = sim.conf.length - 1; i >= 0; i--) {
        p = sim.conf[i]; p.life += dt;
        var dr = Math.exp(-p.drag * dt);
        p.vx *= dr; p.vy = p.vy * dr + g * dt * 0.42 * p.g;
        p.ph += p.vph * dt; p.rot += p.vr * dt;
        p.x += (p.vx + Math.sin(p.ph * 0.7) * 38 * s) * dt; p.y += p.vy * dt;
        if (p.y > sim.H + 40 || p.y < -80 || p.life > 7) sim.conf.splice(i, 1);
      }
      for (i = sim.chalk.length - 1; i >= 0; i--) {
        p = sim.chalk[i]; p.life += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= Math.exp(-3 * dt); p.vy *= Math.exp(-3 * dt); p.r += 14 * s * dt;
        if (p.life > p.max) sim.chalk.splice(i, 1);
      }
      for (i = sim.lines.length - 1; i >= 0; i--) { p = sim.lines[i]; p.life += dt; p.y += p.v * dt; if (p.life > p.max) sim.lines.splice(i, 1); }
      for (i = sim.waves.length - 1; i >= 0; i--) { p = sim.waves[i]; if (p.delay > 0) p.delay -= dt; else p.life += dt; if (p.life > 0.75) sim.waves.splice(i, 1); }
      for (i = sim.stars.length - 1; i >= 0; i--) { p = sim.stars[i]; p.life += dt; if (p.life > p.max) { if (t < fadeStart - 1) { p.life = -rnd(0.1, 0.8); p.x += rnd(-30, 30) * s; p.y += rnd(-30, 30) * s; } else sim.stars.splice(i, 1); } }
      for (i = sim.chev.length - 1; i >= 0; i--) { p = sim.chev[i]; p.life += dt; p.y -= p.v * dt; if (p.life > p.max) sim.chev.splice(i, 1); }
      sim.flash = Math.max(0, sim.flash - dt * 4.5);
      sim.shake = Math.max(0, sim.shake - dt * 3.2);
      return t0 < sim.end && t >= sim.end;
    };

    sim.draw = function (c) {
      var t = sim.t, s = sim.s, W = sim.W, H = sim.H, R = sim.R || computeRig(t, o.short), i, p, k;
      c.clearRect(0, 0, W, H);
      var tau = t - LOCK;
      var gx = sim.ox, gy = sim.top + (R.sy + 30 + R.rigY) * s;

      /* spot achter de turner */
      var spot = c.createRadialGradient(gx, sim.top + 190 * s, 10, gx, sim.top + 190 * s, 330 * s);
      spot.addColorStop(0, 'rgba(255,255,255,' + (0.13 + (tau > 0 ? 0.07 : 0)) + ')'); spot.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = spot; c.fillRect(0, 0, W, H);

      /* draaiende stralen na de explosie */
      if (tau > 0) {
        var ra = Math.min(1, tau / 0.35) * 0.09;
        c.save(); c.translate(gx, gy); c.rotate(t * 0.35); c.fillStyle = glow; c.globalAlpha = ra;
        var RL = Math.max(W, H);
        for (i = 0; i < 12; i++) {
          c.rotate(Math.PI / 6); c.beginPath(); c.moveTo(0, 0); c.lineTo(RL, -RL * 0.085); c.lineTo(RL, RL * 0.085); c.closePath(); c.fill();
        }
        c.restore();
      }

      /* schokgolven */
      for (i = 0; i < sim.waves.length; i++) {
        p = sim.waves[i]; if (p.delay > 0) continue; k = p.life / 0.75;
        var wr = (30 + 400 * (1 - Math.pow(1 - k, 3))) * s;
        if (kind === 'hearts') { c.save(); c.translate(p.x, p.y - wr * 0.1); heartPath(c, wr * 0.8); c.restore(); }
        else { c.beginPath(); c.arc(p.x, p.y, wr, 0, Math.PI * 2); }
        c.strokeStyle = i ? '#fff' : glow; c.globalAlpha = (1 - k) * 0.8; c.lineWidth = (1 - k) * 12 * s + 1; c.stroke();
      }
      c.globalAlpha = 1;

      /* snelheidslijnen */
      c.strokeStyle = '#fff'; c.lineCap = 'round';
      for (i = 0; i < sim.lines.length; i++) {
        p = sim.lines[i]; c.globalAlpha = 0.34 * (1 - p.life / p.max); c.lineWidth = 2 * s;
        line(c, p.x, p.y, p.x, p.y + p.len);
      }
      c.globalAlpha = 1;

      /* pijltjes omhoog */
      c.strokeStyle = col.accent; c.lineJoin = 'miter'; c.lineCap = 'butt';
      for (i = 0; i < sim.chev.length; i++) {
        p = sim.chev[i]; k = p.life / p.max; c.globalAlpha = Math.sin(Math.PI * k) * 0.85; c.lineWidth = p.size * 0.34;
        c.beginPath(); c.moveTo(p.x - p.size, p.y + p.size * 0.7); c.lineTo(p.x, p.y - p.size * 0.3); c.lineTo(p.x + p.size, p.y + p.size * 0.7); c.stroke();
      }
      c.globalAlpha = 1;

      /* confetti achter de turner */
      drawConfetti(c, 0);

      /* turner */
      var shx = 0, shy = 0;
      if (sim.shake > 0) { shx = Math.sin(t * 90) * 5 * sim.shake * s; shy = Math.cos(t * 77) * 4 * sim.shake * s; }
      c.save(); c.translate(sim.ox + shx, sim.top + R.rigY * s + shy); c.scale(s, s);
      drawGymnast(c, R, col);
      c.restore();

      /* magnesiumwolkjes */
      for (i = 0; i < sim.chalk.length; i++) {
        p = sim.chalk[i]; c.globalAlpha = 0.3 * (1 - p.life / p.max);
        c.beginPath(); c.arc(p.x, p.y, p.r, 0, Math.PI * 2); c.fillStyle = '#fff'; c.fill();
      }
      c.globalAlpha = 1;

      /* sterretjes */
      for (i = 0; i < sim.stars.length; i++) {
        p = sim.stars[i]; if (p.life < 0) continue; k = Math.sin(Math.PI * p.life / p.max);
        var z = p.size * k; c.fillStyle = p.color; c.globalAlpha = k;
        c.beginPath();
        c.moveTo(p.x, p.y - z); c.quadraticCurveTo(p.x, p.y, p.x + z, p.y); c.quadraticCurveTo(p.x, p.y, p.x, p.y + z);
        c.quadraticCurveTo(p.x, p.y, p.x - z, p.y); c.quadraticCurveTo(p.x, p.y, p.x, p.y - z); c.fill();
      }
      c.globalAlpha = 1;

      /* confetti voor de turner */
      drawConfetti(c, 1);

      if (sim.flash > 0) { c.globalAlpha = sim.flash * 0.55; c.fillStyle = '#fff'; c.fillRect(0, 0, W, H); c.globalAlpha = 1; }
    };

    function drawConfetti(c, layer) {
      for (var i = 0; i < sim.conf.length; i++) {
        var p = sim.conf[i];
        if (p.front !== !!layer) continue;
        c.save(); c.translate(p.x, p.y); c.globalAlpha = p.life > 6 ? Math.max(0, 7 - p.life) : 1;
        if (kind === 'hearts') {
          var z = 1 + Math.sin(p.ph) * 0.12;
          c.rotate(p.rot + Math.sin(p.ph * 0.5) * 0.25); c.scale(z, z);
          heartPath(c, p.w); c.fillStyle = p.color; c.fill();
          c.globalAlpha *= 0.45; c.fillStyle = '#fff';
          c.beginPath(); c.ellipse(-p.w * 0.45, -p.w * 0.4, p.w * 0.2, p.w * 0.13, -0.6, 0, 6.2832); c.fill();
        } else if (kind === 'gifts') {
          c.rotate(p.rot); drawGift(c, p.w, p.color, p.dark, p.ribbon);
        } else {
          var fl = Math.cos(p.ph);
          c.rotate(p.rot); c.scale(1, Math.abs(fl) < 0.12 ? 0.12 : fl); c.fillStyle = p.color;
          if (p.round) { c.beginPath(); c.arc(0, 0, p.w * 0.55, 0, Math.PI * 2); c.fill(); }
          else c.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        }
        c.restore();
      }
    }
    return sim;
  }

  /* ---------- DOM ---------- */
  var STYLE_ID = 'lu-cel-style';
  function injectCss(doc) {
    if (doc.getElementById(STYLE_ID)) return;
    var st = doc.createElement('style'); st.id = STYLE_ID;
    st.textContent = [
      '.lu-cel{position:fixed;inset:0;overflow:hidden;opacity:0;-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);transition:opacity .28s ease;font-family:inherit;-webkit-tap-highlight-color:transparent;touch-action:manipulation}',
      '.lu-cel.is-in{opacity:1}',
      '.lu-cel.is-click{cursor:pointer}',
      '.lu-cel__cv{position:absolute;inset:0;width:100%;height:100%;display:block}',
      '.lu-cel.is-pixel .lu-cel__cv{image-rendering:pixelated;image-rendering:crisp-edges}',
      '.lu-cel__txt{position:absolute;left:0;right:0;padding:0 16px;text-align:center;color:#fff;pointer-events:none;opacity:0;transform:translateY(14px) scale(.6)}',
      '.lu-cel.is-on .lu-cel__txt{opacity:1;transform:none;transition:opacity .18s ease,transform .5s cubic-bezier(.2,1.7,.35,1)}',
      '.lu-cel__title{margin:0;font-weight:900;font-style:italic;text-transform:uppercase;letter-spacing:.02em;line-height:1;font-size:clamp(30px,8.5vmin,76px);color:#fff;text-shadow:.055em .055em 0 var(--lu-glow,var(--lu-accent)),0 0 .5em rgba(0,0,0,.6)}',
      '.lu-cel__rank{display:flex;justify-content:center;align-items:center;gap:.5em;margin-top:.45em;font-weight:800;font-size:clamp(20px,5vmin,40px);line-height:1;font-variant-numeric:tabular-nums}',
      '.lu-cel__from{color:rgba(255,255,255,.5);text-decoration:line-through;text-decoration-thickness:.08em}',
      '.lu-cel__arrow{width:0;height:0;border-left:.34em solid transparent;border-right:.34em solid transparent;border-bottom:.5em solid var(--lu-accent);animation:lu-cel-up .7s ease-in-out infinite}',
      '.lu-cel__to{color:#0b0c0f;background:var(--lu-accent);padding:.12em .4em;border-radius:.2em}',
      '.lu-cel__sub{margin-top:.7em;font-size:clamp(14px,2.6vmin,20px);font-weight:500;color:rgba(255,255,255,.86);line-height:1.35}',
      '.lu-cel__x{position:absolute;top:12px;right:12px;width:40px;height:40px;border:0;border-radius:50%;background:rgba(255,255,255,.12);color:#fff;font:400 24px/1 inherit;cursor:pointer}',
      '.lu-cel__x:hover{background:rgba(255,255,255,.22)}',
      '.lu-cel__x:focus-visible{outline:2px solid var(--lu-accent);outline-offset:2px}',
      '@keyframes lu-cel-up{0%,100%{transform:translateY(.08em)}50%{transform:translateY(-.14em)}}',
      '@media (prefers-reduced-motion:reduce){.lu-cel__arrow{animation:none}.lu-cel.is-on .lu-cel__txt{transition:none}}'
    ].join('');
    doc.head.appendChild(st);
  }

  var active = null;

  function play(options) {
    var o = {}, k;
    for (k in DEFAULTS) o[k] = DEFAULTS[k];
    for (k in (options || {})) if (options[k] !== undefined) o[k] = options[k];
    if (typeof document === 'undefined') return Promise.resolve();
    if (active) active.close(true);

    var doc = document, host = o.container || doc.body;
    injectCss(doc);
    var txt = TEXT[o.type] || TEXT.rank;
    var hasRank = o.type === 'rank' && o.to != null;
    var reduce = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

    var el = doc.createElement('div');
    el.className = 'lu-cel' + (o.pixel ? ' is-pixel' : '') + (o.dismissOnClick ? ' is-click' : '');
    el.setAttribute('role', 'status'); el.setAttribute('aria-live', 'polite');
    el.style.zIndex = o.zIndex; el.style.background = o.backdrop; el.style.setProperty('--lu-accent', o.accent);
    el.style.setProperty('--lu-glow', o.glow || ((o.particles || KIND[o.type]) === 'hearts' ? HEART : o.accent));
    var cv = doc.createElement('canvas'); cv.className = 'lu-cel__cv'; cv.setAttribute('aria-hidden', 'true');
    var box = doc.createElement('div'); box.className = 'lu-cel__txt';
    var title = doc.createElement('p'); title.className = 'lu-cel__title'; title.textContent = o.title || txt.title; box.appendChild(title);
    var toEl = null;
    if (hasRank) {
      var row = doc.createElement('div'); row.className = 'lu-cel__rank';
      if (o.from != null) {
        var f = doc.createElement('span'); f.className = 'lu-cel__from'; f.textContent = '#' + o.from; row.appendChild(f);
        var ar = doc.createElement('span'); ar.className = 'lu-cel__arrow'; ar.setAttribute('aria-hidden', 'true'); row.appendChild(ar);
      }
      toEl = doc.createElement('span'); toEl.className = 'lu-cel__to'; toEl.textContent = '#' + (o.from != null && !reduce ? o.from : o.to); row.appendChild(toEl);
      box.appendChild(row);
    }
    var sub = doc.createElement('div'); sub.className = 'lu-cel__sub'; sub.textContent = o.subtitle != null ? o.subtitle : (o.type === 'like' && o.by ? o.by + ' heeft je een like gegeven.' : txt.subtitle);
    if (sub.textContent) box.appendChild(sub);
    var x = doc.createElement('button'); x.className = 'lu-cel__x'; x.type = 'button'; x.setAttribute('aria-label', 'Sluiten'); x.textContent = '×';
    el.appendChild(cv); el.appendChild(box); el.appendChild(x);
    host.appendChild(el);

    var c = cv.getContext('2d'), sim, raf = 0, last = 0, closed = false, resolveDone, timer = 0;
    var done = new Promise(function (res) { resolveDone = res; });

    function size() {
      var w = el.clientWidth || window.innerWidth, h = el.clientHeight || window.innerHeight;
      var q = o.pixel ? 1 / o.pixel : Math.min(window.devicePixelRatio || 1, 2);
      cv.width = Math.max(1, Math.round(w * q)); cv.height = Math.max(1, Math.round(h * q));
      c.setTransform(q, 0, 0, q, 0, 0);
      c.imageSmoothingEnabled = !o.pixel;
      if (!sim) sim = createSim(o, w, h);
      sim.resize(w, h, box.offsetHeight);
      box.style.top = Math.round(sim.textTop()) + 'px';
    }
    size();

    var countStart = 0;
    sim.onBurst = function () { el.classList.add('is-on'); countStart = sim.t; };

    function updateCount() {
      if (!toEl || o.from == null || !countStart) return;
      var u = clamp((sim.t - countStart - 0.25) / 0.9, 0, 1);
      toEl.textContent = '#' + Math.round(lerp(o.from, o.to, 1 - Math.pow(1 - u, 3)));
    }

    function close(instant) {
      if (closed) return; closed = true;
      cancelAnimationFrame(raf); clearTimeout(timer);
      window.removeEventListener('resize', size); doc.removeEventListener('keydown', onKey);
      if (active && active.el === el) active = null;
      function finish() { if (el.parentNode) el.parentNode.removeChild(el); if (typeof o.onDone === 'function') o.onDone(); resolveDone(); }
      if (instant) finish(); else { el.classList.remove('is-in'); setTimeout(finish, 300); }
    }
    function onKey(e) { if (e.key === 'Escape') close(); }

    function frame(ts) {
      if (closed) return;
      var dt = last ? Math.min(0.05, (ts - last) / 1000) : 0; last = ts;
      var finished = sim.step(dt * o.speed);
      updateCount();
      sim.draw(c);
      if (sim.t > sim.end - FADE) el.classList.remove('is-in');
      if (finished || sim.t >= sim.end) { close(true); return; }
      raf = requestAnimationFrame(frame);
    }

    window.addEventListener('resize', size);
    doc.addEventListener('keydown', onKey);
    if (o.dismissOnClick) el.addEventListener('click', function () { close(); });
    x.addEventListener('click', function (e) { e.stopPropagation(); close(); });

    requestAnimationFrame(function () { el.classList.add('is-in'); });
    if (reduce) {
      /* minder beweging gevraagd: toon een stilstaand beeld van de steun met confetti */
      for (var i = 0; i < 150; i++) sim.step(0.02);
      sim.draw(c);
      timer = setTimeout(function () { close(); }, 3200);
    } else {
      raf = requestAnimationFrame(frame);
    }

    active = { el: el, close: close, done: done };
    return active;
  }

  return {
    play: play,
    purchase: function (opts) { opts = opts || {}; opts.type = 'purchase'; return play(opts); },
    like: function (opts) { opts = opts || {}; opts.type = 'like'; return play(opts); },
    rankUp: function (opts) { opts = opts || {}; opts.type = 'rank'; return play(opts); },
    close: function () { if (active) active.close(); },
    defaults: DEFAULTS,
    _createSim: createSim
  };
});
