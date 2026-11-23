# Rakuten Combine Batch v2.0.10 — Detect NO IMAGE Singles

Base: v2.0.9 (Existing Brand only).

- Fixed: decodable gray "NO IMAGE" placeholders can no longer silently pass as valid Single photos. New `src/core/singlePlaceholder.js` uses conservative pixel preflight and bundled English OCR. Very characteristic gray icon/caption artwork is also detected when OCR is unavailable; weaker suspected cases go to manual review rather than PASSED.
- Confirmed `SINGLE_NO_IMAGE` Single is removed from **BOTH** generated JPEG and HTML; valid Details still form the same two-column Combine in `ERRORS`.
- All-white `SINGLE_BLANK_REVIEW` Single is also excluded from both outputs (still flagged for QC).
- Preserved: `#VALUE!`/empty/broken iframe with a **valid** Single outputs a Single-only review JPEG/HTML in `ERRORS`; placeholder Single with no valid Details creates only an error Excel row.
- Preserved: v2.0.9 MAR-90/date serial SKU protection, original Excel non-modification, distinct PASSED/ERRORS folders, 3800px height check, warning spreadsheets, original iframe image order, 600px JPEG, 780px HTML, Existing Brand only.
- Added report fields: `singleNoImageCount`, `singlePlaceholderReviewCount`. Visible UI logs report both counts. Updated version to 2.0.10.
- New tests: realistic gray icon+NO IMAGE pixel fixture, legit grayscale item negative, OCR missing fallback, complete JPG/HTML and errors Excel end-to-end checks.

Run: `npm run validate` then use `START_DEV.cmd` on Windows. Test a small real batch with known placeholder SKUs such as the earlier `acl-92` example. The actual Yahoo endpoint cannot be verified in this offline build environment; verify with the real source workbook on Windows before processing a large batch.
