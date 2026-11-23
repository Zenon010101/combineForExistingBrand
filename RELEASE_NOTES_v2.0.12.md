# Rakuten Combine Batch v2.0.12 — Retain NO IMAGE for error review

**Base:** v2.0.11 (Existing Brand only).

- Updated user-approved rule: confirmed gray `NO IMAGE` Singles are **kept inside JPEG and matching HTML**, so error reviewers can see the bad Single directly above the Details. Both files remain in ERRORS with issue `SINGLE_NO_IMAGE`.
- For `#VALUE!`/missing iframe + NO IMAGE Single, a real decoded placeholder is kept as Single-only ERRORS JPEG/HTML. No fake image is generated for broken URL/image-download failures.
- Known placeholder HTML files are **review-only** and the invalid Single HTML snippet is not copied into the results Excel's publishable OUTPUT cell.
- Retains `MAR-90` Excel date/SKU URL recovery, separate PASSED/ERRORS directories, errors-only Excel, the 3800px height QC, preserved original iframe order, fixed two-column Details, and valid Single-only iframe-error behavior.
- Added `singleNoImageRetainedCount` to BATCH_REPORT.json and updated visible batch logs.
- Fixed duplicate constant declaration in a test script included in the v2.0.11 release; all tests are rerun on the actual v2.0.12 ZIP contents before delivery.

Limitations: live Rakuten/Yahoo endpoints and ExcelJS writing on Windows require real-machine verification. Older batch outputs are not changed. For a portable EXE, rebuild using BUILD_PORTABLE.cmd.
