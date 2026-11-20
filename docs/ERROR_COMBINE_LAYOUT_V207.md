# v2.0.7 — PASSED / ERRORS have the same Combine layout

## Non-negotiable layout contract

- Source is the single, already validated sequence of gallery images after broken URLs have been excluded. **Both HTML and JPEG use precisely this same sequence**.
- Single (when decoded): full width at top (600px in JPEG / 780px in HTML). Exactly 15px gap **only when gallery images follow**.
- All remaining images use **two columns**, left-to-right, top-to-bottom, retaining their original source order. Missing/broken Detail images are skipped, and subsequent valid images shift up to fill the slots. An odd final Detail stays in the left column.
- JPEG: 600px wide; 293px gallery tiles, 3px left/right margins, 8px column gap, 7px row gap. Product images are fitted proportionally, not stretched or cropped.
- HTML: 780px wide fixed two-column `<table>`; no `DETAILS` heading and no classification.
- Failing Single but valid gallery: gallery starts at top in two columns. Valid Single but failing iframe: Single-only JPEG and HTML. If all images fail, nothing is fabricated; errors Excel records the failure.
- JPEG height over 3800px: preserve the **complete Combine**; route it to ERRORS and mark `HEIGHT_OVER_3800`, never crop.
- Folder routing is a QC decision **after composition**, not a separate render mode. READY files move to PASSED; REVIEW/FAILED usable files remain in ERRORS.

## Local Single exception

A local Single file can be included in both JPEG and **a local review HTML file** using a bounded `data:image/jpeg` URI. Rakuten storefronts cannot rely on that inline data; the Excel OUTPUT cell is blank, and `SINGLE_HTML_MISSING` stays in the errors workbook with an explicit upload/public-link instruction. Single-only HTML has no empty gallery or trailing Single gap. Remote Single URLs continue to produce standard publishable Rakuten HTML.

## Regression tests (actual JPEG pixels)

`test/error-combine-layout-v207.test.js` uses synthesized colors and inspected pixels to verify that the exact same compositor places valid images in PASSED and ERRORS. It checks Single full-bleed, reflow of broken Details, broken-Single two-column layout, odd last image, and local Single-only review HTML. Existing QC tests cover over-3800px output preservation and errors-only report links.

## Files and reporting

- `PASSED/JPEG_FILES/{id}combine.jpg` + `PASSED/HTML_FILES/{id}.html`
- `ERRORS/JPEG_FILES/{id}combine.jpg` + `ERRORS/HTML_FILES/{id}.html` when usable images remain
- `ERRORS/COMBINE_ERRORS_ONLY.xlsx` (source iframe, Single link, broken Detail URLs, output links)
- `BATCH_REPORT.json` now includes `combineLayout`, gallery row count, and `htmlPreviewOnly` for each result.

Original workbook, original images, and existing two-column rules are preserved.
