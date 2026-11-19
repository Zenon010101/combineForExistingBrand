# Rakuten Combine Batch Standalone v1.4.0 — Embedded Color Caption Classifier

**Correct project:** upgrade from `Rakuten_Combine_Batch_Standalone_v1.3.0` only. The separate `Rakuten_Converter_Electron_v2` project is NOT part of this package.

## Updated

- Added local Japanese + English Tesseract.js OCR for **text embedded inside original Rakuten source images**, with bundled language models.
- Added isolated color-name parser for English/Japanese, combinations (`Yellow × Black`, `Ivory × Ice × Gold`), and numbered fashion colors (`997 VOLCAN`, Japanese Adidas colorways).
- Added section boundary detection requiring a sequence of several different short captions, not simply any text containing a color.
- Source `DETAILS` headings at the start of a page can now be overridden when verified OCR color variants occur before the detail photographs.
- Retained in-memory silhouette detection as fallback when OCR cannot establish the boundary; ambiguous cases are marked REVIEW.
- Preserved manual `LINEUP COUNT` override (including 0), original URLs, optional Single, generated 780px HTML/600px JPEG, Excel mapping, progress logs, portable build workflow and Clear button.
- DETAILS heading uses preferred `Hiragino Kaku Gothic Pro W3` family at 28px (falls back if font is not installed).

## Testing

- Legacy test suite: all 30 existing tests pass.
- Added 9 classifier/OCR tests including representative ABY-71 (9 colors), ABY-70 (4 mixed color sets), ADI-8 (14 Japanese colorways), details-heading-at-top, incidental-color detail text, missing OCR, and manual override.
- OCR results are **simulated captions** in tests; not proof of production accuracy on live Rakuten images. Run the three real product cases on Windows and inspect JPEG and report before publishing.

## Runtime / build

`npm install` → `npm run validate` → `npm run build:portable` on Windows with Node + npm. The output is an Electron portable EXE. No EXE is included in this source archive. Tesseract.js dependency is installed by npm; language models are bundled and read locally.
