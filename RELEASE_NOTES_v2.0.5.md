# v2.0.5 — Existing Brand Only

## Removed

- New Brand mode/tab and its entire manual Single/Line Up/Details interface.
- New Brand import, preview, reordering, output folder chooser and optional Photoshop PSD/PSB export.
- `src/manual/**`, `src/core/newBrandFolders.js`, `src/renderer/newbrand.js`, all `new:*` IPC handlers and New Brand preload methods.
- New Brand-specific examples and tests.

## Preserved

- Excel/iframe processing, automatic Single source detection, two-column source-order HTML and direct JPEG, batch output folders and saved results workbook.
- Test 3, full batch, Stop, original Excel preservation, JPEG error reporting and 5-consecutive-failure automatic stop.
- Existing Brand legacy regression tests and 600px JPEG geometry.

**Scope:** this release removes New Brand only; previously proposed 3800px QC, Single visual QC and errors-only Excel are not yet added.
