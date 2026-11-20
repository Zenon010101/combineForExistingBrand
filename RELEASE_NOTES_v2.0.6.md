# Rakuten Combine Batch v2.0.6 — Broken Image QC and Separated Output

Built on v2.0.5 (Existing Brand only). This version **does not restore New Brand**.

## Added
- Single source validation before it is referenced in HTML or JPEG; broken/blank Single detection.
- Individual gallery-image network/decode validation, with valid images preserved in original order.
- Partial JPEG + HTML outputs for broken Single or partial broken iframe/gallery images.
- Single-only HTML + JPEG when iframe fails and public Single is usable.
- Generated JPEG height review: **>3800px** goes to ERRORS without cropping or squeezing.
- `PASSED/{HTML_FILES,JPEG_FILES}` and `ERRORS/{HTML_FILES,JPEG_FILES}`.
- `ERRORS/COMBINE_ERRORS_ONLY.xlsx`, with original iframe HTML/URL, Single URL, damaged image URLs, product ID, source worksheet/row, height, issue codes, clickable output links.
- Extra `ISSUE CODES`, `JPEG HEIGHT (PX)`, and `BROKEN DETAIL URLS` columns in the results workbook.
- `Open errors-only Excel` UI action, review/pass counts, separate-folder logging.
- Offline tests for broken Single/detail, blank Single, invalid iframe, all-formula-error workbooks, height exact-limit/over-limit, and image reuse.

## Preserved
- Exactly two image columns after optional Single, output names, source order, JPEG/HTML dimensions, 15px Single gap, no crop/upscale of detail images.
- C iframe / D OUTPUT / E Single mapping, original workbook preservation, `Test 3`, full batch, Stop, 5-consecutive-JPEG-failure circuit breaker, no Photoshop requirement.

## Limits
- Single blank/near-white detection is **review-only** due to real white products.
- No valid images means no fabricated JPEG/HTML; error is listed in Excel.
- A local-only Single is not a publishable HTML image URL and requires review.
- ExcelJS real XLSX serialization and live remote requests require Windows with installed project dependencies; source-only test suite uses workbook doubles.
