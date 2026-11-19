# Rakuten Combine Batch Standalone v2.0.1 — Strict Two Columns

## Existing Brand correction (vs 2.0.0)

- Root cause: `flex-wrap` inside pairs placed 380px source images on separate lines in the 600px JPEG, resulting in 1 image per row.
- Replaced the JPEG flex-wrap layout with an explicit 293px + 8px + 293px CSS grid (600px canvas with 3px outside margins).
- Replaced the Rakuten 780px HTML flex layout with a fixed two-image-column HTML table. Image areas are 386px, separated by 8px, and retain the original order.
- Optional Single is still the only full-width image. Gallery starts after the 15px Single gap.
- A source is fitted down only if wider than its standard column; never enlarge, stretch, crop, or resize an image to match its neighbor. An odd final image stays left.
- Rows have dynamic height equal to their taller image and a 7px inter-row gap; no artificial blank image placeholders.
- Existing Brand still does not guess Line Up vs Details and never creates the DETAILS heading. All images remain in iframe order.
- Added a Chromium geometry check that refuses to publish a JPEG if the gallery collapses into one column or a row overlaps.
- Updated app UI text, batch report layout metadata and regression checks.

## Not changed
- New Brand mode manual BrandForge Combine planner, PSD/PSB + JPEG export, text caption controls, Photoshop bridge.
- Excel C/D/E mapping, original image URLs, result workbook schema and single-image source preparation.

## Verification
- `npm run validate`: 78/78 source and regression checks passed (v2.0.0 had 76).
- HTML table and JPEG grid geometry should be inspected on a Windows test run and on the actual Rakuten editor before publishing live. No Windows EXE build is included.
