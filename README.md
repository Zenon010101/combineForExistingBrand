# Rakuten Combine Batch Standalone v2.0.4

Two separate processes in ONE Electron app. **This is Rakuten_Combine_Batch_Standalone, NOT BrandForge and NOT Rakuten Converter Electron v2.** The original BrandForge application is unchanged.

## 1. Existing Brand (automatic; no Line Up classification)

1. Choose or drop a `.xlsx` workbook, then select **Test 3 products** before a full run. Selecting a file no longer automatically processes thousands of products. The original rak1 format is **C = Rakuten iframe, D = OUTPUT HTML, E = Single image URL/path**. Other detected IFRAME template layouts remain supported.
2. The app extracts the images in their original Rakuten iframe order. There is **no OCR, no color detection, no Line Up/Details split, and no generated DETAILS heading**. The original image text is never removed.
3. The optional Single is **full bleed** (touches the top, left and right edges with NO padding, no frame, and no cropping). It is rendered to the full width (780px HTML / 600px JPEG) while preserving aspect ratio even when non-square. Then there is a **15px gap** before the gallery. Every gallery row has **two fixed image columns**, positioned left-to-right and top-to-bottom. The odd final image stays in the left column. No gallery image becomes a full-width row.
4. Images are proportionally fitted only to the standard column (293px JPEG / 386px HTML) when larger; smaller images are not enlarged. No independent X/Y stretching, cropping, distortion, or blank image placeholders.
5. The JPEG is 600px wide; **the Single has zero outer margins**. The gallery alone has 3px outer side margins, 8px horizontal spacing, and 7px vertical spacing, with a dynamic height. The HTML uses a fixed 780px two-column TABLE instead of CSS flex wrapping. **Verify acceptance in the destination Rakuten editor before publishing.**
6. **Filename from Excel column E Single URL**: `https://item-shopping.c.yimg.jp/i/n/glv_abu-90` gives `HTML_FILES/abu-90.html` and `JPEG_FILES/abu-90combine.jpg` (no prefix, sheet number, hash, or row number). For non-Yahoo/local/blank Singles, use the Rakuten iframe HTML basename as a fallback. Duplicate IDs are marked FAILED rather than overwriting each other. Full batches save to a new timestamped `COMBINE_BATCH_*` folder beside Excel; sample runs save to `COMBINE_TEST3_*`. Both include `*_COMBINE_RESULTS.xlsx` and `BATCH_REPORT.json`.

**Note:** Source order is authoritative. If the source has Details before Line Up, they remain in that order; the app does not guess or move the photos. The JPEG is now composed directly from downloaded image pixels with Sharp, avoiding the broken Chromium/CSS geometry validation that caused all JPEGs to fail in v2.0.2. Images are downloaded temporarily into memory; no extra image files are saved. You can reorder the original HTML's images beforehand.

## 2. New Brand (manual; JPEG + HTML guaranteed independently of Photoshop)

1. Click **New Brand**. Upload optional **Single**, ordered **Line Up**, and **Details**. Reorder images by drag/drop or the arrow buttons. You can browse or drop any file; only image formats that Sharp can decode (or PSD/PSB through Photoshop) are accepted. Invalid/nonimage files are skipped and logged clearly. JPG, PNG, WEBP, TIFF, BMP, GIF, AVIF, HEIC, SVG and other codecs depend on local Sharp support; PSD/PSB source images require Photoshop on Windows.
2. The **original BrandForge Combine layout** is preserved: 600px canvas, optional 600px Single area followed by a 15px gap, Line Up in two 293px columns, 8px horizontal / 7px vertical gaps, 6px caption gap, 293px Details boxes, and optional DETAILS heading. Source images retain their order; no text removal/cropping of products.
3. Line Up captions are **Hiragino Kaku Gothic Pro W3, 28px**. Single-item images share a two-column row; LEFT/RIGHT paired images stay intact as one full-width row with two editable caption fields; TOP/BOTTOM pairs stay intact with position controls. Leave captions blank when already printed on the image. For exact font appearance, the Hiragino family must be installed locally: the app doesn't include or distribute font files, and the raster renderer falls back to a locally available Japanese font when absent.
4. Select Output Name and Output Folder, then click **Generate JPEG + HTML**. The app prepares the original images, composes JPEG(s) directly with Sharp, **publishes the JPEG(s), then writes a matching HTML file**, and reports their exact saved paths. It no longer waits for Photoshop to save the JPEG/HTML pair. A 600px JPG and a local HTML preview share the same filename stem: `SKU.jpg` and `SKU.html` (for a very tall Combine: `SKU_01.jpg`, `SKU_02.jpg`, ... plus `SKU.html`). The HTML links to relative JPEG filenames so open it beside the JPEGs; for Rakuten product HTML publishing, upload JPEGs to a public HTTPS image host and replace the relative `src` links with hosted URLs before use.
5. Optional: tick **Also export layered PSD/PSB** to run the original Photoshop JSX process *after* JPEG + HTML are safely published. Photoshop on Windows is required for that step. If the Photoshop step fails, the JPEG and HTML stay in the folder, and a dedicated PSD warning appears instead of a full-job failure.
6. **Folder memory** remembers separate Single, Line Up, Details and Output folders between app sessions. The file picker opens the last folder for that section, with **Clear folder memory** available to reset them without deleting images or generated outputs.
7. Generated filename versions are collision-safe (e.g., `SKU_v2.jpg`/`SKU_v2.html`); previous results and original images are never overwritten. Each JPEG is validated before its HTML is published.

