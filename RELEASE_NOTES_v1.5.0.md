# Rakuten Combine Batch Standalone v1.5.0 - Slider Maker Layout-Aware Line Up Classifier

**Project scope:** `Rakuten_Combine_Batch_Standalone` v1.4.0 -> v1.5.0. This is NOT `Rakuten_Converter_Electron_v2` and NOT BrandForge.

## Improvements

- Recognizes Slider Maker-style **horizontal 2-cut**, **vertical 2-cut**, and **4-cut/2x2** layouts in ORIGINAL source JPEG/PNG/WebP images. It detects both light blank gutters and straight cut seams in full-bleed photos. The image analyzer uses temporary low-resolution image pixels in memory, not a downloaded output folder.
- Keeps Japanese and English OCR color captions from v1.4.0. When a source image has multiple cut tiles and whole-image OCR misses some color captions, tries OCR on the bottom area of individual tiles. Supports separate names in each cut and names like `Yellow x Black` as one combined color caption.
- Detects a confirmed Line Up that begins after **one or two unlabeled leading creative/intro images**, instead of assuming Line Up always starts at image 1.
- Preserves a detected leading creative image **above** the Line Up at full available width in both the 600px JPEG and 780px HTML, maintaining source order. The 2-column Line Up and subsequent DETAILS remain unchanged.
- The DETAILS heading is still rendered only when Details images exist, at 28px, preferred font `Hiragino Kaku Gothic Pro W3` (with fallback where not installed).
- The original `LINEUP COUNT` Excel override is retained: when entered, it preserves legacy behavior by applying the count from the start of the source sequence and takes priority over auto-detection. In the automatically detected creative-prefix case, `introCount` is separately reported in `BATCH_REPORT.json`.
- If layout evidence exists **without genuine color captions**, it is not sufficient to promote images to Line Up. A four-panel material/features graphic stays Details. OCR, layout and sequence together are required. Uncertain boundaries and creative prefix decisions are flagged REVIEW.
- Source images are not altered or saved as separate output images. URL-based output HTML and Combine JPG generation remain in place; no Python runtime required.

## Source files changed

- `src/core/lineupLayout.js` **new**: whitespace gutter + full-bleed cut seam analysis and 2/4 panel recognition.
- `src/core/imageOcr.js`: source-image layout analysis and optional per-tile color-caption OCR.
- `src/core/variationClassifier.js`: layout-aware sequence, up to two creative-prefix images, conservative confidence logic.
- `src/core/iframeHtml.js`: optional full-width creative section before confirmed Line Up.
- `src/core/iframeJpegLayout.js`: creative image section before Line Up, matching source order.
- `src/core/batch.js`: expected image count and reported creative counts, version metadata.
- `src/renderer/index.html`: updated version and on-screen descriptions.
- `test/lineup-layout.test.js` **new**: horizontal, vertical, 4-cut, full-bleed, creative prefix and false-positive tests.
- `README.md`, `package.json`, `docs/SLIDER_MAKER_LINEUP_DETECTION.md`: updated documentation/build information.

## Validation

- `npm run validate`: 51/51 Node tests passed, including all 39 tests carried over from v1.4.0.
- New synthetic tests verify source cut shapes, captions, creative order, 4-cut single-source images, in-memory tile OCR retries, and Details with feature text.
- These are OFFLINE automated tests; they do not prove Japanese/English OCR quality on the live Rakuten source photos, or the Windows Electron portable build. **Test ABY-70, ABY-71, and ADI-8 on Windows before using output for publishing.**

## Build / installation

Requires Node + npm on a build PC. Run `npm install`, `npm run validate`, and `npm run build:portable` (or `BUILD_PORTABLE.cmd`) to create `dist/Rakuten_Combine_Batch_1.5.0_Portable.exe`. No compiled Windows EXE is included in this ZIP. End users can run the resulting portable EXE without installing Node.
