# Rakuten Combine Batch Standalone v1.0.0

**New application. No BrandForge files changed or required.**

- One-click Excel selection or drag/drop auto-starts batch; no manual Generate button.
- Automatically saves beside the Excel source file in a unique timestamped COMBINE_BATCH folder.
- Remembers last Excel input folder, last output folder, last results Excel and default Line Up count across restarts.
- Supports up to 15,000 product rows across sheets, with controlled concurrency for large batches.
- Optional Single JPG/PNG etc from Excel's `SINGLE IMAGE PATH` column for 600px JPEG output.
- Classic Combine JPEG layout: Single (optional) > 15px gap > two-column Line Up > DETAILS 28px > two-column Details.
- HTML generator unchanged: 780px tables, 2-column Line Up and 3-column Details, no Single in HTML until approved.
- Writes complete HTML into Excel directly beside the corresponding iframe, plus clickable HTML/JPEG file links.
- Preserves original workbook and product image files; `READY/REVIEW/FAILED/SKIPPED` statuses and JSON audit.
- Full-page browser render with sharp JPEG encoding and validation. No Photoshop.
- Packaging: `npm run build:portable` or double-click `BUILD_PORTABLE.cmd` after installing Node.js/npm.

**Test status:** 7/7 JS regressions passed, including a 1,000-row mock batch. Browser visual inspection of 600px JPEG layout and the user interface passed. The npm registry was unreachable in the development environment, so an actual ExcelJS+Electron Windows runtime test was not completed. Perform a small 2-5 row live Windows trial before production.
