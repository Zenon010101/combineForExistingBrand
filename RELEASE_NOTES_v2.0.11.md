# v2.0.11 — Real Yahoo NO IMAGE Single Placeholder Regression Fix

**Base:** v2.0.10, Existing Brand only.

- Fixed: actual gray NO IMAGE fallback shown in a user-reported PASSED Combine failed v2.0.10's early pixel preflight. The detector now explicitly recognizes the observed gray fallback graphic via normalized image similarity and accepts a wider range of gray foreground densities for OCR fallback.
- Confirmed placeholders: flagged `SINGLE_NO_IMAGE`, removed from JPEG and HTML, and routed to ERRORS (Details-only Combine if any Details remain).
- Unconfirmed suspicious gray sources: `SINGLE_PLACEHOLDER_REVIEW`, routed to ERRORS rather than PASSED.
- Genuine image URL failures: `SINGLE_BROKEN`, Details-only ERRORS when available.
- Preserved: valid Single-only preview for iframe `#VALUE!`/missing iframe in ERRORS; `MAR-90` date-SKU correction; 3800px height review; PASSED/ERRORS file separation; source Excel untouched.
- Added: `singlePlaceholderMatch` to per-row BATCH_REPORT.json diagnostics for easier support review.
- New automated tests use the cropped generic NO IMAGE graphic from the exact reported screenshot and a re-encoded 600px JPEG, not merely a synthetic SVG; they exercise full generated outputs and status routing without an OCR dependency.

Run `npm run validate`. **Live Yahoo downloads and real ExcelJS workbook serialization are not verified in the offline test environment.** Rerun products under v2.0.11; old output files do not move automatically. Rebuild portable EXE if using it.
