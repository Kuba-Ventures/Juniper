#!/usr/bin/env python3
"""Turn an issuer's card render into a Juniper card face.

Produced the 15 images in artifacts/juniper/public/card-art/ that migration 0037
points at. Kept so stage B (the three Chase Freedom cards) and any card added
later go through exactly the same pipeline rather than a hand pass nobody can
reproduce.

    python3 scripts/card-art.py <product-id> <source-url> [--no-name-strip]

Steps, in order, and why each one is here:

  trim         Several issuers ship the render with white matting and a drop
               shadow baked in. Left alone that floats a small card inside the
               face instead of filling it.
  cover-fit    to 472x298, twice the 236x149 .cr-face-lg. The face draws with
               object-fit: cover, so anything off-ratio is centre-cropped; every
               issuer render lands within a hair of 1.586 once trimmed, so this
               takes essentially nothing off the edges.
  name-strip   Most issuer renders carry an embossed PLACEHOLDER cardholder name
               -- "D. BARRETT", "LEE M CARDHOLDER", "LINDA WALKER". It is legible
               at 236px and would put a stranger's name on a member's own card.
               The band is found by row edge-energy rather than hardcoded, since
               it moves once the margin is trimmed. A horizontal median is used
               rather than interpolating between the rows above and below: the
               median is wide enough to swallow the glyph strokes and still
               reproduces a smooth gradient, where interpolation streaks badly on
               any background with diagonal structure (Chase, Wells Fargo).
  webp q88     ~16 KB per card against ~150 KB for the equivalent PNG.

Not handled: Chase's promotional corner ribbon. See docs/card-art-fill-in.sql.
"""
import sys, urllib.request
from io import BytesIO
import numpy as np
from PIL import Image

UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126.0"
TW, TH = 472, 298
OUT = "artifacts/juniper/public/card-art"


def trim(im):
    a = np.array(im.convert("RGBA"))
    alpha = a[..., 3]
    mask = alpha > 200 if alpha.min() < 250 else (a[..., :3].astype(int).sum(2) < 720)
    ys, xs = np.where(mask)
    if len(ys) == 0:
        return im.convert("RGBA")
    return im.convert("RGBA").crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))


def cover(im):
    s = max(TW / im.width, TH / im.height)
    im2 = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
    l, t = (im2.width - TW) // 2, (im2.height - TH) // 2
    bg = Image.new("RGBA", (TW, TH), (255, 255, 255, 255))
    bg.alpha_composite(im2.crop((l, t, l + TW, t + TH)))
    return bg.convert("RGB")


def name_band(a, y0f=0.66, x1f=0.60):
    """Rows in the lower-left with far more horizontal edge energy than the
    background around them. That is the embossed name and nothing else."""
    h, w, _ = a.shape
    y0, x1 = int(y0f * h), int(x1f * w)
    hf = np.abs(np.diff(a[y0:, :x1, :].mean(2), axis=1)).mean(1)
    rows = np.where(hf > np.median(hf) * 2.2 + 0.6)[0]
    if len(rows) == 0:
        return None
    return max(y0 + rows.min() - 3, 1), min(y0 + rows.max() + 4, h - 1), 0, x1


def strip_name(a, k=51):
    box = name_band(a)
    if box is None:
        return a, False
    y0, y1, x0, x1 = box
    out, pad = a.copy(), k // 2
    win = np.lib.stride_tricks.sliding_window_view(
        np.pad(a[y0:y1, :, :], ((0, 0), (pad, pad), (0, 0)), mode="edge"), k, axis=1)
    out[y0:y1, x0:x1, :] = np.median(win, axis=-1)[:, x0:x1, :]
    return out, True


def main():
    args = [x for x in sys.argv[1:] if not x.startswith("--")]
    if len(args) != 2:
        sys.exit(__doc__)
    cid, url = args
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    im = Image.open(BytesIO(urllib.request.urlopen(req, timeout=30).read()))
    src = trim(im)
    a = np.array(cover(src)).astype(float)
    stripped = False
    if "--no-name-strip" not in sys.argv:
        a, stripped = strip_name(a)
    path = f"{OUT}/{cid}.webp"
    Image.fromarray(a.astype("uint8")).save(path, "WEBP", quality=88, method=6)
    print(f"{path}  source {src.width}x{src.height} ratio {src.width/src.height:.3f}"
          f"  name-strip {'yes' if stripped else 'no band found'}")
    print("Now add the row to a migration. art_license must record the source URL,"
          " the date, what was changed, and that there is no licence behind it.")


if __name__ == "__main__":
    main()
