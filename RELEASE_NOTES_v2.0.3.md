# Rakuten Combine Batch Standalone v2.0.3

## Fix for repeated `JPEG Existing Brand: two-column gallery did not render correctly`

The v2.0.2 JPEG generator used a hidden Electron/Chromium page. Its layout measurement rejected every JPEG in the provided run, leaving HTML files and generic REVIEW statuses. v2.0.3 **does not use Chromium for Existing Brand JPEG output**.

- Added `src/core/directJpegRenderer.js`: a direct Sharp image compositor for 600px JPEGs.
- Added `src/core/imageDownload.js`: bounded HTTPS image downloads from approved Rakuten and Yahoo Single hosts, transient in memory; no source images saved.
- Full-bleed Single at x=0, y=0, width=600 (maintain aspect ratio). Exactly 15px until the gallery. No outer margins on Single.
- Existing gallery always uses two fixed 293px image columns, with 8px horizontal spacing, 7px row spacing and 3px outer side margins. Odd image remains on left. No DETAILS text, no Line Up/Details classification, no text removal, no reordering.
- Each gallery image is proportionally resized **down only if wider than 293px**. Smaller images retain original size. No crop, stretch, or scaling to match a neighboring image. The Single is fitted to the full 600px canvas width.
- Sharp composes and verifies the final 600px JPEG before atomic publication. Download and decoding errors report the failing image number instead of the obsolete generic two-column geometry error.

## Safer Excel workflow

- Selecting or dropping an Excel file only selects it; it **does not immediately start a 7,758-row batch**.
- Added **Test 3 products**: runs the first three valid iframe rows, saves to `COMBINE_TEST3_YYYYMMDD_HHMMSS` beside the Excel file. Input columns C (iframe), D (HTML output), E (Single URL) stay mapped as before.
- Added **Generate full batch** for an explicit full run.
- Five consecutive JPEG failures automatically stop a full run; already-processed rows retain HTML/JPEG and the results Excel + JSON report is saved. In-flight rows finish; remaining rows become SKIPPED.
- A product with HTML but no JPEG is now `FAILED` with `JPEG STATUS=FAILED`, not the misleading generic REVIEW. Non-fatal source warnings can still trigger REVIEW.
- `BATCH_REPORT.json` now identifies `DIRECT_SHARP_TWO_COLUMN`, `processed`, `sourceTotal`, `testMode`, `autoStopped`, and `stoppedReason`.
- Yahoo `https://item-shopping.c.yimg.jp/i/n/glv_abu-90` still generates `abu-90.html` and `abu-90combine.jpg`, with no extra suffixes or row numbers.
- Existing Brand source iframe image sequence and existing HTML generator preserved. New Brand manual BrandForge Combine process unchanged.

## Validation

- **91/91 offline automated tests passed**, including four new direct image tests and four batch recovery tests.
- A real JPEG from generated synthetic product images was inspected: Single flush edge-to-edge; row-gap, column-gap, size preservation and odd-last-row placement confirmed.
- The provided production log confirms the former error; this fix removes that Chromium-validation path entirely for Existing Brand JPEG.
- **Not tested in this environment:** live Rakuten/Yahoo downloads, Windows portable EXE, Adobe Photoshop/COM integration or publishing the HTML in Rakuten. These still require workstation verification. The 940 Excel `#VALUE!` iframe rows are source formula errors and remain invalid.
