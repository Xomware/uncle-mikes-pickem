"""Uncle Mike's Pick Em logo set: brand fonts shaped with HarfBuzz and outlined to paths."""
# Run: uv run --with fonttools --with brotli --with uharfbuzz python scripts/brand/logos.py

import math
from pathlib import Path

import uharfbuzz as hb
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

FONTS = Path(__file__).resolve().parents[2] / "frontend/app/fonts"
OUT = Path(__file__).resolve().parents[2] / "frontend/public/brand/logos"
OUT.mkdir(exist_ok=True)


def oklch(l, c, h):
    a, b = c * math.cos(math.radians(h)), c * math.sin(math.radians(h))
    l_, m_, s_ = l + 0.3963377774 * a + 0.2158037573 * b, l - 0.1055613458 * a - 0.0638541728 * b, l - 0.0894841775 * a - 1.2914855480 * b
    l3, m3, s3 = l_**3, m_**3, s_**3
    rgb = (4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3,
           -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3,
           -0.0041960863 * l3 - 0.7034186147 * m3 + 1.7076147010 * s3)
    enc = lambda x: 12.92 * x if x <= 0.0031308 else 1.055 * x ** (1 / 2.4) - 0.055
    return "#" + "".join(f"{round(max(0, min(1, enc(v))) * 255):02x}" for v in rgb)


# Exact app tokens (globals.css, .dark), converted to hex.
C = {
    "turf": oklch(0.43, 0.1, 146), "turf2": oklch(0.48, 0.11, 144),
    "endzone": oklch(0.3, 0.075, 152), "endzone2": oklch(0.335, 0.08, 152),
    "chalk": oklch(0.97, 0.012, 105), "goalpost": oklch(0.87, 0.17, 96),
    "ink": oklch(0.2, 0.04, 150), "board": oklch(0.165, 0.008, 70),
    "led": oklch(0.84, 0.16, 75), "blood": oklch(0.6, 0.22, 27),
    "night": oklch(0.15, 0.01, 20), "pylon": oklch(0.66, 0.2, 40),
    "correct": oklch(0.84, 0.18, 148), "wrong": oklch(0.74, 0.17, 25),
}


class Face:
    def __init__(self, file, wght):
        import io
        raw = TTFont(FONTS / file)
        raw.flavor = None
        ttf = io.BytesIO()
        raw.save(ttf)
        tt = TTFont(io.BytesIO(ttf.getvalue()))
        if "fvar" in tt:
            tt = instantiateVariableFont(tt, {"wght": wght})
        self.tt, self.upem, self.glyphs = tt, tt["head"].unitsPerEm, tt.getGlyphSet()
        self.hbfont = hb.Font(hb.Face(ttf.getvalue()))
        self.hbfont.set_variations({"wght": wght})
        self.order = tt.getGlyphOrder()
        self.cap = tt["OS/2"].sCapHeight or self.upem * 0.7

    def text(self, s, size, x, y, track=0.0, anchor="start"):
        """Path data for s with its baseline at y; returns (d, width)."""
        buf = hb.Buffer()
        buf.add_str(s)
        buf.guess_segment_properties()
        hb.shape(self.hbfont, buf, {"kern": True, "liga": False})
        k = size / self.upem
        adv = [p.x_advance + track * self.upem for p in buf.glyph_positions]
        width = (sum(adv) - track * self.upem) * k
        x0 = x - width / 2 if anchor == "middle" else x - width if anchor == "end" else x
        pen, cx = SVGPathPen(self.glyphs), 0
        for info, pos, a in zip(buf.glyph_infos, buf.glyph_positions, adv):
            g = self.order[info.codepoint]
            tp = TransformPen(pen, (k, 0, 0, -k, x0 + (cx + pos.x_offset) * k, y - pos.y_offset * k))
            self.glyphs[g].draw(tp)
            cx += a
        return pen.getCommands(), width

    def cap_px(self, size):
        return self.cap * size / self.upem


# The site moved to Graduate; the generated marks keep the stencil face, kept here.
STENCIL = Face(Path(__file__).parent / "big-shoulders-stencil.woff2", 900)
HEAD = Face("big-shoulders.woff2", 700)
HEAD_X = Face("big-shoulders.woff2", 800)
LED = Face("doto.woff2", 900)


