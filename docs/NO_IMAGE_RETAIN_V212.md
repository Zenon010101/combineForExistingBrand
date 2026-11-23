# v2.0.12: Keep detected NO IMAGE Singles in error outputs

## Approved visual QC policy

A **downloaded and decodable** gray NO IMAGE Single must not count as a valid product photo, but the user wants to **see it in the generated Combine** when reviewing the errors. Flag it `SINGLE_NO_IMAGE` and route JPEG/HTML into ERRORS, while leaving that same NO IMAGE artwork visible at the full-width Single position.

- Detected NO IMAGE + valid iframe Details: output single at the top (including NO IMAGE), 15px gap, two-column Detail gallery below. Save one combined JPEG and matching HTML under ERRORS.
- Detected NO IMAGE + `#VALUE!`, empty, or broken iframe: output the actual placeholder as Single-only JPEG/HTML under ERRORS, with `NO_VALID_DETAILS` and iframe-related issues. It is not a PASSED item.
- Valid Single + broken iframe: preserve v2.0.9 Single-only ERRORS behavior.
- Broken URL, invalid image bytes, or network failure: nothing to retain; do NOT synthesize a placeholder. If Details exist, generate Details-only ERRORS; otherwise errors Excel only.
- Nearly-all-white Singles remain excluded and flagged, as in v2.0.11. Suspected gray placeholder is retained and flagged review, unchanged.
- If a known NO IMAGE is retained, the separate HTML file is a **review-only** output. Never populate publishable Excel HTML code with that invalid Single. The original source workbook remains unchanged.

The issue code, original URL, output links, and screenshot-based `singlePlaceholderMatch` remain in the errors-only workbook and `BATCH_REPORT.json`. Report includes `singleNoImageRetainedCount` for products whose JPEG actually retained a confirmed NO IMAGE bitmap.

## Tests

`npm run validate` checks actual JPEG pixels and matching HTML for both screenshot-derived NO IMAGE + Details and NO IMAGE + failed iframe. It verifies `ERRORS` folder routing, `SINGLE_NO_IMAGE`, and non-publishable Excel code. It also checks a broken Single URL continues to omit unavailable pixels, and valid Singles continue to pass. Tests do not simulate live Yahoo CDN downloads and cannot verify live Windows ExcelJS serialization.

**NOTE:** Historical v2.0.10/v2.0.11 docs described the previous removal policy. This v2.0.12 document supersedes that behavior. Rerun affected rows to produce new outputs; preexisting folders are not moved.
