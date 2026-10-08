# Builds img/logo-anim.svg: the LEVEL-UP stickman doing real pull-ups (same shapes as img/logo.JPG).
import math
W, H = 546, 549
BAR_Y = 70
HAND_L, HAND_R = (166.5, 80.0), (372.5, 80.0)
SH_L, SH_R = (205.0, 171.0), (334.0, 171.0)      # shoulders in the hanging pose
RISE = 88                                          # chin just clears the bar
ARM = 16                                           # arm thickness
a = b = math.dist(HAND_L, SH_L) / 2                # upper arm = forearm

def ease(x): return x * x * (3 - 2 * x)
def dy_at(t):  # 0..1 over one rep
    if t < 0.12: return 0
    if t < 0.46: return RISE * ease((t - 0.12) / 0.34)
    if t < 0.56: return RISE
    if t < 0.92: return RISE * (1 - ease((t - 0.56) / 0.36))
    return 0

def elbow(hand, sh, outward):
    d = math.dist(hand, sh)
    if d >= a + b - 1e-6:
        return ((hand[0] + sh[0]) / 2, (hand[1] + sh[1]) / 2)
    mx, my = (hand[0] + sh[0]) / 2, (hand[1] + sh[1]) / 2
    h = math.sqrt(max(0, a * a - (d / 2) ** 2))
    ux, uy = (sh[0] - hand[0]) / d, (sh[1] - hand[1]) / d
    c1 = (mx - uy * h, my + ux * h); c2 = (mx + uy * h, my - ux * h)
    return max(c1, c2, key=lambda p: p[1])   # elbows always point down, like a real pull-up

def rot_down(origin, target):   # rotation (deg, clockwise) turning (0,1) towards target
    vx, vy = target[0] - origin[0], target[1] - origin[1]
    return math.degrees(math.atan2(-vx, vy))
def rot_up(origin, target):     # rotation turning (0,-1) towards target
    vx, vy = target[0] - origin[0], target[1] - origin[1]
    return math.degrees(math.atan2(vx, -vy))

STEPS = 40
frames = {k: [] for k in ['body', 'fl', 'ul', 'fr', 'ur']}
for i in range(STEPS + 1):
    t = i / STEPS
    dy = dy_at(t)
    shl = (SH_L[0], SH_L[1] - dy); shr = (SH_R[0], SH_R[1] - dy)
    el = elbow(HAND_L, shl, +1); er = elbow(HAND_R, shr, -1)
    pct = f'{t * 100:.1f}%'
    frames['body'].append(f'{pct}{{transform:translateY({-dy:.2f}px)}}')
    frames['fl'].append(f'{pct}{{transform:rotate({rot_down(HAND_L, el):.2f}deg)}}')
    frames['fr'].append(f'{pct}{{transform:rotate({rot_down(HAND_R, er):.2f}deg)}}')
    frames['ul'].append(f'{pct}{{transform:translateY({-dy:.2f}px) rotate({rot_up(SH_L, (el[0], el[1] + dy)):.2f}deg)}}')
    frames['ur'].append(f'{pct}{{transform:translateY({-dy:.2f}px) rotate({rot_up(SH_R, (er[0], er[1] + dy)):.2f}deg)}}')

kf = ''.join(f'@keyframes lu-{k}{{{"".join(v)}}}' for k, v in frames.items())
WHITE, GREY = '#f4f4f4', '#bdbdbd'
style = f'''
.lu-part{{transform-box:view-box}}
.lu-body{{transform-origin:0 0}}
.lu-fl{{transform-origin:{HAND_L[0]}px {HAND_L[1]}px}} .lu-fr{{transform-origin:{HAND_R[0]}px {HAND_R[1]}px}}
.lu-ul{{transform-origin:{SH_L[0]}px {SH_L[1]}px}} .lu-ur{{transform-origin:{SH_R[0]}px {SH_R[1]}px}}
.lu-anim .lu-part{{animation-duration:1.6s;animation-timing-function:linear;animation-iteration-count:var(--lu-reps,infinite)}}
.lu-anim .lu-body{{animation-name:lu-body}} .lu-anim .lu-fl{{animation-name:lu-fl}} .lu-anim .lu-fr{{animation-name:lu-fr}}
.lu-anim .lu-ul{{animation-name:lu-ul}} .lu-anim .lu-ur{{animation-name:lu-ur}}
@media (prefers-reduced-motion:reduce){{.lu-anim .lu-part{{animation:none}}}}
{kf}'''
fl0 = rot_down(HAND_L, ((HAND_L[0] + SH_L[0]) / 2, (HAND_L[1] + SH_L[1]) / 2))
svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" class="lu-logo lu-anim" role="img" aria-label="LEVEL-UP">
<style>{style}</style>
<rect width="{W}" height="{H}" fill="#000"/>
<g fill="{GREY}">
<rect x="76" y="28" width="16" height="498" rx="8"/><rect x="448" y="28" width="16" height="498" rx="8"/>
<rect x="52" y="{BAR_Y - 4}" width="440" height="9" rx="4.5"/>
</g>
<g stroke="{WHITE}" stroke-width="{ARM}" stroke-linecap="round" fill="none">
<line class="lu-part lu-fl" x1="{HAND_L[0]}" y1="{HAND_L[1]}" x2="{HAND_L[0]}" y2="{HAND_L[1] + b:.1f}" style="transform:rotate({fl0:.2f}deg)"/>
<line class="lu-part lu-fr" x1="{HAND_R[0]}" y1="{HAND_R[1]}" x2="{HAND_R[0]}" y2="{HAND_R[1] + b:.1f}" style="transform:rotate({-fl0:.2f}deg)"/>
<line class="lu-part lu-ul" x1="{SH_L[0]}" y1="{SH_L[1]}" x2="{SH_L[0]}" y2="{SH_L[1] - a:.1f}" style="transform:rotate({rot_up(SH_L, ((HAND_L[0] + SH_L[0]) / 2, (HAND_L[1] + SH_L[1]) / 2)):.2f}deg)"/>
<line class="lu-part lu-ur" x1="{SH_R[0]}" y1="{SH_R[1]}" x2="{SH_R[0]}" y2="{SH_R[1] - a:.1f}" style="transform:rotate({rot_up(SH_R, ((HAND_R[0] + SH_R[0]) / 2, (HAND_R[1] + SH_R[1]) / 2)):.2f}deg)"/>
</g>
<g class="lu-part lu-body" fill="{WHITE}">
<circle cx="269" cy="131" r="22"/>
<path d="M198 163 H341 Q350 163 346 171 L301 192 V290 H241 V192 L194 171 Q190 163 198 163Z"/>
<rect x="241" y="282" width="22" height="144" rx="11"/><rect x="277" y="282" width="22" height="144" rx="11"/>
</g>
<g fill="#111" stroke="{GREY}" stroke-width="3"><circle cx="{HAND_L[0]}" cy="{BAR_Y}" r="9"/><circle cx="{HAND_R[0]}" cy="{BAR_Y}" r="9"/></g>
</svg>
'''
open(__import__('os').path.join(__import__('os').path.dirname(__file__), '..', 'img', 'logo-anim.svg'), 'w').write(svg)
print(len(svg), 'bytes; arm segment', round(a, 1))
