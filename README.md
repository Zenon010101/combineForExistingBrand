# Rakuten Combine Batch v2.0.12 — Existing Brand Only

Rakuten Combine Batch is a standalone **Existing Brand-only** Electron application. **New Brand is removed**; it does not depend on BrandForge or Photoshop.

Version 2.0.12 retains **detected gray NO IMAGE Singles** at the top of the JPEG and matching HTML under `ERRORS` so reviewers can see the broken picture. It still detects and flags these placeholders using the actual Yahoo gray icon pattern. Nearly-all-white Singles and undecodable URLs remain excluded as before. It retains the v2.0.9 date/SKU protection and Single-only error previews for valid Singles when an iframe fails.

## Workflow

1. Choose or drag an `.xlsx`. Selecting the workbook does **not** automatically start a batch. Use **Test 3 products** on the first three **valid** iframe rows, then **Generate full batch** for all eligible rows, including iframe `#VALUE!` rows.
2. Standard `rak1-normal-item.xlsx`: **A/B source IDs**, **C = iframe**, **D = generated HTML OUTPUT**, **E = Yahoo Single image URL/path**. These source columns remain in place; **the original XLSX on disk is never modified**. Additional headered formats are supported.
3. Safely detect date-converted SKU cells such as `MAR-90` becoming the Excel date `1990-03-01`. Date serial `32933` can then leak into an Excel-generated Single URL (`glv_32933`). The system only reconstructs a candidate SKU/URL when the date display and serial match and the iframe, if available, does not contradict the ID. The original Single URL is retained for audit. Repaired rows remain in ERRORS for human verification; corrected URLs are not guaranteed to exist on Yahoo.
4. Obtain iframe Detail images in **original order**. Do not classify Line Up/Details, remove text, crop, or add a DETAILS heading.
5. Preflight Single and every iframe Detail image. Detect invalid image bytes, all-white Singles, and confirmed gray `NO IMAGE` pictogram Singles. Exclude un-decodable and nearly-all-white Singles, but preserve confirmed gray NO IMAGE bitmaps in review JPEG/HTML. Use pixel checks, a known Yahoo placeholder visual signature, and the bundled English OCR model for gray candidates. The v2.0.11 signature handles the screenshot-proven gray icon + caption even without working OCR. Suspicious-but-unconfirmed cases are flagged REVIEW, never silently PASSED. If a Single resembles a placeholder but cannot be confirmed, route to ERRORS for manual review. Keep valid Details; **retain confirmed gray NO IMAGE Singles in both JPEG and HTML inside ERRORS for visual review**. Do not add the invalid Single HTML to publishable Excel OUTPUT cells. Invalid or un-decodable Single URLs and nearly-all-white Singles are excluded as before. Record original URLs and issues. For a product with no valid Details (iframe `#VALUE!`, blank, HTTP failure, or every Detail broken), a **valid Single still produces a Single-only review JPEG and HTML in ERRORS**. If there is no decodable Single and no usable Details, report the error without fabricating files. A decodable NO IMAGE bitmap may be the only Single-only review JPEG under ERRORS.
6. Generate 600px JPEG with Sharp: full-bleed Single at top, 15px Single-to-gallery gap **only if Details exist**, two 293px columns, 3px outer margins, 8px horizontal gap and 7px row gap. HTML is a matching 780px table. A Single-only error HTML is review-only and is not written to the Excel OUTPUT column for Rakuten publication. Local Single HTML is also review-only.
7. Validate JPEG. Height **over 3800px** generates `HEIGHT_OVER_3800` and sends the **uncropped** files to ERRORS. An almost-white Single gets `SINGLE_BLANK_REVIEW` and is excluded; a confirmed gray placeholder gets `SINGLE_NO_IMAGE` and is retained under ERRORS with its issue flagged. Uncertain gray artwork gets `SINGLE_PLACEHOLDER_REVIEW` and stays in ERRORS for manual inspection.
8. Save `PASSED`/`ERRORS` files, the results XLSX, `COMBINE_ERRORS_ONLY.xlsx`, and `BATCH_REPORT.json` with original and effective URLs, source SKU values, issue codes, and output links.

## Output structure

```text
COMBINE_BATCH_YYYYMMDD_HHMMSS/
  PASSED/
    JPEG_FILES/                 # Complete QC-passing *combine.jpg
    HTML_FILES/                 # Complete QC-passing *.html
  ERRORS/
    JPEG_FILES/                 # Partial Combines and Single-only iframe-error previews
    HTML_FILES/                 # Matching HTML (review-only for Single-only or local Singles)
    COMBINE_ERRORS_ONLY.xlsx
  {source}_COMBINE_RESULTS.xlsx
  BATCH_REPORT.json
```

