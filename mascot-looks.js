// LEVEL-UP: what Levelupy (the mascot) wears on his head through the year.
// A hat, glasses or a moustache for every season and feast day, the member's birthday and the day they joined.
//
// The mascot himself is drawn by levelup-celebrate.js, which this file does not touch. `dress(ctx, …)` listens
// to a canvas context: the moment the mascot's head has been drawn (the engine scales by 1.08 right after it
// moved to the head), the look of the day is drawn on top, in the head's own coordinates:
//   (0, 0) = the middle of the head · x to the right, y down · the head is 28.8 wide and 36 high
//   eyes at (±6.3, 2.2) · nose at (0, 8) · mouth around y 12 · ears at (±15.3, 1.6)
//   headband from y -9.8 to -4.2 · the hair ends at y -23.5
(function (root) {
  "use strict";
  const TAU = Math.PI * 2;
  const P = (d) => new Path2D(d);

  // ---------- small drawing helpers ----------
  function paint(c, shape, fill, stroke, lw) {
    if (fill) { c.fillStyle = fill; c.fill(shape); }
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw || 1.3; c.lineJoin = "round"; c.lineCap = "round"; c.stroke(shape); }
  }
  function oval(x, y, rx, ry, rot) { const p = new Path2D(); p.ellipse(x, y, rx, ry, rot || 0, 0, TAU); return p; }
  function box(x, y, w, h, r) { const p = new Path2D(); p.roundRect ? p.roundRect(x, y, w, h, r) : p.rect(x, y, w, h); return p; }
  function inside(c, shape, draw) { c.save(); c.clip(shape); draw(); c.restore(); }
  function glow(c, shape, color, alpha) { c.save(); c.globalAlpha *= alpha; c.fillStyle = color; c.fill(shape); c.restore(); }
  function stroke(c, d, color, lw, alpha) { c.save(); if (alpha != null) c.globalAlpha *= alpha; c.strokeStyle = color; c.lineWidth = lw; c.lineCap = "round"; c.lineJoin = "round"; c.stroke(typeof d === "string" ? P(d) : d); c.restore(); }
  function shade(hex, amt) { // darker (amt < 0) or lighter (amt > 0)
    const n = parseInt(String(hex).replace("#", ""), 16);
    if (!/^#[0-9a-f]{6}$/i.test(hex) || Number.isNaN(n)) return hex;
    const ch = (v) => { const t = amt < 0 ? 0 : 255; return Math.round(v + (t - v) * Math.abs(amt)); };
    return "#" + [n >> 16 & 255, n >> 8 & 255, n & 255].map((v) => ch(v).toString(16).padStart(2, "0")).join("");
  }
  function star(x, y, r, points, inner) {
    const p = new Path2D();
    for (let i = 0; i < points * 2; i++) { const a = -Math.PI / 2 + i * Math.PI / points, q = i % 2 ? r * (inner || 0.45) : r; p[i ? "lineTo" : "moveTo"](x + Math.cos(a) * q, y + Math.sin(a) * q); }
    p.closePath(); return p;
  }
  function heart(x, y, s) { // s = half the width
    return P(`M ${x} ${y + s * 0.95} C ${x - s * 1.5} ${y - s * 0.1}, ${x - s * 0.8} ${y - s * 1.15}, ${x} ${y - s * 0.38} C ${x + s * 0.8} ${y - s * 1.15}, ${x + s * 1.5} ${y - s * 0.1}, ${x} ${y + s * 0.95} Z`);
  }
  function drop(x, y, s) { return P(`M ${x} ${y - s * 1.5} C ${x + s * 0.2} ${y - s * 0.6}, ${x + s} ${y - s * 0.1}, ${x + s} ${y + s * 0.5} A ${s} ${s} 0 1 1 ${x - s} ${y + s * 0.5} C ${x - s} ${y - s * 0.1}, ${x - s * 0.2} ${y - s * 0.6}, ${x} ${y - s * 1.5} Z`); }
  function flower(c, x, y, r, petal, mid) {
    for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + i * TAU / 5; paint(c, oval(x + Math.cos(a) * r * 0.62, y + Math.sin(a) * r * 0.62, r * 0.5, r * 0.5), petal, shade(petal, -0.28), 0.7); }
    paint(c, oval(x, y, r * 0.42, r * 0.42), mid, shade(mid, -0.35), 0.7);
  }
  function leaf(c, x, y, len, rot, fill) {
    c.save(); c.translate(x, y); c.rotate(rot);
    const p = P(`M 0 0 C ${len * 0.3} ${-len * 0.42}, ${len * 0.75} ${-len * 0.34}, ${len} 0 C ${len * 0.75} ${len * 0.34}, ${len * 0.3} ${len * 0.42}, 0 0 Z`);
    paint(c, p, fill, shade(fill, -0.35), 0.7); stroke(c, `M ${len * 0.12} 0 L ${len * 0.82} 0`, shade(fill, -0.3), 0.5, 0.8);
    c.restore();
  }
  // the red skin of a day in the sun: cheeks, nose and forehead
  function sunburn(c, strength) {
    const red = "#e2432f";
    glow(c, oval(-9.2, 7.4, 4.9, 3.5, 0.12), red, 0.42 * strength); glow(c, oval(9.2, 7.4, 4.9, 3.5, -0.12), red, 0.42 * strength);
    glow(c, oval(0.4, 7.2, 3.6, 3.1), red, 0.5 * strength);
    glow(c, P("M -12.6 -3.6 Q 0 -1.4 12.6 -3.6 L 12.2 -0.9 Q 0 0.9 -12.2 -0.9 Z"), red, 0.3 * strength);
  }
  // dark glasses with a frame (also used for the round ones of 1 April)
  function temples(c, y, color) { stroke(c, `M -12.6 ${y} L -15.6 ${y - 0.9}`, color, 1.3); stroke(c, `M 12.6 ${y} L 15.6 ${y - 0.9}`, color, 1.3); }

  // ---------- the looks ----------
  // draw(c, env): c is in head coordinates; env.accent is the colour of the player's level
  // up, down, side: how far the look reaches from the middle of the head (0 = no further than his own head)
  const LOOKS = {
    santa: { up: 40, down: 0, side: 31, name: "Santa hat", say: ["Ho ho ho! Time for a Christmas workout.", "Santa lifts too. Where do you think the sack comes from?"], draw(c) {
      const red = "#d5202c", dark = "#8c101c";
      const cone = P("M -16.6 -9 C -15.6 -24, -6 -37.5, 7.5 -37.6 C 16.6 -37.6, 23.4 -31.5, 25.2 -21.4 C 21.8 -26.2, 18.2 -28.2, 14.6 -27 C 16.4 -21, 16.9 -15, 16.6 -9 Z");
      paint(c, cone, red, dark, 1.3);
      inside(c, cone, () => { glow(c, P("M 6 -37.6 C 14 -34, 18 -30, 14.6 -27 C 16.4 -21, 16.9 -15, 16.6 -9 L 9 -9 C 11 -18, 10.5 -28, 6 -37.6 Z"), dark, 0.32); glow(c, P("M -13.5 -12 C -12 -24, -5 -33, 3 -35.6 C -4 -30, -9 -22, -9.6 -12 Z"), "#ff6b70", 0.4); });
      const band = box(-18.6, -12.8, 37.2, 8.6, 4.3);
      paint(c, band, "#fbfaf5", "#bdbbb2", 1.2);
      inside(c, band, () => { glow(c, box(-18.6, -7.4, 37.2, 3.4, 0), "#c9c7bd", 0.45); for (let x = -15; x <= 15; x += 5) glow(c, oval(x, -10.6, 1.6, 1), "#ffffff", 0.9); });
      const pom = oval(25.4, -18.6, 4.9, 4.9);
      paint(c, pom, "#fbfaf5", "#bdbbb2", 1.2); glow(c, oval(26.6, -17, 3, 2.6), "#c9c7bd", 0.5); glow(c, oval(23.9, -20.2, 1.7, 1.3), "#ffffff", 0.95);
    } },

    party: { up: 52, down: 0, side: 0, name: "Party hat", say: ["Happy New Year! First rep of the year?", "New year, new level."], draw(c) {
      const cone = P("M -10.2 -15.6 Q 0 -12.2 10.2 -15.6 L 2.2 -45.4 Z");
      stroke(c, "M -9.6 -15.2 C -13.6 -6, -14.6 6, -9.4 15.6", "#e8e8e8", 0.6, 0.75); stroke(c, "M 9.6 -15.2 C 13.6 -6, 14.6 6, 9.4 15.6", "#e8e8e8", 0.6, 0.75);
      paint(c, cone, "#ffcf5a", null);
      inside(c, cone, () => {
        for (let i = -3; i < 6; i++) { glow(c, P(`M ${-14 + i * 7.4} -12 L ${-10.6 + i * 7.4} -12 L ${-1.6 + i * 7.4} -47 L ${-5 + i * 7.4} -47 Z`), "#2f6bff", 1); }
        glow(c, P("M 2.2 -45.4 L 10.2 -15.6 L 5.4 -14 Z"), "#000000", 0.14);
      });
      paint(c, cone, null, "#a67512", 1.2);
      for (let i = 0; i < 9; i++) { const a = -Math.PI * 0.92 + i * Math.PI * 0.105; stroke(c, `M 2.2 -45.6 L ${2.2 + Math.cos(a) * 5.2} ${-45.6 + Math.sin(a) * 5.2}`, i % 2 ? "#ff6b8b" : "#f4f5f7", 1.1); }
      paint(c, oval(2.2, -45.6, 1.7, 1.7), "#ff6b8b", "#b23a55", 0.8);
    } },

    cake: { up: 42, down: 0, side: 0, name: "Birthday cake", say: ["Happy birthday, {0}! 🎂", "It's your day, {0}. One rep for every year?"], draw(c) {
      paint(c, oval(0, -15.9, 14.6, 2.5), "#fbfaf6", "#b9b2a8", 1); // the plate
      const sponge = box(-11.6, -25.4, 23.2, 9.6, 2.6);
      paint(c, sponge, "#f3cf96", "#a8763a", 1.2);
      inside(c, sponge, () => { glow(c, box(-11.6, -20.2, 23.2, 1.5, 0), "#c9463d", 0.9); glow(c, box(5, -25.4, 6.6, 9.6, 0), "#a8763a", 0.22); });
      const icing = P("M -12.4 -26 C -12.4 -29.4, 12.4 -29.4, 12.4 -26 C 12.4 -22.6, 10.4 -21, 9.4 -23.2 C 8.4 -20.4, 5.6 -20.6, 4.8 -23.2 C 3.8 -19.6, 0.4 -19.8, -0.6 -23.2 C -1.8 -20.8, -4.6 -20.8, -5.6 -23.2 C -6.6 -20.2, -9.6 -20.4, -10.2 -23.2 C -11 -21.4, -12.4 -22.8, -12.4 -26 Z");
      paint(c, icing, "#ff9fc0", "#c25480", 1.1); glow(c, oval(-5.5, -27, 4.6, 0.9), "#ffffff", 0.55);
      [[-6.4, "#5ab0ff"], [0, "#f4f5f7"], [6.4, "#5ee6a8"]].forEach(([x, col]) => {
        paint(c, box(x - 1.1, -35.4, 2.2, 7.6, 0.8), col, shade(col, -0.4), 0.8); stroke(c, `M ${x - 1.1} -33 L ${x + 1.1} -34.2 M ${x - 1.1} -30.6 L ${x + 1.1} -31.8`, "#ff6b8b", 0.6);
        stroke(c, `M ${x} -35.4 L ${x} -36.8`, "#3a2a1c", 0.6);
        paint(c, drop(x, -38.6, 1.5), "#ffb02e", "#d9661f", 0.6); glow(c, drop(x, -38.2, 0.75), "#fff3b0", 1);
      });
    } },

    shades: { name: "Sunglasses", say: ["A bit burnt. Worth it.", "Sun's out, guns out.", "Don't forget to drink water today."], draw(c) {
      sunburn(c, 1);
      paint(c, box(-2.5, 6.3, 5.6, 2.5, 1.25), "#fbfbf6", "#d9d5cc", 0.5); // sun cream on his nose
      const frame = "#0c0d10";
      temples(c, 0.9, frame);
      const L = P("M -13 -1.9 Q -7 -3.3 -1.7 -1.9 Q -1 3.6 -3.2 6 Q -7.4 7.9 -11.3 6 Q -13.4 3.6 -13 -1.9 Z"), R = P("M 13 -1.9 Q 7 -3.3 1.7 -1.9 Q 1 3.6 3.2 6 Q 7.4 7.9 11.3 6 Q 13.4 3.6 13 -1.9 Z");
      [L, R].forEach((lens, i) => {
        paint(c, lens, "#191c22", null);
        inside(c, lens, () => { const g = c.createLinearGradient(0, -3, 0, 7); g.addColorStop(0, "rgba(120,170,255,0.55)"); g.addColorStop(1, "rgba(255,150,90,0.35)"); c.fillStyle = g; c.fillRect(-14, -4, 28, 12);
          const s = i ? 1 : -1; glow(c, P(`M ${s * 11} -3 L ${s * 8.4} -3 L ${s * 4.6} 8 L ${s * 7.2} 8 Z`), "#ffffff", 0.38); });
        paint(c, lens, null, frame, 1.5);
      });
      stroke(c, "M -1.8 -1.2 Q 0 -2.4 1.8 -1.2", frame, 1.6);
    } },

    pumpkin: { up: 34, down: 25, side: 28, name: "Pumpkin head", say: ["Boo! Did I scare you into a workout?", "Trick or treat? Treat: one more rep."], draw(c) {
      const o = "#f0861a", dk = "#a34c0a";
      stroke(c, "M 0.5 -24.5 C 0 -29, 2.6 -31.4, 6.4 -32.2", "#4c6b21", 4.2); stroke(c, "M 0.5 -24.5 C 0 -29, 2.6 -31.4, 6.4 -32.2", "#7fa536", 2.2);
      const body = oval(0, -0.8, 27, 23.8);
      paint(c, body, o, null);
      inside(c, body, () => {
        glow(c, oval(-16.4, -0.8, 10, 23), "#ffa23a", 0.55); glow(c, oval(16.4, -0.8, 10, 23), dk, 0.28); glow(c, oval(0, -0.8, 8.4, 23.4), "#ffa23a", 0.35);
        stroke(c, oval(-13.2, -0.8, 8.6, 23.6), dk, 0.9, 0.6); stroke(c, oval(13.2, -0.8, 8.6, 23.6), dk, 0.9, 0.6); stroke(c, oval(0, -0.8, 6.6, 23.6), dk, 0.9, 0.5);
        glow(c, oval(-10, -15, 6.5, 2.4, -0.4), "#ffd9a0", 0.5);
      });
      paint(c, body, null, dk, 1.5);
      const face = P("M -13.8 -1.2 L -8.2 -9.4 L -3.4 -1.2 Z M 13.8 -1.2 L 8.2 -9.4 L 3.4 -1.2 Z M 0 1.6 L 2.8 6.4 L -2.8 6.4 Z M -15 8.4 L -10.6 10.6 L -7.8 8 L -4.6 11.4 L -1.6 8.4 L 1.6 11.4 L 4.6 8.4 L 7.8 11.4 L 10.6 8 L 15 8.4 C 12 17.6, 5.6 19.4, 0 19.4 C -5.6 19.4, -12 17.6, -15 8.4 Z");
      const g = c.createRadialGradient(0, 8, 2, 0, 6, 22); g.addColorStop(0, "#fff0a6"); g.addColorStop(0.55, "#ffc02e"); g.addColorStop(1, "#e2670c");
      paint(c, face, g, "#6e2f05", 1.1);
    } },

    witch: { up: 47, down: 0, side: 27, name: "Witch hat", say: ["Something wicked this way trains.", "My broom is in the gym bag."], draw(c) {
      const fill = "#2c2244", dk = "#120d1f";
      const cone = P("M -12.4 -12.6 C -9.4 -24, -3.4 -35, 3.6 -40.6 C 7.6 -43.6, 12.6 -45.2, 15.4 -43 C 12.6 -42.4, 10.6 -40.2, 10.2 -36.6 C 9.6 -28, 11.2 -19.6, 12.6 -12.6 Z");
      paint(c, cone, fill, dk, 1.3);
      inside(c, cone, () => { glow(c, P("M 4 -41 C 9 -38, 9.4 -26, 12.6 -12.6 L 6.4 -12.6 C 6.6 -24, 6 -34, 4 -41 Z"), "#000000", 0.3); glow(c, P("M -9.6 -14 C -7 -24, -2.6 -32, 2 -37 C -2.6 -30, -5 -22, -5.6 -14 Z"), "#6c5aa8", 0.4); });
      const brim = oval(0, -11.4, 25.4, 4.9);
      paint(c, brim, fill, dk, 1.3); glow(c, oval(-6, -12.6, 13, 1.5), "#6c5aa8", 0.35);
      const band = P("M -11.9 -15 Q 0 -11.6 12.2 -15 L 11.4 -18.8 Q 0 -15.6 -10.9 -18.8 Z");
      paint(c, band, "#ff9a4d", "#a8500d", 1);
      paint(c, box(-3.2, -18.6, 6.4, 5, 1), "#ffcf5a", "#a67512", 1); paint(c, box(-1.5, -17.1, 3, 2, 0.4), "#ff9a4d", "#a67512", 0.6);
    } },

    crown: { up: 38, down: 0, side: 0, name: "King's crown", say: ["Three Kings today. I brought dumbbells.", "Heavy is the head that wears the crown. Good for the neck."], draw(c) {
      const gold = "#f6c544", dk = "#9c6b0e";
      const crown = P("M -13.4 -17.4 L -15.4 -32.6 L -8.6 -25.4 L -4.4 -35 L 0 -26.4 L 4.4 -35 L 8.6 -25.4 L 15.4 -32.6 L 13.4 -17.4 Q 0 -14.4 -13.4 -17.4 Z");
      paint(c, crown, gold, dk, 1.3);
      inside(c, crown, () => { glow(c, P("M 5 -36 L 16 -34 L 14 -16 L 8 -16 Z"), dk, 0.25); glow(c, P("M -15 -33 L -11.6 -30 L -10 -17 L -13.4 -17 Z"), "#fff3b0", 0.6); });
      const band = P("M -13.6 -17.2 Q 0 -14.2 13.6 -17.2 L 13.9 -21.4 Q 0 -18.4 -13.9 -21.4 Z");
      paint(c, band, "#ffd96b", dk, 1.1);
      [[-15.4, -33.2], [-4.4, -35.6], [4.4, -35.6], [15.4, -33.2]].forEach(([x, y]) => paint(c, oval(x, y, 1.7, 1.7), "#fff3b0", dk, 0.8));
      paint(c, oval(0, -18, 2.1, 1.9), "#e0304a", "#7d1226", 0.8); paint(c, oval(-7.6, -18.9, 1.6, 1.5), "#2f8cff", "#134a9c", 0.7); paint(c, oval(7.6, -18.9, 1.6, 1.5), "#32c36c", "#146b37", 0.7);
      glow(c, oval(-0.6, -18.6, 0.7, 0.5), "#ffffff", 0.85);
    } },

    bobble: { up: 39, down: 0, side: 0, name: "Bobble hat", say: ["Cold outside, warm in here.", "Winter is for building. Let's go."], draw(c, env) {
      const a = env.accent, dk = shade(a, -0.5);
      const dome = P("M -17.2 -9 C -17.6 -22, -10.4 -29.6, 0 -29.6 C 10.4 -29.6, 17.6 -22, 17.2 -9 Z");
      paint(c, dome, a, dk, 1.3);
      inside(c, dome, () => {
        glow(c, P("M -17.6 -19.4 L -13.2 -22.6 L -8.8 -19.4 L -4.4 -22.6 L 0 -19.4 L 4.4 -22.6 L 8.8 -19.4 L 13.2 -22.6 L 17.6 -19.4 L 17.6 -16.2 L 13.2 -19.4 L 8.8 -16.2 L 4.4 -19.4 L 0 -16.2 L -4.4 -19.4 L -8.8 -16.2 L -13.2 -19.4 L -17.6 -16.2 Z"), "#f4f5f7", 0.95);
        glow(c, P("M 8 -30 C 15 -27, 18 -20, 17.2 -9 L 11 -9 C 12.6 -18, 12 -25, 8 -30 Z"), "#000000", 0.2); glow(c, oval(-7, -25.6, 5.4, 1.8, -0.35), "#ffffff", 0.3);
      });
      const cuff = box(-18.8, -13.4, 37.6, 8, 3.6);
      paint(c, cuff, "#f4f5f7", "#a9afba", 1.2);
      inside(c, cuff, () => { for (let x = -16; x <= 16; x += 3.2) stroke(c, `M ${x} -13 L ${x} -5.6`, "#c5cad3", 0.7); glow(c, box(-18.8, -8, 37.6, 3, 0), "#a9afba", 0.35); });
      paint(c, oval(0, -32.6, 5.6, 5.4), "#f4f5f7", "#a9afba", 1.2);
      for (let i = 0; i < 7; i++) { const t = i * TAU / 7; stroke(c, `M ${Math.cos(t) * 1.4} ${-32.6 + Math.sin(t) * 1.4} L ${Math.cos(t) * 4} ${-32.6 + Math.sin(t) * 3.8}`, "#c5cad3", 0.7); }
    } },

    earmuffs: { up: 29, down: 36, side: 27, name: "Earmuffs", say: ["My ears are warm. Now the rest.", "Too cold to stand still. Move!"], draw(c, env) {
      stroke(c, "M -16.6 -1.6 C -17.4 -17, -9.4 -26.6, 0 -26.6 C 9.4 -26.6, 17.4 -17, 16.6 -1.6", "#15171c", 3.4); stroke(c, "M -16.6 -1.6 C -17.4 -17, -9.4 -26.6, 0 -26.6 C 9.4 -26.6, 17.4 -17, 16.6 -1.6", "#3a3f49", 1.6);
      [-1, 1].forEach((s) => {
        const muff = new Path2D();
        for (let i = 0; i < 11; i++) { const t = i * TAU / 11; muff.moveTo(s * 18.2 + Math.cos(t) * 5 + 2.3, 1.6 + Math.sin(t) * 6.2); muff.arc(s * 18.2 + Math.cos(t) * 5, 1.6 + Math.sin(t) * 6.2, 2.3, 0, TAU); }
        paint(c, muff, null, shade(env.accent, -0.5), 2.2); paint(c, muff, env.accent, null); paint(c, oval(s * 18.2, 1.6, 5.4, 6.6), env.accent, null);
        inside(c, oval(s * 18.2, 1.6, 7.2, 8.4), () => { glow(c, oval(s * 20.8, 4, 4.4, 5.6), "#000000", 0.16); glow(c, oval(s * 16.6, -1.6, 2.6, 2.8), "#ffffff", 0.38); });
      });
      // a scarf under his chin
      const scarf = P("M -10.6 15.2 Q 0 20.4 10.6 15.2 L 11.4 20.6 Q 0 26 -11.4 20.6 Z");
      paint(c, scarf, "#e0304a", "#7d1226", 1.1);
      inside(c, scarf, () => { for (let x = -9; x <= 9; x += 4.5) glow(c, box(x - 0.7, 14, 1.4, 12, 0), "#f4f5f7", 0.9); });
      const tail = P("M 4.6 21.6 L 10.4 19.6 L 12.6 30.6 L 6.6 32 Z");
      paint(c, tail, "#e0304a", "#7d1226", 1.1); stroke(c, "M 6 25.8 L 11.4 24.4", "#f4f5f7", 1.3); stroke(c, "M 7.4 32 L 7.7 34 M 9.6 31.4 L 10 33.4 M 11.6 30.8 L 12 32.8", "#7d1226", 0.8);
    } },

    hearts: { name: "Heart glasses", say: ["I love leg day. There, I said it.", "Roses are red, muscles are sore."], draw(c) {
      glow(c, oval(-9.6, 8.6, 3.4, 2), "#ff6f61", 0.4); glow(c, oval(9.6, 8.6, 3.4, 2), "#ff6f61", 0.4);
      temples(c, 1.4, "#b3193d");
      [-1, 1].forEach((s) => {
        const h = heart(s * 6.7, 2.2, 5.5);
        paint(c, h, "#ff4d6d", null);
        inside(c, h, () => { glow(c, oval(s * 6.7 + 2.4, 4.6, 4, 4.4), "#b3193d", 0.35); glow(c, oval(s * 6.7 - 2.4, -0.4, 1.9, 1.3, -0.5), "#ffffff", 0.75); });
        paint(c, h, null, "#b3193d", 1.2);
      });
      stroke(c, "M -1.9 1.2 Q 0 0 1.9 1.2", "#b3193d", 1.5);
    } },

    jester: { up: 49, down: 0, side: 33, name: "Jester hat", say: ["Carnival in Aalst! Train first, party after.", "Confetti counts as cardio, right?"], draw(c) {
      const red = "#e02d2d", yel = "#ffcf3a", rdk = "#8c1414", ydk = "#a67512";
      const left = P("M -16.8 -9.6 C -17.4 -17, -14.6 -22.4, -19.4 -24.6 C -25.4 -27.2, -30 -22, -29.4 -15.6 C -25.6 -19.6, -22 -18.4, -20.6 -14.4 C -19.8 -12, -18.6 -10.4, -16.8 -9.6 Z");
      const right = P("M 16.8 -9.6 C 17.4 -17, 14.6 -22.4, 19.4 -24.6 C 25.4 -27.2, 30 -22, 29.4 -15.6 C 25.6 -19.6, 22 -18.4, 20.6 -14.4 C 19.8 -12, 18.6 -10.4, 16.8 -9.6 Z");
      const mid = P("M -17 -9.4 C -17 -20, -9.4 -27, -3.6 -31.4 C -1.4 -35, -0.4 -39, 0 -43.6 C 0.4 -39, 1.4 -35, 3.6 -31.4 C 9.4 -27, 17 -20, 17 -9.4 Z");
      paint(c, left, yel, ydk, 1.2); paint(c, right, red, rdk, 1.2);
      paint(c, mid, red, null);
      inside(c, mid, () => { glow(c, box(0, -46, 20, 40, 0), yel, 1); glow(c, P("M 9 -27 C 15 -22, 17 -16, 17 -9.4 L 12 -9.4 C 12.6 -17, 12 -22, 9 -27 Z"), "#000000", 0.14); glow(c, oval(-8.6, -20, 3.4, 6, 0.5), "#ffffff", 0.2); });
      paint(c, mid, null, rdk, 1.2); stroke(c, "M 0 -43.6 L 0 -13", rdk, 0.8, 0.7);
      const band = P("M -18.2 -13.2 L -13.6 -9 L -9 -13.2 L -4.5 -9 L 0 -13.2 L 4.5 -9 L 9 -13.2 L 13.6 -9 L 18.2 -13.2 L 17.6 -6 L -17.6 -6 Z");
      paint(c, band, "#f4f5f7", "#a9afba", 1.1);
      [[-29.6, -13.6], [0, -45.6], [29.6, -13.6]].forEach(([x, y]) => { paint(c, oval(x, y, 2.5, 2.5), "#ffd96b", ydk, 0.9); stroke(c, `M ${x - 1.4} ${y + 0.9} L ${x + 1.4} ${y + 0.9}`, ydk, 0.7); glow(c, oval(x - 0.8, y - 0.9, 0.7, 0.6), "#ffffff", 0.9); });
    } },

    clover: { up: 37, down: 0, side: 23, name: "Leprechaun hat", say: ["Top of the morning! Luck is for people who train.", "Found gold: your next PR."], draw(c) {
      const g = "#22a152", dk = "#0d5a2a";
      const crown = P("M -11.4 -13.4 C -11 -21, -11.8 -27.6, -13.2 -33.4 Q 0 -36.8 13.2 -33.4 C 11.8 -27.6, 11 -21, 11.4 -13.4 Z");
      const brim = oval(0, -12.2, 21.4, 4.3);
      paint(c, brim, g, dk, 1.3); glow(c, oval(-5, -13.2, 11, 1.3), "#6fdc95", 0.4);
      paint(c, crown, g, dk, 1.3);
      inside(c, crown, () => { glow(c, P("M 6 -36 L 14 -34 L 12 -13 L 6.6 -13 Z"), "#000000", 0.2); glow(c, P("M -12.6 -33 L -9.6 -34 L -8 -14 L -11 -14 Z"), "#6fdc95", 0.5); });
      paint(c, oval(0, -33.6, 13.2, 2.5), "#2bbb61", dk, 1.2);
      const band = P("M -11.5 -14.4 Q 0 -11.4 11.5 -14.4 L 11.3 -19.6 Q 0 -16.6 -11.3 -19.6 Z");
      paint(c, band, "#15171c", "#000000", 0.9);
      paint(c, box(-3.4, -19, 6.8, 5.8, 1), "#ffcf5a", "#a67512", 1); paint(c, box(-1.6, -17.3, 3.2, 2.4, 0.4), "#15171c", "#a67512", 0.6);
      stroke(c, "M 6.6 -24.6 Q 7.6 -21.6 8.6 -19.4", dk, 0.9);
      [0, 2.094, -2.094].forEach((r) => { c.save(); c.translate(6.6, -26.4); c.rotate(r); paint(c, heart(0, -1.9, 1.75), "#7be3a0", dk, 0.6); c.restore(); });
    } },

    rain: { up: 33, down: 0, side: 30, name: "Rain hat", say: ["Rain is just free cooling.", "Bad weather, good excuse to train inside."], draw(c) {
      const y = "#ffd21f", dk = "#a87f00";
      const brim = P("M -24.6 -8.4 C -22 -13.6, -12 -15.4, 0 -15.4 C 12 -15.4, 22 -13.6, 24.6 -8.4 C 16 -5.4, -16 -5.4, -24.6 -8.4 Z");
      const dome = P("M -15.6 -12.4 C -15.6 -23.4, -8.4 -28.6, 0 -28.6 C 8.4 -28.6, 15.6 -23.4, 15.6 -12.4 Q 0 -9.4 -15.6 -12.4 Z");
      paint(c, brim, y, dk, 1.3); glow(c, P("M -24.6 -8.4 C -16 -5.4, 16 -5.4, 24.6 -8.4 C 16 -7.4, -16 -7.4, -24.6 -8.4 Z"), dk, 0.5);
      paint(c, dome, y, dk, 1.3);
      inside(c, dome, () => { glow(c, P("M 7 -29 C 13 -26, 16 -20, 15.6 -12 L 10.4 -11.6 C 11 -19, 10.4 -25, 7 -29 Z"), "#000000", 0.16); glow(c, oval(-7, -23.6, 4.6, 2, -0.5), "#ffffff", 0.55); stroke(c, "M 0 -28.6 L 0 -11", dk, 0.7, 0.55); });
      [[-23.6, -25, 1.9], [21.6, -30.6, 1.6], [27.4, -17.4, 1.7], [-28, -12.6, 1.4]].forEach(([x, yy, s]) => { paint(c, drop(x, yy, s), "#7fd0ff", "#2f8cc9", 0.7); glow(c, oval(x - s * 0.3, yy + s * 0.2, s * 0.28, s * 0.4), "#ffffff", 0.8); });
    } },

    flowers: { up: 22, down: 0, side: 0, name: "Flower crown", say: ["Spring! Everything grows. You too.", "Fresh air, fresh legs."], draw(c) {
      stroke(c, "M -16.4 -8.4 Q 0 -19 16.4 -8.4", "#3f8a3a", 2);
      [[-12.4, -12.4, 2.4], [-5.2, -15.6, 2.9], [3.4, -15.9, 0.3], [10.6, -13.4, 0.9], [-9, -10.6, -2.7], [7, -11.4, -0.5]].forEach(([x, y, r]) => leaf(c, x, y, 5.2, r, "#55b04c"));
      flower(c, -14.6, -9.6, 4, "#ff9fc0", "#ffcf5a"); flower(c, -7.6, -13.9, 4.5, "#fbfbf6", "#ffb02e"); flower(c, 0.2, -15.6, 4.9, "#b18cff", "#ffe9a8");
      flower(c, 8, -13.9, 4.5, "#fbfbf6", "#ffb02e"); flower(c, 14.8, -9.6, 4, "#ff9fc0", "#ffcf5a");
    } },

    groucho: { name: "Funny glasses", say: ["April Fools! Today every rep counts double. (No.)", "Nobody recognises me like this."], draw(c) {
      const k = "#15171c";
      temples(c, 1.2, k);
      const nose = P("M -2.6 2.6 C -5.6 7.4, -5.9 12.6, -1.6 13.4 Q 0 14 1.6 13.4 C 5.9 12.6, 5.6 7.4, 2.6 2.6 Z");
      paint(c, nose, "#e7a77c", "#9e5e36", 1.1); glow(c, oval(-1.4, 8.4, 1.5, 2.6, 0.2), "#ffd9bd", 0.7);
      const tache = P("M 0 12.9 C -2.6 11.9, -7.4 12.3, -11.4 15.6 C -8.4 18.6, -3.4 18.6, 0 16 C 3.4 18.6, 8.4 18.6, 11.4 15.6 C 7.4 12.3, 2.6 11.9, 0 12.9 Z");
      paint(c, tache, k, "#000000", 0.8); stroke(c, "M -8 15 Q -5 14 -2 15.2 M 8 15 Q 5 14 2 15.2", "#4a4e57", 0.6);
      [-1, 1].forEach((s) => {
        const ring = oval(s * 6.9, 2.2, 5.3, 5.1);
        glow(c, ring, "#ffffff", 0.16); paint(c, ring, null, k, 1.7);
        glow(c, P(`M ${s * 6.9 - 3.4} ${0.4} L ${s * 6.9 - 1.8} ${-1.4} L ${s * 6.9 - 1.2} ${-0.6} L ${s * 6.9 - 2.8} ${1.2} Z`), "#ffffff", 0.6);
        paint(c, P(`M ${s * 1.3} -2.9 C ${s * 4.4} -6.3, ${s * 10.2} -6.6, ${s * 13.2} -3.6 C ${s * 10.2} -3.9, ${s * 5.2} -3.6, ${s * 1.7} -0.9 Z`), k, "#000000", 0.7);
      });
      stroke(c, "M -1.7 1.4 Q 0 0.2 1.7 1.4", k, 1.7);
    } },

    bunny: { up: 49, down: 0, side: 24, name: "Bunny ears", say: ["Happy Easter! I hid eggs between the weights.", "Hop to it: squat jumps."], draw(c) {
      const w = "#fbfaf6", ol = "#b9b2a8", pink = "#ffb3c7";
      const earL = P("M -11.4 -20.6 C -16.4 -30, -15.4 -42.6, -9.6 -47.6 C -4.6 -43, -3.4 -31, -5.2 -21.4 Z");
      const earR = P("M 5.2 -21.4 C 3.6 -30, 5.6 -39.4, 11.4 -43.6 C 15.6 -44.4, 20.6 -40.6, 22.6 -36 C 18.6 -36.6, 15.4 -34.4, 13.6 -30.6 C 12.4 -27.4, 12 -24, 11.4 -20.6 Z");
      paint(c, earL, w, ol, 1.3); paint(c, P("M -9.8 -23.4 C -12.6 -30, -12.2 -38.6, -9.4 -43 C -6.8 -39, -6.4 -31, -7.4 -23.6 Z"), pink, null);
      paint(c, earR, w, ol, 1.3); paint(c, P("M 7.6 -23.6 C 6.8 -29.6, 8.2 -36, 11.6 -39.6 C 13.6 -40.2, 15.6 -39.6, 17 -38.2 C 14.4 -36.6, 12.4 -33.8, 11.4 -30.2 C 10.6 -27.6, 10.2 -25.4, 9.8 -23.4 Z"), pink, null);
      stroke(c, "M 13.6 -30.6 C 15.4 -34.4, 18.6 -36.6, 22.6 -36", ol, 0.8, 0.8);
      const band = P("M -15.6 -12 C -15 -19.6, -8 -24.6, 0 -24.6 C 8 -24.6, 15 -19.6, 15.6 -12 L 13.2 -12 C 12.4 -18, 7 -22, 0 -22 C -7 -22, -12.4 -18, -13.2 -12 Z");
      paint(c, band, w, ol, 1.1);
    } },

    cycling: { up: 29, down: 0, side: 0, name: "Cycling cap", say: ["Tour of Flanders! Cobbles make you strong.", "Legs like Flandriens. That's the plan."], draw(c) {
      const w = "#f7f6f1", ol = "#9a968c";
      const dome = P("M -16.8 -8.6 C -17.2 -21, -10.2 -27.6, 0 -27.6 C 10.2 -27.6, 17.2 -21, 16.8 -8.6 Q 0 -5.6 -16.8 -8.6 Z");
      paint(c, dome, w, ol, 1.3);
      inside(c, dome, () => {
        glow(c, box(-3.6, -30, 2.4, 26, 0), "#15171c", 1); glow(c, box(-1.2, -30, 2.4, 26, 0), "#ffd21f", 1); glow(c, box(1.2, -30, 2.4, 26, 0), "#e02d2d", 1);
        glow(c, P("M 8 -28 C 14 -25, 17.4 -19, 16.8 -8 L 11.6 -7.6 C 12.4 -16, 11.6 -23, 8 -28 Z"), "#000000", 0.14);
        stroke(c, "M -10.6 -24 C -12.6 -19, -13.2 -14, -13 -8", ol, 0.6, 0.6); stroke(c, "M 10.6 -24 C 12.6 -19, 13.2 -14, 13 -8", ol, 0.6, 0.6);
      });
      // the short peak, flipped up
      const peak = P("M -10.6 -8.2 C -11.4 -14, -6.4 -17.6, 0 -17.6 C 6.4 -17.6, 11.4 -14, 10.6 -8.2 Q 0 -5.8 -10.6 -8.2 Z");
      paint(c, peak, w, ol, 1.2);
      inside(c, peak, () => { glow(c, box(-12, -14.2, 24, 1.5, 0), "#15171c", 1); glow(c, box(-12, -12.7, 24, 1.5, 0), "#ffd21f", 1); glow(c, box(-12, -11.2, 24, 1.5, 0), "#e02d2d", 1); glow(c, P("M -10.6 -8.2 Q 0 -5.8 10.6 -8.2 L 10.6 -9.4 Q 0 -7 -10.6 -9.4 Z"), ol, 0.45); });
      paint(c, peak, null, ol, 1.2);
    } },

    hardhat: { up: 32, down: 0, side: 22, name: "Hard hat", say: ["Labour Day: today we build muscle.", "Work in progress. That's all of us."], draw(c) {
      const y = "#ffc21a", dk = "#a56f00";
      const shell = P("M -16.8 -10 C -17 -22.6, -9.8 -29.2, 0 -29.2 C 9.8 -29.2, 17 -22.6, 16.8 -10 Z");
      paint(c, shell, y, dk, 1.3);
      inside(c, shell, () => { glow(c, P("M 8 -30 C 14.6 -26, 17.4 -19, 16.8 -10 L 11.6 -10 C 12.4 -18, 11.4 -25, 8 -30 Z"), "#000000", 0.16); glow(c, oval(-8.4, -23.4, 4.4, 2.2, -0.6), "#ffffff", 0.6); });
      const ridge = P("M -3.4 -10 C -3.6 -20, -3 -27, -2 -30.2 Q 0 -31.4 2 -30.2 C 3 -27, 3.6 -20, 3.4 -10 Z");
      paint(c, ridge, "#ffd34f", dk, 1.1);
      const rim = P("M -20.4 -9.6 C -20.4 -12.6, -17.6 -12.8, -16.8 -12.8 L 16.8 -12.8 C 17.6 -12.8, 20.4 -12.6, 20.4 -9.6 C 20.4 -7.4, 18.4 -6.9, 16.8 -6.9 L -16.8 -6.9 C -18.4 -6.9, -20.4 -7.4, -20.4 -9.6 Z");
      paint(c, rim, y, dk, 1.3); glow(c, box(-18, -8.6, 36, 1.4, 0.7), dk, 0.4); glow(c, box(-17, -12, 20, 1, 0.5), "#ffffff", 0.5);
    } },

    cap: { up: 30, down: 0, side: 0, name: "Cap", say: ["Cap on, phone away, let's train.", "Sunny outside? Take the workout to the park."], draw(c, env) {
      const a = env.accent, dk = shade(a, -0.5), peakC = shade(a, -0.62);
      const dome = P("M -16.8 -9.4 C -17.2 -21.6, -10 -28, 0 -28 C 10 -28, 17.2 -21.6, 16.8 -9.4 Q 0 -6.6 -16.8 -9.4 Z");
      paint(c, dome, a, dk, 1.3);
      inside(c, dome, () => { glow(c, P("M 8 -29 C 14.6 -25, 17.4 -18, 16.8 -9 L 11.6 -8.6 C 12.4 -17, 11.4 -24, 8 -29 Z"), "#000000", 0.18); glow(c, oval(-8.4, -22.6, 4.2, 2, -0.6), "#ffffff", 0.35);
        stroke(c, "M 0 -28 L 0 -8", dk, 0.7, 0.6); stroke(c, "M -8.6 -26 C -10.6 -20, -11.2 -14, -11 -8.6", dk, 0.6, 0.5); stroke(c, "M 8.6 -26 C 10.6 -20, 11.2 -14, 11 -8.6", dk, 0.6, 0.5); });
      paint(c, oval(0, -28.2, 1.8, 1.1), shade(a, 0.25), dk, 0.8);
      paint(c, oval(0, -16.6, 4.6, 4.4), "#f4f5f7", dk, 0.9);
      stroke(c, "M 0 -13.8 L 0 -19.2 M -2.3 -16.9 L 0 -19.4 L 2.3 -16.9", "#15171c", 1.2); // level up
      const peak = P("M -17.4 -9.6 Q 0 -6.4 17.4 -9.6 C 16.6 -3.4, 8.6 -1.2, 0 -1.2 C -8.6 -1.2, -16.6 -3.4, -17.4 -9.6 Z");
      paint(c, peak, peakC, shade(a, -0.78), 1.3); glow(c, P("M -15 -8.4 Q 0 -5.6 15 -8.4 Q 0 -4.2 -15 -8.4 Z"), "#ffffff", 0.16);
    } },

    flemish: { up: 32, down: 0, side: 24, name: "Flemish bucket hat", say: ["11 July: feast day of Flanders. Roar like a lion.", "A Flemish lion skips no leg day."], draw(c) {
      const y = "#ffd21f", dk = "#a87f00", k = "#15171c";
      [-1, 1].forEach((s) => { const cheek = P(`M ${s * 6.4} 5.6 L ${s * 12.4} 5 L ${s * 12} 9.8 L ${s * 6.8} 10.2 Z`); paint(c, cheek, y, null); inside(c, cheek, () => { glow(c, box(s > 0 ? 8.4 : -10.4, 4, 2, 8, 0), k, 1); }); paint(c, cheek, null, k, 0.5); });
      const brim = P("M -23 -6.6 C -21.4 -12.6, -17.6 -14.6, -14.6 -15 L 14.6 -15 C 17.6 -14.6, 21.4 -12.6, 23 -6.6 Q 0 -2.6 -23 -6.6 Z");
      const crown = P("M -14.8 -14.4 C -14.2 -22, -12.6 -26.6, -11.6 -28.4 Q 0 -31.4 11.6 -28.4 C 12.6 -26.6, 14.2 -22, 14.8 -14.4 Q 0 -11.6 -14.8 -14.4 Z");
      paint(c, brim, y, dk, 1.3); glow(c, P("M -23 -6.6 Q 0 -2.6 23 -6.6 Q 0 -5 -23 -6.6 Z"), dk, 0.55);
      paint(c, crown, y, dk, 1.3);
      inside(c, crown, () => { glow(c, P("M 6 -31 L 13 -29 L 15 -13 L 9.6 -12.6 Z"), "#000000", 0.14); glow(c, oval(-7.6, -24.4, 3.6, 1.6, -0.3), "#ffffff", 0.5); });
      const band = P("M -14.9 -14.2 Q 0 -11.4 14.9 -14.2 L 14.5 -18.4 Q 0 -15.6 -14.5 -18.4 Z");
      paint(c, band, k, "#000000", 0.8);
      // a small lion's paw print as a badge
      paint(c, oval(0, -22.6, 2.3, 1.9), k, null); [[-2.7, -25.2], [-0.9, -26.4], [0.9, -26.4], [2.7, -25.2]].forEach(([x, yy]) => paint(c, oval(x, yy, 0.85, 1.05), k, null));
    } },

    belgium: { up: 40, down: 0, side: 22, name: "Belgian top hat", say: ["21 July: happy national day!", "Fries after training. It's tradition today."], draw(c) {
      const k = "#15171c", y = "#ffd21f", r = "#e02d2d";
      [-1, 1].forEach((s) => { const x0 = s > 0 ? 6.6 : -12.6; [k, y, r].forEach((col, i) => glow(c, box(x0 + i * 2, 5.4, 2, 4.4, 0), col, 1)); paint(c, box(x0, 5.4, 6, 4.4, 0.6), null, "#000000", 0.5); });
      const brim = oval(0, -12.4, 20.6, 4.1);
      paint(c, brim, k, "#000000", 1.2); glow(c, oval(-5, -13.4, 10, 1.2), "#ffffff", 0.14);
      const crown = P("M -11.2 -13.6 C -11 -22, -11.8 -29.6, -12.8 -35.6 Q 0 -38.8 12.8 -35.6 C 11.8 -29.6, 11 -22, 11.2 -13.6 Q 0 -10.8 -11.2 -13.6 Z");
      paint(c, crown, y, null);
      inside(c, crown, () => { glow(c, box(-14, -40, 9.9, 30, 0), k, 1); glow(c, box(4.1, -40, 10, 30, 0), r, 1); glow(c, P("M 8 -38 L 14 -36 L 12 -12 L 8.6 -12 Z"), "#000000", 0.16); glow(c, box(-1.6, -38, 1.6, 26, 0), "#ffffff", 0.3); });
      paint(c, crown, null, "#000000", 1.2);
      paint(c, oval(0, -35.8, 12.8, 2.4), "#2a2d34", "#000000", 1);
    } },

    straw: { up: 28, down: 0, side: 29, name: "Straw hat", say: ["Holiday mode. Still training though.", "Shade for my head, sun for my legs."], draw(c) {
      sunburn(c, 0.7);
      const s = "#eccb74", dk = "#a67b22";
      const brim = oval(0, -10.4, 28, 6.2);
      paint(c, brim, s, dk, 1.3);
      inside(c, brim, () => { for (let r = 9; r < 30; r += 4.5) stroke(c, oval(0, -10.4, r, r * 0.22), dk, 0.5, 0.5); glow(c, oval(0, -6.6, 27, 3), dk, 0.3); });
      const crown = P("M -13.4 -12 C -13.6 -21, -8.6 -26.6, 0 -26.6 C 8.6 -26.6, 13.6 -21, 13.4 -12 Q 0 -8.8 -13.4 -12 Z");
      paint(c, crown, s, dk, 1.3);
      inside(c, crown, () => { for (let x = -12; x <= 12; x += 3) stroke(c, `M ${x} -27 L ${x * 1.12} -9`, dk, 0.45, 0.5); for (let yy = -24; yy < -12; yy += 3) stroke(c, `M -14 ${yy} Q 0 ${yy + 2.4} 14 ${yy}`, dk, 0.45, 0.4); glow(c, P("M 6 -27 L 14 -24 L 13.4 -11 L 8.6 -10.4 Z"), "#000000", 0.13); });
      const band = P("M -13.5 -12.2 Q 0 -9 13.5 -12.2 L 13.4 -16.6 Q 0 -13.4 -13.4 -16.6 Z");
      paint(c, band, "#e0304a", "#7d1226", 1);
    } },

    gradcap: { up: 31, down: 0, side: 26, name: "Graduation cap", say: ["Back to school. Lesson one: squat depth.", "Class is in session. Subject: getting strong."], draw(c) {
      const n = "#1d2333", dk = "#0a0d16";
      const skull = P("M -13.6 -11 C -13.8 -17, -9 -20.4, 0 -20.4 C 9 -20.4, 13.8 -17, 13.6 -11 Q 0 -8 -13.6 -11 Z");
      paint(c, skull, n, dk, 1.2);
      const board = P("M 0 -29.6 L 25 -22.2 L 0 -14.8 L -25 -22.2 Z");
      paint(c, board, "#262d42", dk, 1.3); glow(c, P("M 0 -29.6 L 25 -22.2 L 0 -21.4 L -25 -22.2 Z"), "#ffffff", 0.1);
      stroke(c, "M 0 -22.2 C 7 -21.4, 14 -20.6, 19.4 -19.4 L 19.6 -9.6", "#ffcf5a", 1.1);
      paint(c, oval(0, -22.2, 1.9, 1.1), "#ffcf5a", "#a67512", 0.7);
      paint(c, box(18.2, -10.4, 2.8, 2.2, 0.6), "#ffcf5a", "#a67512", 0.7);
      for (let i = 0; i < 4; i++) stroke(c, `M ${18.5 + i * 0.75} -8.2 L ${18.1 + i * 0.95} -3.4`, "#ffcf5a", 0.7);
    } },

    headphones: { up: 40, down: 0, side: 33, name: "Headphones", say: ["Playlist on. World off.", "This song is good for one more set."], draw(c, env) {
      const k = "#1b1e24", a = env.accent;
      stroke(c, "M -17 -1 C -18 -17.6, -9.6 -27.4, 0 -27.4 C 9.6 -27.4, 18 -17.6, 17 -1", "#0c0d10", 4.4); stroke(c, "M -17 -1 C -18 -17.6, -9.6 -27.4, 0 -27.4 C 9.6 -27.4, 18 -17.6, 17 -1", "#3a3f49", 2.2);
      stroke(c, "M -8.4 -24.6 C -3.6 -27.2, 3.6 -27.2, 8.4 -24.6", "#6b7280", 2.6);
      [-1, 1].forEach((s) => {
        const cup = box(s > 0 ? 14.2 : -21.4, -5.6, 7.2, 14.4, 3.2);
        paint(c, cup, k, "#000000", 1.2); paint(c, oval(s * 17.8, 1.6, 2.1, 4.4), a, shade(a, -0.5), 0.8); glow(c, oval(s * 17.2, -0.6, 0.7, 1.5), "#ffffff", 0.5);
      });
      [[25.6, -20.6, 1], [30.4, -31, 0.82]].forEach(([x, y, s]) => { paint(c, oval(x, y, 1.9 * s, 1.5 * s, -0.4), a, shade(a, -0.5), 0.6); stroke(c, `M ${x + 1.6 * s} ${y - 0.4 * s} L ${x + 1.6 * s} ${y - 7 * s} Q ${x + 4.6 * s} ${y - 6.6 * s} ${x + 4.4 * s} ${y - 3.6 * s}`, a, 1 * s); });
    } },

    tirol: { up: 45, down: 0, side: 25, name: "Alpine hat", say: ["O'zapft is! But first: leg day.", "Pretzels are carbs. Carbs are fuel."], draw(c) {
      const g = "#3a7a45", dk = "#17401f";
      const feather = P("M 11.4 -19.6 C 12.6 -30, 17.6 -39.6, 23.6 -43.6 C 24.6 -35.6, 21.6 -26, 14.4 -18.4 Z");
      paint(c, feather, "#fbfaf6", "#b9b2a8", 0.9); stroke(c, "M 12.6 -19.4 C 15 -28, 19 -36, 23 -42.6", "#b9b2a8", 0.6); glow(c, P("M 19.6 -38 C 22 -40.6, 23.2 -42.4, 23.6 -43.6 C 24.2 -39, 23.4 -34.6, 21.6 -30.6 Z"), "#e0304a", 0.9);
      const brim = P("M -22.6 -9.6 C -19.6 -14.6, -10 -15.6, 0 -15.6 C 10 -15.6, 20.6 -15.4, 23.6 -12.6 C 16 -7, -15 -6.2, -22.6 -9.6 Z");
      paint(c, brim, g, dk, 1.3); glow(c, P("M -22.6 -9.6 C -15 -6.2, 16 -7, 23.6 -12.6 C 15 -8.6, -14 -7.8, -22.6 -9.6 Z"), dk, 0.5);
      const crown = P("M -13.6 -13 C -13.6 -22, -10.6 -28.6, -5.6 -29.6 C -2.6 -30.2, -1.4 -27.6, 0 -27.6 C 1.4 -27.6, 2.6 -30.2, 5.6 -29.6 C 10.6 -28.6, 13.6 -22, 13.6 -13 Q 0 -10 -13.6 -13 Z");
      paint(c, crown, g, dk, 1.3);
      inside(c, crown, () => { glow(c, P("M 6 -30 C 11 -28, 14 -22, 13.6 -12 L 9 -11.4 C 9.6 -19, 9 -25, 6 -30 Z"), "#000000", 0.2); glow(c, oval(-7, -24, 3, 1.5, -0.5), "#ffffff", 0.3); });
      const band = P("M -13.7 -13.2 Q 0 -10.2 13.7 -13.2 L 13.6 -16.8 Q 0 -13.8 -13.6 -16.8 Z");
      paint(c, band, "#f4f5f7", "#a9afba", 0.8);
      inside(c, band, () => { for (let x = -14; x < 15; x += 3.2) glow(c, P(`M ${x} -18 L ${x + 1.6} -18 L ${x + 3.2} -9 L ${x + 1.6} -9 Z`), "#e0304a", 1); });
    } },

    tache: { name: "Movember moustache", say: ["Movember! The moustache does half the lifting.", "Grow a mo, train like a pro."], draw(c) {
      const k = "#2a1a12";
      const m = P("M 0 11 C -2.4 9.4, -6.6 9.6, -9.4 11.6 C -11.6 13.2, -13.6 12.6, -14.9 9.6 C -16.6 13.4, -15 17.2, -11 16.8 C -6.6 16.4, -3 15.4, 0 13.4 C 3 15.4, 6.6 16.4, 11 16.8 C 15 17.2, 16.6 13.4, 14.9 9.6 C 13.6 12.6, 11.6 13.2, 9.4 11.6 C 6.6 9.6, 2.4 9.4, 0 11 Z");
      paint(c, m, k, "#120a06", 1);
      stroke(c, "M -8.6 12.6 C -6 11.4, -3.4 11.4, -1.2 12.4 M 8.6 12.6 C 6 11.4, 3.4 11.4, 1.2 12.4", "#5a3b28", 0.7); stroke(c, "M -12.6 14.4 C -10.4 15, -8 14.6, -6 13.8 M 12.6 14.4 C 10.4 15, 8 14.6, 6 13.8", "#5a3b28", 0.6);
    } },

    mitre: { up: 49, down: 37, side: 0, name: "Bishop's mitre", say: ["The good man is in town. Were you good? Did you train?", "Speculaas is fuel. One piece."], draw(c) {
      const red = "#c41f2b", dk = "#7a0f18", gold = "#f6c544", gdk = "#9c6b0e", w = "#fbfaf6", wol = "#b9b2a8";
      const beard = P("M -14 7.6 C -15.6 16, -12 27, -5.6 32.4 C -3.4 34.4, -1.6 33, 0 35 C 1.6 33, 3.4 34.4, 5.6 32.4 C 12 27, 15.6 16, 14 7.6 C 11.6 11.6, 8.6 13.4, 5.6 13.6 C 3.6 16.6, -3.6 16.6, -5.6 13.6 C -8.6 13.4, -11.6 11.6, -14 7.6 Z");
      paint(c, beard, w, wol, 1.2);
      inside(c, beard, () => { stroke(c, "M -8 16 C -8.6 22, -6.6 27, -3.6 30 M 0 18 L 0 32 M 8 16 C 8.6 22, 6.6 27, 3.6 30", "#d9d5cc", 0.8); glow(c, oval(8, 22, 5, 9, -0.3), "#d9d5cc", 0.4); });
      const tache = P("M 0 10.4 C -3 8.9, -8 9.4, -12.4 12.6 C -8.6 15.2, -3.4 14.6, 0 12.6 C 3.4 14.6, 8.6 15.2, 12.4 12.6 C 8 9.4, 3 8.9, 0 10.4 Z");
      paint(c, tache, w, wol, 1);
      const hat = P("M -13.8 -10.6 C -16.4 -19, -15.6 -27, -11.6 -33 C -8 -38.4, -3.4 -43, 0 -47.6 C 3.4 -43, 8 -38.4, 11.6 -33 C 15.6 -27, 16.4 -19, 13.8 -10.6 Q 0 -7.4 -13.8 -10.6 Z");
      paint(c, hat, red, dk, 1.3);
      inside(c, hat, () => { glow(c, P("M 4 -43 C 12 -36, 17 -26, 13.8 -10 L 9 -9.4 C 11 -22, 9 -34, 4 -43 Z"), "#000000", 0.2); glow(c, P("M -11.6 -30 C -9.6 -34, -6 -38, -3 -41 C -6.6 -35, -9 -28, -9.6 -20 Z"), "#ff6b70", 0.4); });
      stroke(c, "M -12.6 -11.4 C -14.6 -19, -13.8 -26.6, -10.4 -32 C -7.2 -36.8, -3 -40.8, 0 -44.8 C 3 -40.8, 7.2 -36.8, 10.4 -32 C 13.8 -26.6, 14.6 -19, 12.6 -11.4", gold, 1.1);
      const band = P("M -14 -10.4 Q 0 -7.2 14 -10.4 L 14.8 -14.4 Q 0 -11.2 -14.8 -14.4 Z");
      paint(c, band, gold, gdk, 1);
      paint(c, P("M -1.5 -34.6 L 1.5 -34.6 L 1.5 -29.4 L 5.6 -29.4 L 5.6 -26.4 L 1.5 -26.4 L 1.5 -17.6 L -1.5 -17.6 L -1.5 -26.4 L -5.6 -26.4 L -5.6 -29.4 L -1.5 -29.4 Z"), gold, gdk, 0.9);
    } },

    antlers: { up: 48, down: 0, side: 23, name: "Reindeer antlers", say: ["Rudolph called. He wants his nose back.", "Between Christmas and New Year: we train anyway."], draw(c) {
      const b = "#96632f", dk = "#4f3114";
      [-1, 1].forEach((s) => {
        const d = `M ${s * 6.6} -21.6 C ${s * 7.6} -28, ${s * 10.6} -34, ${s * 15.6} -39.6 M ${s * 9.4} -29.6 C ${s * 5.6} -31.6, ${s * 4} -34.6, ${s * 3.6} -38 M ${s * 12.6} -35.6 C ${s * 16.6} -34.4, ${s * 19.6} -35, ${s * 22} -37.6 M ${s * 13.6} -37.4 C ${s * 12.4} -41, ${s * 12.6} -44, ${s * 14} -46.6`;
        stroke(c, d, dk, 4.6); stroke(c, d, b, 2.6); stroke(c, `M ${s * 7.4} -24 C ${s * 8.4} -29, ${s * 10.6} -33.4, ${s * 14} -37.4`, "#c08a4c", 0.8, 0.8);
      });
      const band = P("M -15.6 -12 C -15 -19.6, -8 -24.6, 0 -24.6 C 8 -24.6, 15 -19.6, 15.6 -12 L 13.2 -12 C 12.4 -18, 7 -22, 0 -22 C -7 -22, -12.4 -18, -13.2 -12 Z");
      paint(c, band, b, dk, 1.1);
      glow(c, oval(0.2, 7.6, 6.4, 6), "#ff3b3b", 0.22);
      paint(c, oval(0.2, 7.6, 3.9, 3.7), "#e8202c", "#8c101c", 1); glow(c, oval(-1.1, 6.2, 1.3, 1), "#ffffff", 0.85);
    } },

    laurel: { up: 28, down: 0, side: 0, name: "Laurel wreath", say: ["{0} years with LEVEL-UP today. Respect! 🏆", "Another year stronger. Thanks for training with us."], draw(c) {
      const gold = "#f1c34a";
      [-1, 1].forEach((s) => {
        stroke(c, `M ${s * 15.4} 0.6 C ${s * 19.6} -9, ${s * 16.6} -20.6, ${s * 5.6} -25.6`, "#9c6b0e", 1.1);
        [[15.9, -1.4, -1.25], [17.4, -6.6, -1.5], [17.3, -11.8, -1.8], [15.6, -16.6, -2.15], [12.4, -20.6, -2.5], [8.4, -23.6, -2.85]].forEach(([x, y, r], i) => {
          leaf(c, s * x, y, 6.6 - i * 0.22, s > 0 ? r : Math.PI - r, gold);
          leaf(c, s * (x - 1.6), y - 0.6, 5 - i * 0.2, s > 0 ? r - 0.75 : Math.PI - r + 0.75, "#ffd96b");
        });
      });
    } }
  };
  Object.keys(LOOKS).forEach((id) => { LOOKS[id].id = id; });

  // ---------- the calendar ----------
  // Western Easter Sunday (anonymous Gregorian algorithm)
  function easter(year) {
    const a = year % 19, b = Math.floor(year / 100), c = year % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(year, month - 1, day);
  }
  const DAY = 864e5;
  const dayNo = (d) => Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY);
  const leap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

  // Fixed days and periods, most special first: [from, to, look] as month * 100 + day
  const FIXED = [
    [1231, 1231, "party"], [101, 102, "party"], [105, 106, "crown"], [212, 214, "hearts"], [317, 317, "clover"], [401, 401, "groucho"],
    [501, 501, "hardhat"], [711, 711, "flemish"], [721, 721, "belgium"], [901, 907, "gradcap"], [919, 1004, "tirol"],
    [1018, 1024, "witch"], [1025, 1031, "pumpkin"], [1110, 1111, "mitre"], [1205, 1206, "mitre"], [1201, 1226, "santa"], [1227, 1230, "antlers"]
  ];
  // What he wears when nothing special is on
  const SEASONS = [
    [103, 131, "bobble"], [201, 229, "earmuffs"], [301, 319, "rain"], [320, 430, "flowers"], [502, 620, "cap"], [621, 731, "shades"],
    [801, 831, "straw"], [908, 918, "headphones"], [1005, 1017, "rain"], [1101, 1130, "tache"]
  ];
  // Which look on a date. who: { birthday: "MM-DD", joined: Date or ISO text }
  function pick(date, who) {
    const d = date || new Date(), y = d.getFullYear(), k = (d.getMonth() + 1) * 100 + d.getDate(), n = dayNo(d);
    const out = (id, why, years) => ({ ...LOOKS[id], why, years });
    const bd = /^(\d\d)-(\d\d)$/.exec((who && who.birthday) || "");
    if (bd) {
      let bk = Number(bd[1]) * 100 + Number(bd[2]);
      if (bk === 229 && !leap(y)) bk = 228;
      if (bk === k) return out("cake", "birthday");
    }
    const joined = who && who.joined ? new Date(who.joined) : null;
    if (joined && !Number.isNaN(joined.getTime()) && y > joined.getFullYear()) {
      let jk = (joined.getMonth() + 1) * 100 + joined.getDate();
      if (jk === 229 && !leap(y)) jk = 228;
      if (jk === k) return out("laurel", "anniversary", y - joined.getFullYear());
    }
    if (k === 214) return out("hearts", "day");                         // Valentine's Day itself, also in carnival week
    const e = dayNo(easter(y));
    if (n >= e - 52 && n <= e - 47) return out("jester", "carnival");   // Thursday to Shrove Tuesday: Aalst Carnaval
    if (n >= e - 2 && n <= e + 1) return out("bunny", "easter");        // Good Friday to Easter Monday
    for (const [a, b, id] of FIXED) if (k >= a && k <= b && id !== "santa") return out(id, "day");
    // the week of the Tour of Flanders (first Sunday of April), from Monday
    const apr1 = new Date(y, 3, 1), ronde = dayNo(apr1) + ((7 - apr1.getDay()) % 7);
    if (n >= ronde - 6 && n <= ronde) return out("cycling", "ronde");
    for (const [a, b, id] of FIXED) if (k >= a && k <= b) return out(id, "day");
    for (const [a, b, id] of SEASONS) if (k >= a && k <= b) return out(id, "season");
    return null;
  }
  // Every look with the days it is worn in a year (for the overview in the admin)
  function calendar(year) {
    const days = {};
    for (let d = new Date(year, 0, 1); d.getFullYear() === year; d = new Date(year, d.getMonth(), d.getDate() + 1)) {
      const look = pick(d, null);
      if (look) (days[look.id] = days[look.id] || []).push(new Date(d));
    }
    return Object.keys(LOOKS).map((id) => ({ ...LOOKS[id], days: days[id] || [] }));
  }

  // ---------- putting it on ----------
  // Listens to a canvas context; when the engine has drawn the mascot's head, the look is drawn on top.
  // getLook() gives the look (or null), getEnv() the colours.
  function dress(ctx, getLook, getEnv) {
    if (!ctx || ctx.__levelupDressed) return ctx;
    ctx.__levelupDressed = true;
    const save = ctx.save.bind(ctx), restore = ctx.restore.bind(ctx), scale = ctx.scale.bind(ctx), translate = ctx.translate.bind(ctx), rotate = ctx.rotate.bind(ctx);
    let depth = 0, head = -1, step = 0; // step: translate, rotate, translate(0, y), scale(1.08): the engine's way to the head
    ctx.save = () => { depth++; step = 0; save(); };
    ctx.translate = (x, y) => { translate(x, y); step = step === 2 && x === 0 ? 3 : 1; };
    ctx.rotate = (a) => { rotate(a); step = step === 1 ? 2 : 0; };
    ctx.scale = (x, y) => { scale(x, y); if (step === 3 && x === 1.08 && y === 1.08) head = depth; step = 0; };
    ctx.restore = () => {
      if (head === depth && head > 0) {
        head = -1;
        let look = null;
        try { look = getLook && getLook(); } catch (e) { look = null; }
        if (look && look.draw) {
          save();
          try { look.draw(ctx, (getEnv && getEnv()) || { accent: "#5ee6a8" }); } catch (e) { /* never break the mascot */ }
          restore();
        }
      }
      depth = Math.max(0, depth - 1); step = 0; restore();
    };
    return ctx;
  }

  root.LevelUpLooks = { LOOKS, pick, calendar, dress, easter };
})(typeof window !== "undefined" ? window : globalThis);
