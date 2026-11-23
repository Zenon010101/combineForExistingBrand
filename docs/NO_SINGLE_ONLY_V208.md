# v2.0.8 — A Combine must have at least one valid iframe Detail image

**New rule:** No Single-only JPEG/HTML in PASSED or ERRORS. Even if a Single URL works, its image alone is *not* a Combine. Single URLs remain in `ERRORS/COMBINE_ERRORS_ONLY.xlsx`, along with the source worksheet, row, original iframe source, error reason and available output links.

## Output matrix

| Iframe Details after validation | Single | JPEG/HTML | Folder / report |
|---|---|---|---|
| 1+ valid | valid | Full Combine: Single + two-column gallery | PASSED if no issues, else ERRORS |
| 1+ valid | broken | Details-only two-column Combine, no Single | ERRORS |
| 1+ valid, some broken | valid or broken | Partial Combine with surviving Details in source order | ERRORS |
| 0 valid, iframe `#VALUE!` / `#REF!` | valid or broken | **No JPEG/HTML** | ERRORS Excel; `IFRAME_ERROR`, `NO_VALID_DETAILS` |
| 0 valid, iframe C cell empty and E has Single | valid or broken | **No JPEG/HTML** | ERRORS Excel; `IFRAME_ERROR`, `NO_VALID_DETAILS` |
| 0 valid, all Detail URLs broken | valid or broken | **No JPEG/HTML** | ERRORS Excel; `DETAIL_IMAGE_BROKEN`, `NO_VALID_DETAILS` |
| 1+ valid, Single nearly all white | flagged for manual QC | Combine still generated; avoid false positives for white products | ERRORS / `SINGLE_BLANK_REVIEW` |

The output JPEG remains 600px wide with the same gap, proportions and ordering rules. HTML stays 780px-wide and uses the exact surviving Detail URL list. A real Single URL alone never authorizes export.

## Excel behavior

In Rak1 C/D/E format, C is iframe, D is output HTML, E is the Single URL. The original workbook is not modified. `NO_VALID_DETAILS` appears in the `IFRAME_ERRORS` tab as well as `ALL_ISSUES`. The `IFRAME SOURCE` column retains `#VALUE!` where appropriate; the `SINGLE URL / PATH` column retains E. Missing C with a product identifier and Single E is reported, not skipped. JPEG/HTML links remain empty for no-Details products.

## Important limitation

The blank-Single detector only flags nearly-all-white images. A remote image containing the words **NO IMAGE** may be a valid, decodable bitmap and is not automatically recognized as a placeholder. Such cases require a separate supported placeholder detector; this update only prevents *Single-only exports* when no valid iframe Details remain.

## Tests

`test/no-single-only-v208.test.js` verifies #VALUE! / blank iframe / all detail URLs broken with valid Singles. Existing v2.0.7 geometry tests still verify no resizing/cropping and correct PASSED/ERRORS two-column placement.
