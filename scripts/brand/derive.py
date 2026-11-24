"""Every raster brand asset, cut from the pixels of logo-primary.png. The one new mark, Sudden Death,
is set in the app's Graduate and filled with chalk and turf lifted from the primary's own pixels.
Run: uv run --with pillow python scripts/brand/derive.py
"""

import random
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

FRONTEND = Path(__file__).resolve().parents[2] / "frontend"
BRAND = FRONTEND / "public/brand"
LOGOS = BRAND / "logos"
PRIMARY = Image.open(LOGOS / "logo-primary.png").convert("RGBA")
GRADUATE = str(FRONTEND / "app/fonts/graduate.woff2")

# Dark fields the logo sits on: the scoreboard board, and Sudden Death's night field (globals.css, base.html).
BOARD = (22, 18, 13)
NIGHT = (15, 30, 21)

# The goalpost's stem runs down into the black rim of UNCLE: rows 341-362, between x 640 and 730.
# Above row 341 is the goalpost, below it the lettering.
SPLIT, STEM_END, STEM_X = 341, 362, (640, 730)


def is_stem(rgba):
    r, g, b, a = rgba
    return a > 0 and r > 110 and g > 90 and b < r * 0.6


def cut_goalpost(extend=36, fade=30):
    """The goalpost alone. Its stem disappears behind UNCLE, so a clean stretch of the stem is
    repeated below the cut and faded out rather than ending on the rim's diagonal."""
    post = PRIMARY.crop((232, 0, 1145, SPLIT))
    strip = post.crop((0, SPLIT - 20, post.width, SPLIT))
    out = Image.new("RGBA", (post.width, SPLIT + extend))
    out.paste(post)
    for y in range(SPLIT, SPLIT + extend, strip.height):
        out.paste(strip, (0, y))
    px = out.load()
    for y in range(out.height - fade, out.height):
        keep = (out.height - y) / fade
        for x in range(out.width):
            r, g, b, a = px[x, y]
            px[x, y] = (r, g, b, round(a * keep))
    return out


def cut_lettering():
    """Everything under the goalpost, with the stem's tail painted over in the rim's black."""
    words = PRIMARY.crop((0, SPLIT, PRIMARY.width, PRIMARY.height))
    px = words.load()
    rim = px[600, 10]
    for y in range(STEM_END - SPLIT):
        for x in range(*STEM_X):
            if is_stem(px[x, y]):
                px[x, y] = rim
    return words


LETTERING = cut_lettering()
GOALPOST = cut_goalpost()


def narrow_goalpost(keep=170, stem=72):
    """The goalpost with the middle of the crossbar taken out, so it sits in a square.
    The crossbar is a straight tube, so the two seams don't show."""
    w, h = GOALPOST.size
    mid = 685 - 232
    pieces = [GOALPOST.crop((0, 0, keep, h)), GOALPOST.crop((mid - stem, 0, mid + stem, h)), GOALPOST.crop((w - keep, 0, w, h))]
    out = Image.new("RGBA", (sum(p.width for p in pieces), h))
    x = 0
    for p in pieces:
        out.paste(p, (x, 0))
        x += p.width
    return out


def fit(img, w, h):
    s = min(w / img.width, h / img.height)
    return img.resize((round(img.width * s), round(img.height * s)), Image.LANCZOS)


def on_field(size, color, *placed):
    """Composite (image, center_x, center_y) onto a flat field."""
    out = Image.new("RGBA", size, color + (255,))
    for img, cx, cy in placed:
        out.alpha_composite(img, (round(cx - img.width / 2), round(cy - img.height / 2)))
    return out.convert("RGB")


def lockup_horizontal():
    """Goalpost beside the lettering, standing on the same ground line."""
    post = fit(narrow_goalpost(), 10_000, 300)
    words = fit(LETTERING, 10_000, 400)
    gap = 16
    out = Image.new("RGBA", (post.width + gap + words.width, words.height))
    out.alpha_composite(post, (0, words.height - post.height - 40))
    out.alpha_composite(words, (post.width + gap, 0))
    return out


