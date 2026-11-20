# Rakuten Combine Batch v2.0.7 — Error Combine Layout Guarantee

Base: v2.0.6 Existing Brand-only QC.

- Use one normalized Combine output plan for both HTML and JPEG, regardless of PASSED/ERRORS destination. Remaining valid Detail images reflow into two columns when some source URLs are broken.
- Preserve the full-bleed Single and exact 15px Single-to-gallery gap even for products in ERRORS. Broken Single means two-column gallery starts at the top.
- Generate a locally viewable combined HTML file when a valid Single comes from a local path. Inline Single HTML is **not publishable on Rakuten**: keep Excel OUTPUT blank, flag `SINGLE_HTML_MISSING`, and preserve source info in errors Excel.
- Remove the unwanted 15px trailing spacer when HTML has Single only.
- Add renderer image-count mismatch warning, plus explicit `combineLayout`, `combineGalleryRows`, and `htmlPreviewOnly` metadata in BATCH_REPORT.json.
- Add end-to-end 600px JPEG pixel tests and HTML tests for PASSED and ERRORS; no image reclassification, new templates, HTML DETAILS heading, or cropping.
- 3800px review threshold, output folder naming, source Excel mapping, errors-only workbook, and New Brand removal remain unchanged.

The full project is source code, not a prebuilt Windows EXE. Use Test 3 Products on your PC to verify real Rakuten/Yahoo and ExcelJS integration.
