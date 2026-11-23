# v2.0.11 — Actual Yahoo "NO IMAGE" Single fix

## Confirmed problem in v2.0.10

The user's report shows a light-gray **NO IMAGE icon + caption** at the top of a two-column Combine, saved under PASSED. The original v2.0.10 pixel preflight rejected the cropped graphic without reading the text: light-pixel fraction about 0.751 (minimum 0.77) and nonwhite gray "ink" about 0.263 (maximum 0.21).

A valid `HTTP 200` image response and successful JPEG decoding do not prove the Single is a product photo.

## Change

- `src/core/assets/yahoo-no-image-reference.png` contains ONLY the generic cropped NO IMAGE placeholder from the provided output screenshot (not the product photos or app UI).
- If a Single resembles a light neutral image, compare its normalized 160 x 160 grayscale layout to that reference using contrast-insensitive image correlation. A match >= 0.84 confirms `SINGLE_NO_IMAGE` without requiring OCR or a live Internet connection.
- Broaden pixel preflight so the actual gray fallback and similar variants proceed to English OCR instead of being discarded as valid photos early.
- Distinctive but unconfirmed gray cases trigger `SINGLE_PLACEHOLDER_REVIEW` and stay under ERRORS for manual review; valid colored or ordinary grayscale products should remain unaffected.
- `BATCH_REPORT.json` now includes `singlePlaceholderMatch` for each row (when checked), making remote failures easier to diagnose.
- Confirmed placeholders are excluded from both generated JPEG and HTML. If Details remain, they are recomposed into the usual two-column layout under ERRORS. If Details do not exist, create an errors-only Excel row without fake product pictures.
- HTTP failures / invalid Single URLs still use `SINGLE_BROKEN` and also belong to ERRORS. The prior valid Single-only preview for a broken iframe is preserved.

## Repeatable test

`npm run validate` includes `test/yahoo-single-placeholder-v211.test.js` with the screenshot-derived Yahoo pattern (re-encoded as a 600px JPEG), a simulated failed Yahoo URL, working Detail images, and a valid product Single. It verifies that neither the actual placeholder nor the broken URL can be sent to PASSED. It confirms original Excel unchanged.

**Windows verification required:** Rerun affected `ACL-92`, `ACL-93` or similar SKUs with v2.0.11 (`v2.0.11` must appear in the app header). Existing PASSED folders from previous versions are not modified. For a portable EXE, rebuild using `BUILD_PORTABLE.cmd`; updating source ZIP alone does not modify an older EXE. Live CDN payloads may differ from the screenshot pattern; uncertain variants are routed to ERRORS for inspection.
