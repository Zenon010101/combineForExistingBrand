# v2.0.9 — Date-converted SKU protection and error-only Single previews

## Why `Mar-90` became `32933`

In the 1900-date Excel system, `1990-03-01` has serial number `32933`. If an SKU was entered as `MAR-90` but Excel converted it into a date, a string formula may concatenate that serial into the Yahoo URL (`glv_32933`) instead of `glv_mar-90`.

| Display | Actual Excel date | Date serial | Candidate intended SKU |
| --- | --- | ---: | --- |
| Mar-90 | 1990-03-01 | 32933 | MAR-90 |
| Mar-93 | 1993-03-01 | 34029 | MAR-93 |
| Mar-94 | 1994-03-01 | 34394 | MAR-94 |
| Mar-96 | 1996-03-01 | 35125 | MAR-96 |
| Mar-97 | 1997-03-01 | 35490 | MAR-97 |
| Mar-99 | 1999-03-01 | 36220 | MAR-99 |

**Crucial distinction:** `glv_32933` is not necessarily a valid product Single image; it can be a broken URL created by Excel. It is unsafe to use its numeric suffix as the SKU blindly.

## Recovery safety

- Inspect the original A/B Excel cell values and number formats (`mmm-yy`, etc.) *in memory*. The original workbook stays unchanged.
- First prefer a Rakuten iframe filename that agrees with the date-formatted SKU (`.../MAR-90.html`). If iframe is `#VALUE!`, a displayed month-year SKU + an exact Yahoo date-serial suffix can still be used to reconstruct a **candidate** `glv_mar-90` URL.
- When the evidence agrees, save output under a recovered SKU filename and try the corrected Yahoo URL. Add `SKU_EXCEL_DATE_RECOVERED` / `SINGLE_DATE_SERIAL_REPAIRED`, and keep the original and corrected links in the errors-only workbook.
- If the iframe contradicts the SKU/date or date evidence is not explicit, do not rewrite a suspect serial-number Single automatically. Add `SKU_DATE_UNRESOLVED` / `SINGLE_DATE_SERIAL_SUSPECT` for manual review.
- Ordinary numeric Yahoo IDs without confirming date evidence are never rewritten.
- **A repaired URL is not necessarily real:** failed HTTP/download/decode still becomes `SINGLE_BROKEN`. Human verification is needed to ensure the pixels actually match the SKU.

## Single-only when the iframe has errors

If the iframe is `#VALUE!`, blank, inaccessible, or has no usable image URLs, but there is a **valid** Single, generate the 600px Single-only JPEG and matching local HTML under `ERRORS`. Mark `NO_VALID_DETAILS` and `SINGLE_ONLY_IFRAME_ERROR`. This is for error review; the HTML snippet is **not** copied into the normal Rakuten OUTPUT cell.

With 1+ valid Details, keep the old full Combine (Single at top when valid, 15px gap, two-column gallery). Broken details are skipped and reflowed in their original order. Without any usable images there is no fake output.

## QC and output

- The only production gate for PASSED is zero issues and a verified JPEG/HTML pair. Recovered URLs remain in ERRORS even if visually complete until reviewed.
- `COMBINE_ERRORS_ONLY.xlsx` contains clickable source iframe and Single links, effective corrected Single URL, source SKU A/B, recovery method and output file links.
- `BATCH_REPORT.json` contains `skuDateRecoveredCount`, `singleDateUrlRepairedCount`, `singleOnlyErrorOutputCount`, plus per-row original/effective URLs and issue codes.
- The batch does not retroactively remove old v2.0.8 outputs. Rerun to generate outputs under the new rules.

See tests in `test/sku-date-recovery-v209.test.js` and `test/no-single-only-v208.test.js` (historically named regression file, updated to v2.0.9 expectations).