def icon(size):
    post = narrow_goalpost()
    return on_field((size, size), BOARD, (fit(post, size * 0.92, size * 0.92), size / 2, size / 2))


def ico(path, sizes):
    big = icon(256)
    big.save(path, sizes=[(s, s) for s in sizes], bitmap_format="png")


# Sudden Death. Built at the primary's own scale (its letters are ~185px tall) so the chalk grain
# matches without resampling.
BLOOD = (230, 44, 44)  # --blood, oklch(0.6 0.22 27)
RIM = (3, 2, 1)
TRANSPOSES = [None, *Image.Transpose]


def tiles(src, mask, size=44, stride=6):
    """Every size x size square of src that lies wholly inside mask."""
    out = []
    for y in range(0, src.height - size, stride):
        for x in range(0, src.width - size, stride):
            box = (x, y, x + size, y + size)
            if mask.crop(box).getextrema()[0] == 255:
                out.append(src.crop(box))
    return out


def chalk_tiles():
    """Squares from the faces of UNCLE and MIKE'S. Faces are the bright, unsaturated pixels; closing
    the mask takes the grit specks back in, eroding it keeps the squares off the yellow edge."""
    src = PRIMARY.crop((0, SPLIT + 10, PRIMARY.width, 775)).convert("RGB")
    bright = src.point(lambda v: 255 if v > 150 else 0).convert("L", (1 / 3, 1 / 3, 1 / 3, 0))
    face = bright.point(lambda v: 255 if v == 255 else 0)
    sat = ImageChops.subtract(src.convert("HSV").getchannel("S"), Image.new("L", src.size, 50))
    face = ImageChops.subtract(face, sat.point(lambda v: 255 if v else 0))
    face = face.filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.MinFilter(5)).filter(ImageFilter.MinFilter(9))
    return tiles(src, face)


def turf_tiles():
    src = PRIMARY.crop((0, 795, PRIMARY.width, 960)).convert("RGB")
    r, g, b = src.split()
    grass = ImageChops.subtract(g, ImageChops.lighter(r, b)).point(lambda v: 255 if v > 12 else 0)
    return tiles(src, grass.filter(ImageFilter.MinFilter(5)), size=32, stride=4)