def goalpost(x, y, h, color, pylon=True):
    """The app's Goalpost icon (32x40 box) scaled to height h, top-left at x,y."""
    s = h / 40
    flags = f'<path d="M5 1 .6 3.2 5 5.4zM27 1l4.4 2.2L27 5.4z" fill="{C["pylon"]}"/>' if pylon else ""
    return (f'<g transform="translate({x:.2f} {y:.2f}) scale({s:.4f})">'
            f'<g stroke="{color}" stroke-width="3.2" stroke-linecap="square" fill="none">'
            f'<path d="M16 39V30c0-3-2-4-2-6"/><path d="M5 22h22M5 22V2.5M27 22V2.5"/></g>{flags}</g>')


def painted(d, fill, shadow, dx, dy):
    """Stencil paint with the hero's goalpost-yellow offset shadow."""
    sh = f'<path d="{d}" fill="{shadow}" transform="translate({dx:.2f} {dy:.2f})"/>' if shadow else ""
    return sh + f'<path d="{d}" fill="{fill}"/>'


def svg(w, h, body, title):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w:.0f} {h:.0f}" width="{w:.0f}" height="{h:.0f}" role="img">'
            f"<title>{title}</title>{body}</svg>\n")


def endzone_bg(w, h, rx=0, goal_line=True):
    """The app's end zone: -55deg paint stripes, 22px each, goal line along the bottom."""
    gl = f'<rect y="{h - 10}" width="{w}" height="10" fill="{C["chalk"]}"/>' if goal_line else ""
    return (f'<defs><clipPath id="ez"><rect width="{w}" height="{h}" rx="{rx}"/></clipPath>'
            f'<pattern id="stripes" width="44" height="44" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">'
            f'<rect width="22" height="44" fill="{C["endzone2"]}"/></pattern></defs>'
            f'<g clip-path="url(#ez)"><rect width="{w}" height="{h}" fill="{C["endzone"]}"/>'
            f'<rect width="{w}" height="{h}" fill="url(#stripes)"/>{gl}</g>')


def chalk_line(text, cx, y, size, color, rule):
    d, w = HEAD.text(text, size, cx, y, track=0.5, anchor="middle")
    cap = HEAD.cap_px(size)
    gap, rl = size * 0.9, rule
    ry = y - cap / 2 - size * 0.05
    rules = (f'<rect x="{cx - w / 2 - gap - rl:.1f}" y="{ry:.1f}" width="{rl}" height="{size * 0.12:.1f}" fill="{color}"/>'
             f'<rect x="{cx + w / 2 + gap:.1f}" y="{ry:.1f}" width="{rl}" height="{size * 0.12:.1f}" fill="{color}"/>')
    return f'<path d="{d}" fill="{color}"/>' + rules


# 1. Stacked lockup: goalpost, UNCLE / MIKE'S, - PICK EM -
def stacked(fill, shadow, sub, post, bg=None, name="lockup-stacked"):
    W, size = 760, 230
    cap = STENCIL.cap_px(size)
    top = 40 + 150 + 40
    l1y, l2y = top + cap, top + cap * 2 + size * 0.16
    d1, _ = STENCIL.text("UNCLE", size, W / 2, l1y, track=0.0, anchor="middle")
    d2, _ = STENCIL.text("MIKE'S", size, W / 2, l2y, track=0.0, anchor="middle")
    subY = l2y + 110
    H = subY + 46
    body = (endzone_bg(W, H + 10, rx=0) if bg else "")
    body += goalpost(W / 2 - 60, 40, 150, post)
    body += painted(d1, fill, shadow, size * 0.035, size * 0.045) + painted(d2, fill, shadow, size * 0.035, size * 0.045)
    body += chalk_line("PICK EM", W / 2, subY, 62, sub, 80)
    (OUT / f"{name}.svg").write_text(svg(W, H + (10 if bg else 0), body, "Uncle Mike's Pick Em"))


stacked(C["chalk"], C["goalpost"], C["chalk"], C["goalpost"])
stacked(C["chalk"], C["goalpost"], C["chalk"], C["goalpost"], bg=True, name="lockup-stacked-endzone")
stacked(C["ink"], None, C["ink"], C["ink"], name="lockup-stacked-ink")


# 2. Horizontal lockup (the nav): goalpost | UNCLE MIKE'S over P I C K  E M
def horizontal(fill, shadow, sub, post, name):
    size = 150
    cap = STENCIL.cap_px(size)
    gx, gh = 20, 190
    tx = gx + gh * 0.8 + 40
    y1 = 30 + cap
    d1, w1 = STENCIL.text("UNCLE MIKE'S", size, tx, y1)
    sub_size = 64
    d2, w2 = HEAD.text("PICK EM", sub_size, tx + 4, y1 + 30 + HEAD.cap_px(sub_size), track=0.62)
    W, H = tx + max(w1, w2) + 40, y1 + 30 + HEAD.cap_px(sub_size) + 34
    body = goalpost(gx, (H - gh) / 2, gh, post) + painted(d1, fill, shadow, size * 0.035, size * 0.045)
    body += f'<path d="{d2}" fill="{sub}"/>'
    (OUT / f"{name}.svg").write_text(svg(W, H, body, "Uncle Mike's Pick Em"))


