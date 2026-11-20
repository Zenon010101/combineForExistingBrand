# Broken Image QC — Existing Brand v2.0.6

## Detection order

1. Detect each product's iframe and Single input from the original Excel, including hyperlink-only Single cells and formula errors such as `#VALUE!`.
2. Fetch/parse iframe HTML. Store original URL and iframe source. If the iframe fails, still attempt Single.
3. Validate Single source. For remote URLs, retrieve bytes; for local files, decode them. Inspect an image sample for near-white blank output. White/blank is REVIEW only, not auto-deleted.
4. Download and decode each iframe image. Preserve the surviving order in both HTML and JPEG; report every failed URL in the error workbook.
5. Generate only from valid bytes. When no gallery images remain but a public Single is valid, create Single-only JPEG/HTML. Never invent placeholder product photos.
6. Verify saved JPEG and read the actual output height reported by the renderer. Height `3800` passes, `3801` or above is REVIEW. No automatic crop or forced resize.
7. Route fully passing products to PASSED and all REVIEW/FAILED products to ERRORS. A failed JPEG can still have usable HTML in ERRORS.
8. Write `*_COMBINE_RESULTS.xlsx` in original worksheet order with OUTPUT in D for rak1 format. Write `ERRORS/COMBINE_ERRORS_ONLY.xlsx` with five categorized tabs and source URLs.

## Error classifications

- `SINGLE_BROKEN`: bad Single URL, HTTP failure, invalid bytes, bad local path
- `SINGLE_BLANK_REVIEW`: virtually all-white Single (could be a real white product)
- `SINGLE_MISSING`: composited JPEG lacks the Single height after preflight
- `SINGLE_HTML_MISSING`: local file-only Single is not publishable as remote HTML
- `DETAIL_IMAGE_BROKEN`: detail image URL failed validation or download
- `IFRAME_ERROR`: malformed/broken iframe or Excel formula error
- `IFRAME_REVIEW`: warnings reported while discovering image sources
- `HEIGHT_OVER_3800`: output exceeds configured height threshold (default 3800px)
- `HTML_UNAVAILABLE`: local Single only, no public source for HTML
- `NO_USABLE_IMAGES`, `JPEG_FAILED`, `PROCESSING_ERROR`, `OUTPUT_ID_ERROR`, `OUTPUT_MOVE_FAILED`

## Workbook layout

`ALL_ISSUES` and category tabs include: Product ID, Source Sheet, Source Row, Status, Issue Codes, Iframe Source, Iframe URL, Single URL/Path, Broken Detail URLs, JPEG Height, JPEG File, HTML File, Error Details. Clickable hyperlinks are created when URLs or output files are available. Multi-error items can appear in several category tabs, but once in `ALL_ISSUES`.

## Data safety

- Source Excel and original image sources are never modified.
- Output IDs must be unique across sheets; a duplicate is reported instead of overwritten.
- JPEG/HTML are initially staged in ERRORS, then moved to PASSED only if all checks pass. A failed move leaves available files reported with their actual paths.
- The `BATCH_REPORT.json` contains issue codes, original URL strings, and final file locations.
- If the Single is local, it may be composed into a JPEG but not referenced in a hosted Rakuten HTML page; HTML cannot use local Windows file paths.
- The errors-only Excel is generated even when the batch finishes with zero errors (header-only workbook).

## Performance

Validated PNG pixels are cached **in memory for that product** between preflight and JPEG composition, avoiding a second request. No persistent source image archive is saved.
