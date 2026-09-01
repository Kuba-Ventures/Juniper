#!/usr/bin/env python3
"""Turn an issuer's card render into a Juniper card face.

Produced the 18 images in artifacts/juniper/public/card-art/ that migrations 0037
and 0038 point at. Kept so any card added later goes through the same pipeline
rather than a hand pass nobody can reproduce.

    python3 scripts/card-art.py --all          # regenerate every face from the manifest\n    python3 scripts/card-art.py <product-id> <source-url> [--ribbon] [--ribbon-left] [--ribbon-teal] [--keep-name]

Steps, in order, and why each one is here:

  ribbon       (--ribbon only) Chase bakes a promotional "NO ANNUAL FEE!" ribbon
               into the corner of every Freedom render and publishes no variant
               without it. It is a time-limited marketing claim drawn as though
               it were part of the card, so it would go stale on the surface
               without anything in Juniper knowing. Keyed on colour AND
               intersected with the upper-right corner triangle: the ribbon
               shares its yellow-green with the word UNLIMITED, so a colour key
               on its own erases the product name too. The corner clause is what
               lets the colour threshold be loose enough to catch the ribbon's
               antialiased edge, which a tighter one leaves as a green fringe.
  trim         Several issuers ship the render with white matting and a drop
               shadow baked in. Left alone that floats a small card inside the
               face instead of filling it. With --ribbon the bounds are measured
               from the height only and the width reconstructed at the true card
               ratio, because the ribbon juts PAST the card edge and trimming to
               the opaque bounds measures the ribbon (ratio 1.519, not 1.586).
  cover-fit    to 472x298, twice the 236x149 .cr-face-lg. The face draws with
               object-fit: cover, so anything off-ratio is centre-cropped.
  name-strip   Most issuer renders carry an embossed PLACEHOLDER cardholder name
               -- "D. BARRETT", "LEE M CARDHOLDER", "LINDA WALKER". It is legible
               at 236px and would put a stranger's name on a member's own card.
               The band is found by row edge-energy rather than hardcoded, since
               it moves once the margin is trimmed. A horizontal median is used
               rather than interpolating between the rows above and below: the
               median swallows the glyph strokes and still reproduces a smooth
               gradient, where interpolation streaks badly on any background with
               diagonal structure (Chase, Wells Fargo).
  webp q88     ~16 KB per card against ~150 KB for the equivalent PNG.

Whatever you add, the migration's art_license must record the source URL, the
date, what was changed, and the fact that there is no licence behind it.
"""
import ssl, subprocess, sys, urllib.request
from io import BytesIO
import numpy as np
from PIL import Image, ImageFilter

UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126.0"
TW, TH, RATIO = 472, 298, 1.586
OUT = "artifacts/juniper/public/card-art"


def fetch(url):
    """python.org builds on macOS ship without a CA bundle, so a plain urlopen
    dies on every issuer CDN with CERTIFICATE_VERIFY_FAILED. Use certifi when it
    is importable and fall back to curl, which carries its own trust store."""
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    try:
        import certifi
        ctx = ssl.create_default_context(cafile=certifi.where())
        return urllib.request.urlopen(req, timeout=30, context=ctx).read()
    except Exception:
        pass
    try:
        return urllib.request.urlopen(req, timeout=30).read()
    except Exception:
        return subprocess.run(["curl", "-sL", "--max-time", "30", "-A", UA, url],
                              check=True, capture_output=True).stdout


