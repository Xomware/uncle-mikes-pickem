"""Every raster brand asset, cut from the pixels of logo-primary.png. Nothing is redrawn.
Run: uv run --with pillow python scripts/brand/derive.py
"""

from pathlib import Path

from PIL import Image

BRAND = Path(__file__).resolve().parents[2] / "frontend/public/brand"
LOGOS = BRAND / "logos"
PRIMARY = Image.open(LOGOS / "logo-primary.png").convert("RGBA")
SUDDEN = Image.open(LOGOS / "sudden-death.png").convert("RGBA")

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


PRIMARY.resize((1280, round(PRIMARY.height * 1280 / PRIMARY.width)), Image.LANCZOS).save(BRAND / "logo.webp", quality=92, method=6)

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