**Scope:** New Brand HTML is an offline/local HTML preview and a template for hosted-image markup, not an automatic Rakuten image upload. New Brand Photoshop output still requires a live Windows/Photoshop acceptance test. Existing Brand Excel C/D/E parsing, iframe image order, and its standalone output rules are unchanged from v2.0.3.

## Start / Build on Windows

1. Extract the full project ZIP.
2. Run `START_DEV.cmd` to install dependencies (when necessary) and launch the Electron app with Node.js/npm installed. You may use a portable Node.js distribution without admin access.
3. Run `BUILD_PORTABLE.cmd` to validate and package the portable Windows EXE. The built `.exe` appears in `dist/`.
4. For New Brand, Photoshop is not needed for JPEG + HTML; open Photoshop only when selecting the optional PSD/PSB export.

Earlier v2.0.3 baseline passed 91/91 tests. For v2.0.4, the New Brand and non-Excel offline test subset passed **59/59**; the full suite requires installing the project dependencies on the build PC. The v2.0.3 tests verify an **actual synthetic 600px JPEG**, exact image positions/colors and spacing, a missing image error, the 3-product Excel sample, precise FAILED statuses, and the 5-consecutive-JPEG-failure stop rule. The renderer no longer takes Chromium screenshots. These are offline/source/mock tests; **live Rakuten/Yahoo image downloads, Windows portable EXE, Photoshop export and destination Rakuten HTML acceptance still require workstation QC**. The 940 `#VALUE!` iframe input rows in the user's log are a separate source-workbook issue; code cannot repair invalid Excel formulas.

### Existing Brand: safe run workflow

1. Open the app, choose or drop `rak1-normal-item.xlsx`, then click **Test 3 products**. The app selects the first 3 *valid* iframe rows, not the first 3 physical rows if some have `#VALUE!`.
2. Inspect `COMBINE_TEST3_*/HTML_FILES` and `COMBINE_TEST3_*/JPEG_FILES` beside the workbook. For the supplied workbook, expect `abu-90.html` / `abu-90combine.jpg`, `aby-70.html` / `aby-70combine.jpg`, and `aby-71.html` / `aby-71combine.jpg` when source images are reachable.
3. Confirm the Single hugs the top and both sides; the gallery has two 293px columns, 8px/7px gaps and source-order images. There must be no generated `DETAILS` heading.
4. Click **Generate full batch** only after the 3 JPEGs look correct. If 5 consecutive JPEG attempts fail, the full run stops automatically, saves partial results, and records the cause in `BATCH_REPORT.json`. Broken JPEGs are marked **FAILED**, not just REVIEW; HTML from affected products remains for inspection.
5. HTTP 403, timed out images, missing source URLs and invalid Single images are reported specifically. HTML can still be generated when JPEG fetching fails, but that row cannot be marked READY until JPEG succeeds.

## Technical structure

- `src/core/existingBrand.js`: Existing Brand full-bleed Single, source-order two-column HTML table and fixed 600px JPEG grid.
- `src/core/outputNaming.js`: derives safe item IDs from the final Yahoo Single URL component, with iframe basename fallback; outputs `ID.html` and `IDcombine.jpg`.
- `src/core/batch.js`: Excel batch bypasses classifier/OCR, supports Test 3 and a 5-failure automatic stop, and flags JPEG failure as FAILED.
- `src/core/imageDownload.js`: allowlisted HTTPS image download for the original Rakuten gallery and Yahoo Single URL.
- `src/core/directJpegRenderer.js`: Sharp pixel compositor with exact 600px, fixed 293px columns, no upscaling of smaller gallery images, and verified JPEG output. This **replaces Chromium screenshot export for Existing Brand**.
- `src/manual/planner.js`: extracted and adapted BrandForge 600px Combine planner (optional text, no upscale).
- `src/manual/photoshop.js`, `src/manual/jsx/compose.jsx`: BrandForge-style embedded Smart Objects and layered Photoshop export.
- `src/manual/service.js`: manual import, validation, output protection/versioning.
- `src/renderer/newbrand.js`: two-mode workflow, uploads, text inputs, reorder, QC preview.
- `test/two-mode.test.js`: new regression checks.

The old classifier/OCR modules remain as archival code and are **not called by Existing Brand batch processing**. Old v1.0-v2.0.0 release notes are retained for historical reference; v2.0.1 supersedes the Existing Brand flex-wrap renderer.

See `RELEASE_NOTES_v2.0.3.md`, `docs/ARCHITECTURE.md`, and `docs/TWO_MODE_ACCEPTANCE.md`.