def ribbon_mask(a, side="right", hue="warm"):
    """Chase's promotional corner ribbon.

    Keyed on colour AND a tight corner triangle. Both SIDE and HUE are flags, and
    the reason is that every attempt to infer either one failed in a way the
    output did not admit to:

      * Inferring the side from which corner held more saturated colour chose
        wrong on both Amazon cards -- one ribbon survived untouched, the other
        took a quarter of the card with it.
      * Inferring the hue by sampling the extreme corner picked up the silver card
        body on the Amazon Visa (median 201,201,201) and the navy body on the
        Freedom line, so the mask matched the card instead of the ribbon.

    What the lineup actually uses: yellow-green on the Freedom and Slate cards,
    orange on the Prime Visa, teal on the Amazon Visa. The `warm` key -- green or
    red dominant over blue -- catches the first two and is also precisely what
    protects the navy Freedom bodies and the cyan Freedom Flex, which a
    saturation-only key erases. Teal is blue-dominant, so it needs its own key,
    and that key is only safe on a card whose body is NOT a saturated blue. The
    Amazon Visa's body is silver, which is why it is safe there and why this is a
    flag rather than a default.

    If a future card needs a hue that is not here, add it as another explicit
    value. Do not make this clever.
    """
    h, w, _ = a.shape
    r, g, b = a[..., 0].astype(float), a[..., 1].astype(float), a[..., 2].astype(float)
    mx, mn = np.maximum(np.maximum(r, g), b), np.minimum(np.minimum(r, g), b)
    sat = (mx - mn) / np.maximum(mx, 1.0)
    if hue == "teal":
        cast = (b > r * 1.25) & (g > r * 1.25)
    else:
        cast = (g > b * 1.12) | (r > b * 1.12)
    colour = (sat > 0.30) & (mx > 70) & cast
    yy, xx = np.mgrid[0:h, 0:w]
    u = xx / w if side == "left" else 1.0 - xx / w
    corner = (u + yy / h) < 0.62
    m = colour & corner
    # Dilated generously: the antialiased edge is what a tighter pass leaves as a
    # fringe, and the hole is filled by the inpaint either way.
    return np.array(Image.fromarray((m * 255).astype("uint8"))
                    .filter(ImageFilter.MaxFilter(17))) > 127


def inpaint(a, hole, iters=260):
    """Seed each hole row from the nearest valid pixel to its left, then diffuse."""
    out = a.copy().astype(float)
    for c in range(3):
        ch = out[..., c].copy(); ch[hole] = np.nan
        idx = np.where(~np.isnan(ch), np.arange(ch.shape[1])[None, :], 0)
        np.maximum.accumulate(idx, axis=1, out=idx)
        seed = ch[np.arange(ch.shape[0])[:, None], idx]
        ch[np.isnan(ch)] = seed[np.isnan(ch)]
        out[..., c] = np.nan_to_num(ch, nan=float(np.nanmean(ch)))
    for _ in range(iters):
        blur = np.stack([np.array(Image.fromarray(out[..., c].astype("uint8"))
                .filter(ImageFilter.GaussianBlur(2.0))) for c in range(3)], -1).astype(float)
        out[hole] = blur[hole]
    return out


def bounds(a, rib):
    """Card box. With a ribbon punched out, height and left edge stay honest and
    the width is reconstructed from them."""
    ax = a.copy()
    if rib is not None:
        ax[..., 3][rib & (a[..., 3] > 40)] = 0
    alpha = ax[..., 3]
    m = alpha > 200 if alpha.min() < 250 else (ax[..., :3].astype(int).sum(2) < 720)
    ys, xs = np.where(m)
    x0, y0, y1 = xs.min(), ys.min(), ys.max() + 1
    if rib is None:
        return x0, y0, xs.max() + 1, y1
    return x0, y0, min(int(round(x0 + (y1 - y0) * RATIO)), a.shape[1]), y1


