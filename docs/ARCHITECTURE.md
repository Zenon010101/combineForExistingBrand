# Rakuten Combine Batch v2.0.5 — Existing Brand Only

```text
Electron UI: src/renderer/index.html + app.js
  -> Select Excel (no auto-run)
  -> Test 3 products / Generate full batch
     -> src/main.js (Electron IPC: batch:start)
        -> src/core/batch.js (StandaloneBatch)
           -> src/core/excel.js (read original workbook)
           -> src/core/iframeHtml.js (fetch and parse Rakuten GOLD iframe)
           -> src/core/iframeSingle.js (prepare optional Single)
           -> src/core/existingBrand.js (HTML layout)
           -> src/core/directJpegRenderer.js (Sharp JPEG compositor)
           -> src/core/outputNaming.js (safe product ID from URL)
           -> output beside Excel:
             HTML_FILES/ID.html
             JPEG_FILES/IDcombine.jpg
             *_COMBINE_RESULTS.xlsx
             BATCH_REPORT.json
```

HTML: 780px, full-bleed optional Single, then exactly two columns. JPEG: 600px, full-bleed optional Single, then 293px columns, 8px inter-column gap, 7px row gap. 15px gap after Single. The gallery retains source order; no Line Up/Details classification is done. Failed JPEG attempts are recorded and a full batch auto-stops after 5 consecutive failures. Original Excel is never overwritten.

**Removed in v2.0.5:** manual New Brand workflow, `src/manual`, its Electron IPC and folder memory, associated tests and layout preview UI. The standalone tool no longer needs Photoshop.