`COMBINE_ERRORS_ONLY.xlsx` has `ALL_ISSUES`, `SINGLE_ERRORS`, `IFRAME_ERRORS`, `HEIGHT_REVIEW`, and `OTHER_ERRORS`. It preserves the **original iframe source**, **original Single URL**, **corrected Single URL used (if any)**, source SKU columns A/B, and clickable available output links. A valid Single-only preview caused by a broken iframe belongs to `IFRAME_ERRORS`, not `SINGLE_ERRORS`.

## Export behavior

| Source condition | Output | Location |
| --- | --- | --- |
| Valid Single + valid Details, no warnings | Full Combine JPEG/HTML | PASSED |
| Valid Single + valid Details with warning, height over 3800px, or verified date/URL repair | Full Combine JPEG/HTML, flagged | ERRORS |
| Broken Single URL, some valid Details | Details-only two-column Combine | ERRORS |
| Detected NO IMAGE Single, some valid Details | Full Combine **with the NO IMAGE Single still visible at top** | ERRORS |
| Blank white Single, some valid Details | Details-only two-column Combine | ERRORS |
| NO IMAGE Single + broken iframe | **Actual NO IMAGE Single-only JPEG/HTML**, review only | ERRORS |
| Broken iframe, valid Single | **Single-only JPEG/HTML**, marked review-only | ERRORS |
| No valid Detail URLs, valid Single | **Single-only JPEG/HTML**, marked review-only | ERRORS |
| No valid Single or Detail pixels | Error workbook row only | ERRORS |
| Source SKU `MAR-90` was converted to date and Yahoo URL ends in `glv_32933` | Attempt `glv_mar-90` **only if confirmed**, keep original and record repair | ERRORS |
| SKU/date recovery ambiguous or contradictory | Do not silently rewrite Yahoo URL; flag `SKU_DATE_UNRESOLVED` | ERRORS |

## QC codes

`SKU_EXCEL_DATE_RECOVERED`, `SINGLE_DATE_SERIAL_REPAIRED`, `SKU_DATE_UNRESOLVED`, `SINGLE_DATE_SERIAL_SUSPECT`, `SKU_DATE_CONFLICT`, `SINGLE_BROKEN`, `SINGLE_NO_IMAGE`, `SINGLE_PLACEHOLDER_REVIEW`, `SINGLE_BLANK_REVIEW`, `SINGLE_MISSING`, `SINGLE_HTML_MISSING`, `IFRAME_ERROR`, `NO_VALID_DETAILS`, `SINGLE_ONLY_IFRAME_ERROR`, `DETAIL_IMAGE_BROKEN`, `HEIGHT_OVER_3800`, `JPEG_FAILED`, `NO_USABLE_IMAGES`, `OUTPUT_ID_ERROR`, `SKIPPED`.

`READY` means a full output has no QC issues; `REVIEW` means JPEG/HTML exists with flagged issues; `FAILED` means no valid JPEG or another fatal error; `SKIPPED` means cancelled/not attempted. The full batch stops after **5 consecutive attempted JPEG failures**, retaining completed output. Source iframe error rows do not count as renderer failures unless an actual JPEG attempt fails.

## Install and test

- Extract the **Full Project** ZIP. On Windows, `START_DEV.cmd` installs missing packages and launches Electron; `BUILD_PORTABLE.cmd` validates and creates a portable `.exe` via electron-builder. Building requires Node/npm; it does not require administrator access if a portable Node installation is available.
- `npm run validate` runs JS syntax and automated tests. The v2.0.12 regression uses the actual cropped generic "NO IMAGE" artwork from the reported screenshot, tested after JPEG compression. It confirms a decodable image with v2.0.10's failing gray-pixel ratios now routes to ERRORS **while remaining visible in both JPEG and HTML**; broken URL Singles also remain in ERRORS. The test suite validates NO IMAGE placeholder pixels, preservation of detected NO IMAGE Singles in review JPEG and HTML, the valid Single-only iframe-error fallback, and the six date-serial values from the original screenshot, Single URL reconstruction conditions, mock error workbooks, and actual pixel-generated JPEGs. The source-only environment cannot confirm real Yahoo URL existence, live Rakuten iframe downloads, or a real ExcelJS `.xlsx` serialization; validate those on Windows with dependencies installed.
- Run **Test 3 products** first to validate the renderer, but remember it intentionally excludes invalid iframe rows. Use a small controlled full batch to verify `#VALUE!` Single-only fallback. Confirm corrected URLs point to the **right product**, not merely to a decodable image.

See `docs/NO_IMAGE_RETAIN_V212.md`, `docs/YAHOO_NO_IMAGE_V211.md`, `docs/SINGLE_NO_IMAGE_QC_V210.md` and `docs/DATE_SKU_RECOVERY_V209.md`. Earlier v2.0.8 single-only rules are superseded.