def strip_name(a, k=121, y0f=.62, x1f=.60):
    """Erase the issuer's embossed PLACEHOLDER cardholder name.

    The band is found by row edge-energy rather than hardcoded, because it moves
    once the margin is trimmed. Its FULL extent is taken, not the first run of
    rows: several cards emboss two lines ("D. BARRETT" over "BARRETT CONNECT")
    and covering only one leaves the other.

    A horizontal median rather than an interpolation between the rows above and
    below: interpolation streaks badly on any background with diagonal structure.
    The window is wide (121px at 472) because a narrow one centred inside a dense
    glyph run returns a glyph pixel -- which on a dark card is a bright smear
    exactly where the name was, the failure this width is chosen to avoid.
    """
    h, w, _ = a.shape
    y0, x1 = int(y0f * h), int(x1f * w)
    hf = np.abs(np.diff(a[y0:, :x1, :].mean(2), axis=1)).mean(1)
    rows = np.where(hf > np.median(hf) * 1.9 + 0.5)[0]
    if len(rows) == 0:
        return a, False
    ya, yb = max(y0 + rows.min() - 4, 1), min(y0 + rows.max() + 5, h - 1)
    out, pad = a.copy(), k // 2
    win = np.lib.stride_tricks.sliding_window_view(
        np.pad(a[ya:yb, :, :], ((0, 0), (pad, pad), (0, 0)), mode="edge"), k, axis=1)
    out[ya:yb, :x1, :] = np.median(win, axis=-1)[:, :x1, :]
    return out, True


SOURCES = "scripts/card-art-sources.tsv"


def run_all():
    """Regenerate every face from card-art-sources.tsv.

    This exists because driving the loop from the shell is a trap. The flags
    column can hold more than one flag, and zsh -- the shell this repo is
    developed in -- does NOT word-split an unquoted parameter the way bash does,
    so `python3 card-art.py "$id" "$url" $flags` passed
    "--ribbon-left --ribbon-teal" as ONE argument. It matched neither flag, the
    script fell back to its defaults, and the only symptom was a ribbon quietly
    surviving on one card out of twenty-nine. Reading the manifest here means the
    flags are parsed once, by the thing that defines them.
    """
    rows = []
    for line in open(SOURCES, encoding="utf-8"):
        if line.startswith("#") or not line.strip():
            continue
        parts = line.rstrip("\n").split("\t")
        rows.append((parts[0], parts[1], (parts[2] if len(parts) > 2 else "").split()))
    for cid, url, flags in rows:
        print(process(cid, url, flags))
    print(f"{len(rows)} faces regenerated")


def main():
    if "--all" in sys.argv:
        return run_all()
    args = [x for x in sys.argv[1:] if not x.startswith("--")]
    if len(args) != 2:
        sys.exit(__doc__)
    cid, url = args
    print(process(cid, url, [x for x in sys.argv[1:] if x.startswith("--")]))
    print("Now add the row to a migration. art_license must record the source URL,"
          " the date, what was changed, and that there is no licence behind it.")


def process(cid, url, flags):
    a = np.array(Image.open(BytesIO(fetch(url))).convert("RGBA")).astype(float)

    has_ribbon = any(f.startswith("--ribbon") for f in flags)
    side = "left" if "--ribbon-left" in flags else "right"
    hue = "teal" if "--ribbon-teal" in flags else "warm"
    rib = ribbon_mask(a, side, hue) if has_ribbon else None
    x0, y0, x1, y1 = bounds(a, rib)
    rgb = a[y0:y1, x0:x1, :3]
    hole = (a[y0:y1, x0:x1, 3] <= 40)
    if rib is not None:
        hole = hole | rib[y0:y1, x0:x1]
    card = Image.fromarray((inpaint(rgb, hole) if hole.any() else rgb).astype("uint8"))

    s = max(TW / card.width, TH / card.height)
    c2 = card.resize((round(card.width * s), round(card.height * s)), Image.LANCZOS)
    l, t = (c2.width - TW) // 2, (c2.height - TH) // 2
    arr = np.array(c2.crop((l, t, l + TW, t + TH))).astype(float)

    stripped = False
    if "--keep-name" not in flags:
        arr, stripped = strip_name(arr)

    path = f"{OUT}/{cid}.webp"
    Image.fromarray(arr.astype("uint8")).save(path, "WEBP", quality=88, method=6)
    return (f"{cid:32} {x1-x0}x{y1-y0} ratio {(x1-x0)/(y1-y0):.3f}"
            f"  ribbon {'-' if rib is None else f'{side}/{hue}'}"
            f"  inpainted {int(hole.sum()):6d}px"
            f"  name-strip {'yes' if stripped else 'none found'}")


if __name__ == "__main__":
    main()
