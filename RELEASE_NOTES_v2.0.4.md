# Rakuten Combine Batch Standalone v2.0.4 — New Brand JPEG + HTML recovery

## Fixed
- The New Brand pipeline no longer stalls without output after `Fitted N/N` when Photoshop is unavailable. JPEG + HTML are generated and verified **before** optional Photoshop execution.
- Added direct Sharp renderer using original BrandForge 600px planner coordinates, preserving Single, Line Up / captions, Details, image order, spacing and scaling rules. Tall outputs are split into sequential JPEG strips, and HTML references all strips in order.
- New Brand produces `OUTPUT_NAME.jpg` + `OUTPUT_NAME.html`; Photoshop PSD/PSB is an **optional** checkbox. If the PSD export fails, the files already saved remain intact and the app logs `PSD/PSB export failed`.
- Caption font set to Hiragino Kaku Gothic Pro W3, size 28px (JPEG, preview and Photoshop JSX). Exact appearance requires the font to be installed; no font files are bundled. Renderer uses installed fallback when missing.
- Image picker now exposes common image types + All files. Actual Sharp/Photoshop decoding decides which are image-capable and clearly logs files that cannot be processed.
- Separate persistent remembered folders for New Brand Single, Line Up, Details, and Output, with a clear-memory button; existing results are unaffected.
- New Brand output uses version-safe names; generated HTML references relative JPEG filenames, suitable for local preview and same-folder web hosting. For Rakuten online use, upload JPEGs and replace relative `src` paths with hosted URLs.
- Added explicit after-fit logs for compositing, rendering JPEG, saving JPEG and HTML, optional Photoshop, DONE / specific errors.

## Unchanged
- Existing Brand: Excel C/D/E mapping, automatic iframe extraction and strict 2-column gallery, JPEG/HTML naming and safe Test 3 workflow.
- BrandForge Combine geometry for New Brand: 600px width; Single optional; 15px gap; two 293px Line Up / Details columns; 8px / 7px gaps; optional Details heading; source order, vertical and dual image modes; no text removal or original file modification.

## Verification
- Syntax checks passed, and **59 New Brand / classifier / layout tests** passed in this container, including a 24-image JPEG+HTML export, output versioning, filename escaping, broad image-decoding, folder memory, and Photoshop-error recovery.
- A real sample 600px JPEG and matching HTML were generated and visually inspected (see `docs/NEW_BRAND_JPEG_HTML_QA.jpg`).
- This runtime lacks ExcelJS, so the full Excel batch test suite was not rerun. It also cannot validate Windows Electron portable builds, Adobe Photoshop COM, or live Rakuten uploads. Run full `npm run validate` and optional PSD export on your Windows workstation.
