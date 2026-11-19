# Rakuten Combine Batch Standalone v2.0.4 architecture

This is the standalone Rakuten app, separate from BrandForge and Rakuten Converter Electron v2.

## Existing Brand

```text
Choose/drop Excel XLSX (no automatic full run)
  |
  +-- Test 3 products [first three valid Rakuten GOLD iframe rows]
  |        OR Generate full batch
  |
  +-- Excel C = iframe HTML / URL; D = OUTPUT; E = Single image URL
  +-- Parse Rakuten GOLD HTML and extract source-image URLs in original order
  +-- Extract item ID from final segment of Yahoo Single URL
  +-- HTML_FILES/ID.html: 780px HTML table, full-width Single + fixed 2-column gallery
  +-- JPEG_FILES/IDcombine.jpg:
  |     single: width 600, 0px padding top and sides
  |     gallery: Sharp direct image compositor (not a Chromium screenshot)
  |       3px outer margin, 293px left / 8px gap / 293px right,
  |       7px gap after each row, 15px below Single,
  |       proportional downscale if source wider than its cell (no crop/upscale)
  +-- Excel OUTPUT and HTML/JPEG file links on same original rows
  +-- BATCH_REPORT.json with failed image URLs and clear statuses
  +-- Automatically halt after 5 consecutive JPEG failures, save results
```

Image download host restrictions: Rakuten GOLD/image domains and Yahoo `item-shopping.c.yimg.jp` for Single. Remote input is never allowed to execute scripts. Image bytes are held transiently in memory and discarded after JPEG generation. The original Excel and source images are not modified. A failed JPEG is `FAILED`, not generic `REVIEW`.

## New Brand

Manual Single / Line Up / Details uploads → 600px original BrandForge planner (2 columns, 8px / 7px gaps, Hiragino Kaku Gothic Pro W3 at 28px) → prepare images and visible bounds → direct Sharp JPEG strips → validated version-safe JPEG publish → matching relative-image HTML publish. All of this works independently of Photoshop. Optional PSD/PSB export runs Photoshop JSX/COM **after** JPEG/HTML are published, so a Photoshop failure cannot lose the primary outputs. Image types are checked by actual Sharp decode, not solely by extension. Separate folder memory for each upload section and output is saved in the userData profile. No text removal. Existing Brand is unchanged.

## Validation commands

`npm run validate` runs static Node syntax checks and automated tests. On a Windows PC run `START_DEV.cmd`, select the Excel workbook, and **Test 3 products**. Inspect the generated JPEG/HTML, then run the full batch. `BUILD_PORTABLE.cmd` packages an EXE (requires packages and build support on Windows); no EXE is included in the source ZIP.

## Unresolved external dependencies

Live Rakuten and Yahoo image hosts may return HTTP errors, timeouts or source content changes. Recheck `BATCH_REPORT.json` for exact row and image errors. The separate `#VALUE!` Excel iframe-formula errors are not recoverable by the renderer. Actual Rakuten HTML editor behavior and Photoshop Smart Object export need on-PC validation.