horizontal(C["chalk"], C["goalpost"], C["chalk"], C["goalpost"], "lockup-horizontal")
horizontal(C["ink"], None, C["ink"], C["ink"], "lockup-horizontal-ink")


# 3. App icon: end zone tile, UM monogram painted on it.
def icon_monogram():
    S = 512
    body = endzone_bg(S, S, rx=112, goal_line=False)
    body += f'<rect x="0" y="{S - 70}" width="{S}" height="22" fill="{C["chalk"]}" clip-path="url(#ez)"/>'
    size = 290
    cap = STENCIL.cap_px(size)
    d, _ = STENCIL.text("UM", size, S / 2 - 6, (S - 70) / 2 + cap / 2 + 4, track=0.02, anchor="middle")
    body += painted(d, C["chalk"], C["goalpost"], size * 0.035, size * 0.045)
    (OUT / "icon-monogram.svg").write_text(svg(S, S, body, "Uncle Mike's Pick Em"))


def icon_goalpost():
    S = 512
    stripes = f'<rect y="{S * 0.33:.0f}" width="{S}" height="{S * 0.33:.0f}" fill="{C["turf2"]}"/>'
    body = (f'<defs><clipPath id="t"><rect width="{S}" height="{S}" rx="112"/></clipPath></defs>'
            f'<g clip-path="url(#t)"><rect width="{S}" height="{S}" fill="{C["turf"]}"/>{stripes}'
            f'<rect y="{S - 86}" width="{S}" height="22" fill="{C["chalk"]}"/></g>')
    body += goalpost(S / 2 - 150, 52, 380, C["goalpost"])
    (OUT / "icon-goalpost.svg").write_text(svg(S, S, body, "Uncle Mike's Pick Em"))


icon_monogram()
icon_goalpost()


# 4. Sudden Death: LED OVERTIME over blood-red stencil, on a night board or clear.
def sudden(name, board):
    W, size = 900, 210
    cap = STENCIL.cap_px(size)
    led, _ = LED.text("OVERTIME", 56, W / 2, 40 + LED.cap_px(56), track=0.32, anchor="middle")
    y1 = 40 + LED.cap_px(56) + 40 + cap
    d1, _ = STENCIL.text("SUDDEN", size, W / 2, y1, anchor="middle")
    d2, _ = STENCIL.text("DEATH", size, W / 2, y1 + cap + size * 0.08, anchor="middle")
    H = y1 + cap + size * 0.08 + 56
    bgd = (f'<rect width="{W}" height="{H}" rx="24" fill="{C["night"]}"/>'
           f'<rect x="0" y="0" width="{W}" height="10" fill="{C["blood"]}"/>') if board else ""
    body = bgd + f'<path d="{led}" fill="{C["led"]}"/>'
    shadow = "#000000"
    body += painted(d1, C["blood"], shadow, size * 0.03, size * 0.04) + painted(d2, C["blood"], shadow, size * 0.03, size * 0.04)
    (OUT / f"{name}.svg").write_text(svg(W, H, body, "Sudden Death"))


sudden("sudden-death", False)
sudden("sudden-death-board", True)


# 5. Confidence chip: the 16 tile from the pick sheet.
def chip():
    S, size = 240, 190
    d, _ = STENCIL.text("16", size, S / 2, S / 2 + STENCIL.cap_px(size) / 2 - 8, anchor="middle")
    body = (f'<rect width="{S}" height="{S}" rx="28" fill="{C["ink"]}"/>'
            f'<defs><clipPath id="c"><rect width="{S}" height="{S}" rx="28"/></clipPath></defs>'
            f'<rect y="{S - 16}" width="{S}" height="16" fill="{C["chalk"]}" clip-path="url(#c)"/>'
            f'<path d="{d}" fill="{C["goalpost"]}"/>')
    (OUT / "mark-confidence-16.svg").write_text(svg(S, S, body, "Confidence 16"))


chip()
(OUT / "mark-goalpost.svg").write_text(svg(64, 80, goalpost(0, 0, 80, C["goalpost"]), "Goalpost"))
