# Builds img/logo-anim.svg: the LEVEL-UP stickman (same shapes as img/logo.JPG) doing real pull-ups.
# Each arm is one stroked path (hand -> elbow -> shoulder -> into the torso) with round joins, so the
# moving parts blend into one smooth figure. SMIL animation: runs inside an <img> in every browser.
# The site swaps repeatCount="indefinite" for "3" in the header/footer (game.js animateLogos).
import math, os
W, H = 546, 549
BAR_Y = 70
REP = 1.15                                   # seconds per pull-up
RISE = 90                                    # chin clears the bar
ARM = 23                                     # arm thickness (as in logo.JPG)
HAND_L, HAND_R = (171.0, 82.0), (375.0, 82.0)
# elbow in the hanging pose (the bend in logo.JPG) and the shoulder, inside the torso's top corner
EL_L, EL_R = (190.0, 157.0), (356.0, 157.0)
SH_L, SH_R = (253.0, 190.0), (293.0, 190.0)
FORE = math.dist(HAND_L, EL_L)               # hand -> elbow
UPPER = math.dist(EL_L, SH_L)                # elbow -> shoulder
STEPS = 60

def ease(x): return x * x * (3 - 2 * x)
def dy_at(t):  # 0..1 over one rep
    if t < 0.08: return 0
    if t < 0.44: return RISE * ease((t - 0.08) / 0.36)
    if t < 0.52: return RISE
    if t < 0.92: return RISE * (1 - ease((t - 0.52) / 0.40))
    return 0

def elbow(hand, sh, out):  # out = -1 left arm, +1 right arm
    d = min(math.dist(hand, sh), FORE + UPPER - 1e-6)
    x = (FORE * FORE - UPPER * UPPER + d * d) / (2 * d)   # along hand -> shoulder
    h = math.sqrt(max(0.0, FORE * FORE - x * x))
    ux, uy = (sh[0] - hand[0]) / d, (sh[1] - hand[1]) / d
    bx, by = hand[0] + ux * x, hand[1] + uy * x
    c1 = (bx - uy * h, by + ux * h); c2 = (bx + uy * h, by - ux * h)
    return max(c1, c2, key=lambda p: p[1] + out * p[0])   # elbows go down and out, like a real pull-up

f = lambda v: f'{v:.1f}'.rstrip('0').rstrip('.')
def arm(hand, sh, out, dy):
    s = (sh[0], sh[1] - dy); e = elbow(hand, s, out)
    return f'M{f(hand[0])} {f(hand[1])}L{f(e[0])} {f(e[1])}L{f(s[0])} {f(s[1])}'

ts = [i / STEPS for i in range(STEPS + 1)]
key = ';'.join(f'{t:.4f}'.rstrip('0').rstrip('.') if t else '0' for t in ts)
arm_l = ';'.join(arm(HAND_L, SH_L, -1, dy_at(t)) for t in ts)
arm_r = ';'.join(arm(HAND_R, SH_R, 1, dy_at(t)) for t in ts)
body = ';'.join(f'0 {f(-dy_at(t))}' for t in ts)
anim = f'dur="{REP}s" keyTimes="{key}" calcMode="linear" repeatCount="indefinite"'

WHITE = '#fff'
svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" class="lu-logo" role="img" aria-label="LEVEL-UP">
<rect width="{W}" height="{H}" fill="#000"/>
<g fill="{WHITE}">
<rect x="76" y="28" width="16" height="498" rx="8"/><rect x="448" y="28" width="16" height="498" rx="8"/>
<rect x="52" y="{BAR_Y - 4}" width="442" height="9" rx="4.5"/>
</g>
<g fill="none" stroke="{WHITE}" stroke-width="{ARM}" stroke-linecap="round" stroke-linejoin="round">
<path d="{arm(HAND_L, SH_L, -1, 0)}"><animate attributeName="d" values="{arm_l}" {anim}/></path>
<path d="{arm(HAND_R, SH_R, 1, 0)}"><animate attributeName="d" values="{arm_r}" {anim}/></path>
</g>
<g fill="{WHITE}">
<animateTransform attributeName="transform" type="translate" values="{body}" {anim}/>
<circle cx="273" cy="133" r="23"/>
<path d="M246 178.5H300V292H246Z"/>
<rect x="246" y="280" width="22" height="140" rx="11"/><rect x="278" y="280" width="22" height="140" rx="11"/>
</g>
</svg>
'''
out = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'img', 'logo-anim.svg')
open(out, 'w').write(svg)
print(len(svg), 'bytes; hang elbow', [round(v, 1) for v in elbow(HAND_L, SH_L, -1)])