def synth(size, pool, seed):
    """Cover size with squares from pool, flipped and turned, dropped at random over a full first pass.
    Hard edges at random spots vanish in the grit; a regular grid or cross-fades (which average the
    specks away) showed as plaid."""
    rnd = random.Random(seed)
    p = pool[0].width
    out = Image.new("RGB", size)

    def drop(x, y):
        t = rnd.choice(pool)
        turn = rnd.choice(TRANSPOSES)
        out.paste(t.transpose(turn) if turn else t, (x, y))

    for y in range(0, size[1], p):
        for x in range(0, size[0], p):
            drop(x, y)
    for _ in range(3 * size[0] * size[1] // (p * p)):
        drop(rnd.randrange(-p, size[0]), rnd.randrange(-p, size[1]))
    return out


def dilate(mask, r):
    """Grow mask by a disc of radius r, keeping its anti-aliased edge."""
    out = mask.copy()
    for dy in range(-r, r + 1):
        for dx in range(-r, r + 1):
            if dx * dx + dy * dy <= r * r:
                out = ImageChops.lighter(out, ImageChops.offset(mask, dx, dy))
    return out


def fill_holes(mask):
    """The primary's black rim runs solid through counters and between letters."""
    solid = mask.point(lambda v: 255 if v > 127 else 0)
    ImageDraw.floodfill(solid, (0, 0), 128)
    return ImageChops.lighter(mask, solid.point(lambda v: 255 if v != 128 else 0))


def word(text, cap, stroke, track, stretch=1.0):
    """Graduate is a light single weight; a stroke brings it up to the primary's heavy block letters,
    and a horizontal stretch to its wide set."""
    font = ImageFont.truetype(GRADUATE, round(cap / 0.75))
    glyphs = []
    for ch in text:
        g = Image.new("L", (round(cap * 2), round(cap * 1.6)))
        ImageDraw.Draw(g).text((stroke, cap * 1.2), ch, font=font, fill=255, anchor="ls", stroke_width=stroke, stroke_fill=255)
        left, _, right, _ = g.getbbox()
        g = g.crop((left, 0, right, g.height))
        glyphs.append(g.resize((round(g.width * stretch), g.height), Image.LANCZOS))
    out = Image.new("L", (sum(g.width for g in glyphs) + track * (len(glyphs) - 1), glyphs[0].height))
    x = 0
    for g in glyphs:
        out.paste(g, (x, 0))
        x += g.width + track
    return out.crop(out.getbbox())


def sheared(mask, slant):
    w, h = mask.size
    pad = round(abs(slant) * h)
    return mask.transform((w + pad, h), Image.AFFINE, (1, slant, -pad if slant > 0 else 0, 0, 1, 0), Image.BICUBIC)


def tinted(texture, color):
    """Chalk with its grit, in color: the texture's light level times the color."""
    lum = texture.convert("L")
    return Image.merge("RGB", [lum.point(lambda v, c=c: round(v * c / 255)) for c in color])


def sudden_death():
    chalk = chalk_tiles()
    turf = turf_tiles()

    sudden = word("SUDDEN", 160, 9, 34, 1.12)
    death = word("DEATH", 196, 11, 40, 1.12)
    over = sheared(word("OVERTIME", 104, 5, 26, 1.05), 0.22)

    pad, gap, strip_h, slope = 70, 46, 186, 0.45
    strip_top = max(sudden.width, death.width) + 150
    strip_bottom = strip_top + round(2 * slope * strip_h)
    w = strip_bottom + 2 * pad
    y_death = pad + sudden.height + gap
    y_strip = y_death + death.height + 34
    h = y_strip + strip_h + pad
    cx = w // 2

    def place(mask, x, y):
        out = Image.new("L", (w, h))
        out.paste(mask, (x, y))
        return out

    face = ImageChops.lighter(place(sudden, cx - sudden.width // 2, pad), place(death, cx - death.width // 2, y_death))
    # The primary's faces sit on a shallow extrusion that drops straight down, outlined all round.
    body = face
    for k in range(1, 7):
        body = ImageChops.lighter(body, ImageChops.offset(face, 0, k))
    outline = dilate(ImageChops.offset(body, -1, 0), 9)

    def half_width(y, inset=0):
        """Half the strip's width at row y. Its sides lean out like the primary's turf strip."""
        return strip_top / 2 + slope * (y - y_strip) - inset * (1 + slope * slope) ** 0.5

    def strip_poly(inset):
        t, b = y_strip + inset, y_strip + strip_h - inset
        top, bottom = half_width(t, inset), half_width(b, inset)
        return [(cx - top, t), (cx + top, t), (cx + bottom, b), (cx - bottom, b)]

    strip = Image.new("L", (w, h))
    ImageDraw.Draw(strip).polygon(strip_poly(0), fill=255)
    field = Image.new("L", (w, h))
    ImageDraw.Draw(field).polygon(strip_poly(17), fill=255)

    rim = fill_holes(dilate(ImageChops.lighter(outline, strip), 15))
    shadow = ImageChops.offset(rim, 0, 10).filter(ImageFilter.GaussianBlur(9)).point(lambda v: v * 0.55)

    out = Image.new("RGBA", (w, h))
    out.paste(RIM + (255,), (0, 0), shadow)
    out.paste(RIM + (255,), (0, 0), rim)

    chalk_tex = synth((w, h), chalk, 7)
    out.paste(tinted(synth((w, h), chalk, 11), BLOOD), (0, 0), strip)

    # Night turf: the primary's grass, pulled down to a dark, cold green under the floodlights.
    night = synth((w, h), turf, 3).convert("L").point(lambda v: min(255, round(v * 1.15)))
    night = Image.merge("RGB", [night.point(lambda v, k=k: round(v * k)) for k in (0.3, 0.55, 0.46)])
    out.paste(night, (0, 0), field)

    dashes = Image.new("L", (w, h))
    d = ImageDraw.Draw(dashes)
    for frac in (0.34, 0.66):
        y = y_strip + strip_h * frac
        edge = half_width(y)
        d.rectangle((cx - edge, y - 7, cx - edge + 100, y + 7), fill=255)
        d.rectangle((cx + edge - 100, y - 7, cx + edge, y + 7), fill=255)
    over_mask = place(over, cx - over.width // 2, y_strip + (strip_h - over.height) // 2)
    ink = ImageChops.lighter(ImageChops.multiply(dashes, field), over_mask)
    ink_shadow = ImageChops.offset(ink, 4, 6).filter(ImageFilter.GaussianBlur(3)).point(lambda v: v * 0.6)
    out.paste(RIM + (255,), (0, 0), ImageChops.multiply(ink_shadow, field))
    out.paste(chalk_tex, (0, 0), ink)

    red = tinted(chalk_tex.filter(ImageFilter.GaussianBlur(2)), BLOOD).point(lambda v: min(255, round(v * 1.08)))
    out.paste(red, (0, 0), outline)
    out.paste((52, 6, 8, 255), (0, 0), body)
    out.paste(chalk_tex, (0, 0), face)
    return out.crop(out.getbbox())


SUDDEN = sudden_death()
SUDDEN.save(LOGOS / "sudden-death.png", optimize=True)
# The death pool's header shows it up to 352px wide; 3x for phones.
fit(SUDDEN, 1056, 10_000).save(BRAND / "sudden-death.webp", quality=90, method=6)

PRIMARY.resize((1280, round(PRIMARY.height * 1280 / PRIMARY.width)), Image.LANCZOS).save(BRAND / "logo.webp", quality=92, method=6)


def midfield():
    """The primary as paint on grass: the black rim and glow aren't paint, so darkness drains to clear."""
    r, g, b, a = PRIMARY.split()
    ink = ImageChops.lighter(ImageChops.lighter(r, g), b).point(lambda v: max(0, min(255, (v - 60) * 3)))
    return Image.merge("RGBA", (r, g, b, ImageChops.multiply(a, ink)))


# The field shows it up to 56rem wide, but faded and scuffed; 720px keeps it near 170KB.
fit(midfield(), 720, 10_000).save(BRAND / "midfield.webp", quality=70, method=6)

lockup = lockup_horizontal()
lockup.save(LOGOS / "lockup-horizontal.png", optimize=True)
# The app header shows it about 44px tall; 3x for phones.
fit(lockup, 10_000, 132).save(BRAND / "lockup-horizontal.webp", quality=92, method=6)

# The footer shows the goalpost 24px tall.
fit(narrow_goalpost(), 10_000, 96).save(BRAND / "goalpost.webp", quality=92, method=6)
icon(1024).save(LOGOS / "icon-goalpost.png", optimize=True)
icon(180).save(BRAND / "apple-touch-icon.png", optimize=True)
icon(512).save(BRAND / "icon.png", optimize=True)
ico(BRAND / "favicon.ico", [16, 32, 48])

on_field((1200, 630), BOARD, (fit(PRIMARY, 1080, 560), 600, 315)).save(BRAND / "og.png", optimize=True)

# Email headers: 600x200 in the template, 2x here. Email clients don't load SVG.
on_field((1200, 400), BOARD, (fit(PRIMARY, 1100, 360), 600, 200)).save(BRAND / "email-header.png", optimize=True)
on_field(
    (1200, 400),
    NIGHT,
    (fit(PRIMARY, 440, 340), 290, 200),
    (fit(SUDDEN, 600, 330), 830, 200),
).save(BRAND / "email-header-sudden-death.png", optimize=True)
