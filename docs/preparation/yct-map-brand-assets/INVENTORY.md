# YCT Map Branding Asset Inventory — Staged Candidates

**Date:** 2026-11-07
**Purpose:** Prepare candidate visual assets for possible YCT Alert use without integrating them.
**Status:** **Staging only. Owner review required before any runtime use.**

---

## 1. Scope and method

- Source repository inspected read-only: `C:\Users\HP\Downloads\YCT_MAP_Repo`.
- Suitable candidate files were **copied** (not moved, renamed, or edited) into this folder.
- Original files in YCT Map remain untouched.
- No build outputs, user data, secrets, dependency folders or unrelated data were copied.
- Dimensions and hashes were measured locally from the copied files.

> These assets belong to the YCT Map visual identity. Reusing them for YCT Alert could imply shared ownership or official endorsement. Treat every item below as **reference material pending owner approval**, not as an approved YCT Alert brand kit.

---

## 2. Staged assets

| # | Original source path | Copied destination path | Format | Dimensions | Size | SHA-256 | Suggested use | Licensing / attribution uncertainty |
|---|---|---|---|---|---|---|---|---|
| 1 | `static/yct_map/images/yct-map-logo.png` | `docs/preparation/yct-map-brand-assets/yct-map-logo.png` | PNG (RGBA, transparent background) | 1447 × 1087 px | 716,113 bytes | `DAE28A24B89D0BC86E0F1234185C5342E29A4ACA090300E930D61F4CAC188A8A` | Visual reference for the green/yellow campus-navigation identity; possible "related project" credit on an About/acknowledgements page **only after owner approval** | **Unknown.** No license, author, or attribution statement exists in the repository. Looks owner-commissioned. Do not present as YCT Alert's own logo. |
| 2 | `static/yct_map/favicon.svg` | `docs/preparation/yct-map-brand-assets/favicon.svg` | SVG | 64 × 64 viewBox (vector) | 195 bytes | `5557E9EBBA40CD4C9F52D70142C20BD9CAECDA6F8DCD2A4D2C0ABEC7B9EED7D9` | Tiny "Y" mark reference for favicon/app-icon exploration | **Unknown.** No license or author recorded. It reads as a YCT Map-specific monogram; using it for YCT Alert risks brand confusion. |

Both copied files match their originals byte-for-byte (SHA-256 verified).

### Visual description

- **`yct-map-logo.png`** — a green-to-yellow "YCT Map" wordmark with a map-pin and route-node motif on a transparent background. Primary colours are deep green and gold/yellow.
- **`favicon.svg`** — a rounded green square (`#17663c`) containing a white geometric "Y".

---

## 3. Assets identified but deliberately **not** staged

| Asset | Source path | Reason not staged |
|---|---|---|
| Personal designer signature | `static/yct_map/images/daveolana-signature.png` | Personal attribution mark (1254 × 1254 PNG). Using it would imply a designer relationship/endorsement for YCT Alert. No written permission or license in the repository. |
| Duplicate logo copy | `YCT map new logo.png` (repo root) | Byte-identical duplicate of `yct-map-logo.png`; redundant. |
| Duplicate logo copy | `About Us process/DaveOlana_Blue_Black_Luxury_Logo.png` | Byte-identical duplicate of the personal signature asset. |
| Campus boundary GeoJSON | `static/yct_map/data/yabatech-campus-boundary.geojson` | Geographic data, not branding. OSM-derived and subject to ODbL attribution rules; out of scope for a visual asset staging folder. |
| Inline UI icons | `templates/map/*.html`, `static/yct_map/js/map.js` | Generic inline stroke SVGs (search, location, arrows, etc.), not standalone files. No icon-library license is recorded. |
| CSS design tokens | `static/yct_map/css/app.css` | Not an asset file. Palette is documented in §4 for reference. |
| MapLibre / OpenFreeMap assets | External URLs in `locations/views.py` | Third-party runtime resources with their own licenses; not copied. |

---

## 4. Branding observations relevant to YCT Alert

### Colour palette (verified in `static/yct_map/css/app.css`)

| Token | Value | Use in YCT Map |
|---|---|---|
| `--green-950` | `#0d2c20` | Deep headings |
| `--green-800` | `#174b32` | Brand surfaces |
| `--green-700` | `#17663c` | Primary brand green |
| `--green-100` | `#dcecdf` | Soft green fills |
| `--yellow-500` | `#e2b431` | Accent / warning |
| `--paper` | `#f4f4ec` | Page background |
| `--ink` | `#14221b` | Primary text |
| `--muted` | `#66736c` | Secondary text |
| `--line` | `rgba(20, 34, 27, 0.12)` | Dividers |

**Notable:** YCT Alert's current S1 public app already uses the same core hex values (`#f4f4ec`, `#14221b`, `#174b32`, `#0d2c20`, `#dcecdf`) in `apps/public/src/App.tsx`. Visual continuity appears intentional but is not documented as an approved decision.

### Typography

- CSS declares `font-family: Inter, ui-sans-serif, system-ui, ...`.
- **No font files are shipped** and **no font license/attribution file exists**.
- Inter is commonly distributed under the SIL Open Font License, but this repository neither bundles nor declares it. Treat the font choice as a **reference**, not a licensed asset transfer.
- YCT Alert currently relies on Tailwind's default system font stack; no custom font is configured.

### Wordmarks / illustrations / backgrounds

- One wordmark/logo pair (above).
- No separate illustration set.
- No background images.
- No official YabaTech institutional logo, crest, or approved institutional wordmark exists in the repository. **Do not invent or approximate one.**

---

## 5. Recommended use policy (proposal, not approval)

1. Do **not** copy these files into `apps/*/src`, `public/`, Android resources, or any runtime directory.
2. Do **not** use the YCT Map logo as the YCT Alert product logo.
3. If visual continuity is desired, reuse **colour tokens** rather than the YCT Map mark.
4. If a "Built alongside YCT Map" credit is wanted, use text plus an owner-approved asset and a written attribution line.
5. Obtain the owner's written confirmation of ownership/licence before any public use.
6. Record the final approved asset and its attribution in this folder, not in the runtime tree.

---

## 6. Owner questions

1. Who owns the YCT Map logo and favicon, and under what terms may YCT Alert display them?
2. Should YCT Alert adopt the same green/yellow palette formally?
3. Should YCT Alert use the Inter typeface? If yes, which licensed source/version?
4. Is a "related project" acknowledgement desired, and in what wording?
5. Should the personal designer signature ever be used outside YCT Map? (Default recommendation: no.)
