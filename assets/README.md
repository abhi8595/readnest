# App assets (production set)

Brand: **"Espresso & Brass"** — golden bird rising from an open book on deep
espresso. The master icon was art-directed and selected in review; everything
below is generated from it deterministically.

| File | Size | Used by |
|---|---|---|
| `icon-master.png` | 1254×1254 | Master. Never ship directly; regenerate from this |
| `icon.png` | 1024×1024 | iOS icon + Android legacy (`app.json`) |
| `adaptive-icon.png` | 1024×1024 | Android adaptive foreground, full-bleed, emblem inside the 66dp safe zone (verified under circle mask) |
| `splash.png` | 1284×2778 | Light splash: paper gradient, icon + shadow, serif wordmark, brass rule, letterspaced tagline |
| `splash-dark.png` | 1284×2778 | Dark splash: espresso gradient with warm halo, same lockup |
| `favicon.png` | 48×48 | Web favicon, sharpened for legibility |

## Regenerating

```bash
python3 assets/build_assets.py   # requires Pillow
```

The script (`build_assets.py`) rebuilds all five outputs from `icon-master.png`:
LANCZOS resampling, feathered safe-zone adaptive composite, gradient + glow +
shadow + letterspaced-type splash lockups. Re-run after any master change.

`archive/` keeps the original hand-drawn SVG explorations for reference only —
they are **not** used by any build.
