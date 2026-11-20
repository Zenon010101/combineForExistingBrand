# Rakuten Combine Batch v2.0.7 — Existing Brand Only · Same Combine Layout in PASSED / ERRORS

This is the **standalone Existing Brand-only Rakuten Combine Batch** Electron application. **New Brand is removed**; this is **not** BrandForge. Version 2.0.7 guarantees that PASSED and ERRORS use the same Single + two-column layout from a single validated image sequence. It also adds a non-publishable local HTML preview for an available local Single.

## Workflow

1. Choose/drop an `.xlsx`. Selecting the workbook **never starts the batch**. Click **Test 3 products** to validate source URLs and layout, then **Generate full batch**.
2. Standard `rak1-normal-item.xlsx` mapping: **C = Rakuten GOLD iframe**, **D = generated HTML**, **E = Single image URL/path**. A/B source identifiers and E are never moved. Other valid iframe/Single column formats can also be detected. The **original Excel file is never modified**.
3. Discover iframe images in **source order**. Do not classify Line Up/Details, remove embedded text, crop products, or introduce a DETAILS heading.
4. Preflight Single and every iframe image. HTTPS requests and decodes are validated; invalid detail URLs are removed **only from the generated partial output**, and their original links are recorded. A broken Single does not block valid detail images.
5. Render 600px JPEG using Sharp (no Photoshop): Single full bleed at top, 15px gap, fixed 293px gallery columns, 3px outer margins, 8px inter-column gap, 7px row gap. Source proportions preserved. HTML is a 780px two-column table using the same validated images as JPEG, with broken URLs removed. If an iframe is broken but a public Single remains, generate Single-only JPEG/HTML in ERRORS. When Single comes from a local file, HTML embeds it for **local preview only**; that HTML is **not Rakuten-publishable**, so the Excel OUTPUT cell stays blank and the row is flagged for review. A Single-only HTML table has no extra trailing 15px gap.
6. Verify final JPEG output. Any **height greater than 3800px** is `HEIGHT_OVER_3800` and goes to ERRORS **without cropping**. A Single that looks almost entirely white is `SINGLE_BLANK_REVIEW`, not automatically deleted.
7. Route completed products to PASSED or ERRORS; save original source URL, Single URL, broken image URLs, source sheet/row, and output links in a separate errors-only workbook. Original worksheet and results workbook are preserved.

## Output structure

```text
COMBINE_BATCH_YYYYMMDD_HHMMSS/
  PASSED/
    JPEG_FILES/            # QC-passing *combine.jpg
    HTML_FILES/            # QC-passing *.html
  ERRORS/
    JPEG_FILES/            # usable partial / oversized / blank-review JPEGs
    HTML_FILES/            # usable Combine HTML; local Singles are review-only inline previews
    COMBINE_ERRORS_ONLY.xlsx
  {source}_COMBINE_RESULTS.xlsx
  BATCH_REPORT.json
```

`COMBINE_ERRORS_ONLY.xlsx` has tabs `ALL_ISSUES`, `SINGLE_ERRORS`, `IFRAME_ERRORS`, `HEIGHT_REVIEW`, `OTHER_ERRORS`. These include a row per affected product and clickable original source URLs and output file links where available. A product may appear in multiple category tabs but only once in `ALL_ISSUES`.

## QC statuses

| Code | Meaning |
| --- | --- |
| `SINGLE_BROKEN` | Single cannot be read/downloaded/decoded or uses an unsupported image host |
| `SINGLE_BLANK_REVIEW` | Single is nearly all white; manual review to avoid false positives for white products |
| `SINGLE_MISSING` | Validated Single was not confirmed in JPEG composition |
| `SINGLE_HTML_MISSING` | Local Single has matching HTML preview, but public Rakuten upload/link is still required; Excel OUTPUT intentionally blank |
| `COMBINE_LAYOUT_MISMATCH` | Renderer image-count mismatch; keep output in ERRORS for review |
| `IFRAME_ERROR` | Iframe URL, source Excel formula, fetch, or image discovery failed |
| `DETAIL_IMAGE_BROKEN` | An individual iframe image failed download or decode; its URL is reported |
| `HEIGHT_OVER_3800` | Final generated JPEG height is **greater than** 3800px; JPEG is not cropped |
| `JPEG_FAILED` | JPEG could not be saved; any available HTML is retained in ERRORS |
| `NO_USABLE_IMAGES` | All sources are unusable; no JPEG or HTML fabricated |
| `OUTPUT_ID_ERROR` | Duplicate/invalid output ID; never overwrite another product |
| `SKIPPED` | Product not processed due to Stop or batch safety halt |

`READY`: both JPEG and HTML pass QC, saved under PASSED. `REVIEW`: usable output exists but any validation issue remains, saved under ERRORS. `FAILED`: no successful JPEG or another fatal problem, saved in ERRORS Excel; any valid partial HTML is retained. `SKIPPED`: not run.

The full batch still stops after **5 consecutive JPEG render failures**, while preserving completed output and recording skipped rows. Input Excel errors do not count as renderer failures unless a JPEG attempt actually failed.

## Installing and testing on Windows

- Extract the full project ZIP. `START_DEV.cmd` installs missing packages and runs Electron. Node/npm are required; a portable Node installation can be used without admin rights.
- `BUILD_PORTABLE.cmd` validates and builds the portable EXE (`dist/`) **on Windows**. The source ZIP does not contain a compiled executable.
- `npm run validate` checks code syntax and automated tests. The tests simulate image retrieval and workbook serialization and generate actual sample JPEG files; **live Rakuten/Yahoo requests and real ExcelJS serialization were not executable in the offline test container**.
- Test three products on the actual Windows system before full production. Open both JPEG/HTML folders and `COMBINE_ERRORS_ONLY.xlsx` to check links and file associations.

See `docs/BROKEN_IMAGE_QC_V206.md` and `docs/ERROR_COMBINE_LAYOUT_V207.md` for QC rules and new error-layout acceptance tests.
