# Rakuten Combine Batch Standalone v2.0.2 - Full-Bleed Single + ID Export Names

## Existing Brand only (built on v2.0.1)

- No Line Up detection, no Details detection, and no generated DETAILS heading. All iframe image URLs remain in original source order, in two fixed columns after Single.
- Single touches the top, left and right canvas edges, with zero padding or framing. Rendered full-width: 780px in HTML / 600px in JPEG. Image height follows the source aspect ratio; no crop. Existing 15px gap **below** Single remains.
- Spacing applies only to the gallery: two image areas (386px HTML / 293px JPEG), 8px between columns, 7px between rows. JPEG gallery outer margins are 3px on the left/right; Single has no outer margins. No squeezing of one item to match its neighbor and no image upscaling for gallery cells.
- Excel parsing remains unchanged. Original `rak1-normal-item` C iframe / D HTML output / E extensionless Yahoo Single URL, and alternative supported header-mapped layouts, are preserved. Iframe extraction and URLs are unchanged.
- From the end of Excel E `https://item-shopping.c.yimg.jp/i/n/glv_abu-90`, extract the ID `abu-90` (drop `glv_` shop prefix) and save `HTML_FILES/abu-90.html` and `JPEG_FILES/abu-90combine.jpg`.
- If E is blank/local/non-Yahoo, the iframe basename supplies the ID. Duplicate IDs fail with a logged message rather than silently overwriting outputs. Batch report now includes the resolved productId.
- Added validation that a rendered JPEG Single truly fills the entire width from x=0, y=0, and its gallery begins 15px below it.
- Replaced the document title `Combine Product Details` with `Rakuten Combine Gallery`.

## No change

New Brand's original BrandForge-derived manual layout, captions, Photoshop export, and selection/reorder logic are unchanged. The old automatic classification modules remain archival and are not executed by Existing Brand.

## Validation

- `npm run validate`: 83/83 source/regression tests pass, including a mocked real C/D/E Excel batch with exact filename assertions and a duplicate-ID test.
- Automated geometry checks pass. Live Windows Chromium screenshot, image-network availability, and destination Rakuten HTML rendering still need workstation QC. This ZIP is source code, not a compiled Windows EXE.
