# Rakuten Combine Batch v2.0.8 — No Single-Only Exports

Source: v2.0.7 Existing Brand Only. **No New Brand**.

- Changed the output gate to require **at least one valid iframe Detail image** to generate a JPEG and matching HTML. A valid Single alone no longer creates a JPEG/HTML.
- Missing iframe C cells with a Single URL in E (and A/B product identifier) are now captured in the errors workbook, like #VALUE! formula errors.
- Added `NO_VALID_DETAILS` to the error report and categorized it under `IFRAME_ERRORS`; source iframe and Single URLs remain available.
- Products with some valid iframe Details still generate the same PASSED/ERRORS two-column Combine. Broken Single URL is omitted without blocking valid Details. Oversized 3800px reviews unchanged.
- New `test/no-single-only-v208.test.js`: 3 scenarios; updated old fallback assertions and kept existing layout pixel verification.
- Updated app version and QC explanation.

This version does **not** implement comprehensive 'NO IMAGE' placeholder recognition; a valid image containing a placeholder graphic is still technically decodable. No existing JPEGs are deleted. This rule applies to new v2.0.8 batches only.
