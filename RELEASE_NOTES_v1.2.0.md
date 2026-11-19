# Rakuten Combine Batch v1.2.0 — Actual Excel Format Fix

Standalone update. BrandForge is not modified.

## Fixed using the supplied `rak1-normal-item.xlsx`

The workbook has 7,759 rows, including its header row. Actual source mapping:

| Column | Meaning | Behavior |
| --- | --- | --- |
| A | 商品管理番号（商品URL） | Preserve original item ID |
| B | 商品番号 | Preserve original SKU |
| C | Full Rakuten iframe | Read source iframe or report Excel source error |
| D | Blank output field (typically a single space) | Write the complete generated HTML snippet here |
| E | Yahoo Single image URL, e.g. `https://item-shopping.c.yimg.jp/i/n/glv_abu-90` | Read directly, **do not move or overwrite** |
| F | New HTML FILE LINK | Clickable link to the matching `.html` |
| G | New JPEG FILE LINK | Clickable link to the matching `.jpg` |
| H onward | QC columns | READY / REVIEW / FAILED, Single status, counts, warnings |

The real file **does not label columns C and E**. Earlier versions looked for a `SINGLE` header or a Single in the cell to the *left* of the iframe, so the Single was missed. v1.2.0 searches source values, recognizes the headerless E column, and never relocates it. URL filenames need no `.jpg` suffix. An Excel hyperlink is supported as well.

For a row with a valid iframe, the output order is:

1. Single image from Column E (if supplied)
2. Line Up images, in 2 columns
3. DETAILS 28px heading
4. Details images

The 780px **HTML** keeps its 3-column Details section. The 600px **JPEG** retains the established 2-column Details section. Both include Single at the top. A direct Yahoo URL is referenced as-is rather than downloaded into an intermediate image folder.

### Important source errors discovered

- **6,818** rows contain iframe blocks.
- **940** rows contain `#VALUE!` in Column C rather than an iframe (including row 326).
- Those 940 rows are now reported as **FAILED**, with a specific cell reference such as `C326`; the app will not invent missing iframe URLs from product IDs or silently omit them.

Source numbers are based on the exact uploaded workbook, not a live Rakuten check. The real HTML/JPEG export still requires reachable Rakuten and Yahoo URLs on the Windows computer.

## Output and workflow

Choose/drop `.xlsx` → auto-run → new `COMBINE_BATCH_YYYYMMDD_HHMMSS` folder beside the input workbook. Save the new `*_COMBINE_RESULTS.xlsx` inside that folder with outputs beside matching source rows. The input workbook is never overwritten. The app remembers the last Excel folder, last output folder and result workbook between sessions.

## Verification

`npm run validate` passes all **16** automated tests, including new tests for the exact five-column workbook, ExcelJS-style `#VALUE!` errors, Single in both layouts, preserved Column E, and safe reruns. Source workbook structure was independently inspected with openpyxl.

No live Windows/Electron screenshot or remote image-fetch verification was possible in this environment. Before a large batch, test a few valid iframe rows on Windows, then inspect the `SINGLE STATUS`, `JPEG STATUS`, and QC warning columns. This ZIP is project source, not a compiled Windows EXE.
