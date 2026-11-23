# v2.0.10: Single NO IMAGE detection

## Why v2.0.9 let broken Singles pass

Yahoo image endpoints may return HTTP 200 with a perfectly decodable **gray NO IMAGE placeholder**, not a product photograph. v2.0.9 only checked if more than 99.8% of Single pixels were white, so gray pictograms were counted as valid images. Those rows could wrongly be put into `PASSED`.

## v2.0.10 processing

1. Download and decode the Single using the existing host allowlist and Sharp pipeline. Never trust a successful HTTP status alone.
2. Exclude nearly-all-white Singles (`SINGLE_BLANK_REVIEW`); do not include them in either output.
3. Check whether a Single is a very pale, almost entirely grayscale image with centered illustration and caption geometry. This is a cheap pixel check (160x160), so colorful product pictures do not consume OCR.
4. For gray candidates, optionally use bundled English Tesseract OCR to confirm the text `NO IMAGE`. An unambiguous standard gray icon/caption geometry can also confirm a placeholder when OCR cannot read tiny lettering. Exclude confirmed placeholders (`SINGLE_NO_IMAGE`).
5. If the image resembles a placeholder but is not conclusively identified, **do not classify PASSED**. Mark `SINGLE_PLACEHOLDER_REVIEW` with the original URL for manual review. A possible placeholder is preserved for inspection; a confirmed one is removed.
6. Rebuild **one immutable output plan** from surviving valid Details plus surviving valid Single. The JPEG and HTML must use exactly that same selection. The deleted Single must not remain in either the JPEG or an HTML `<img>` link.
7. Record `SINGLE_NO_IMAGE` in `COMBINE_ERRORS_ONLY.xlsx` -> `SINGLE_ERRORS`, plus the original Single URL, iframe, source sheet/row, JPEG/HTML output paths, and the relevant issue details.

## Routing examples

| Single | Iframe details | JPEG / HTML | Routing |
|---|---|---|---|
| Good | Good | Full Single + 2-column Details | PASSED if no other warnings |
| Gray NO IMAGE | Good | 2-column Details, no Single | ERRORS |
| All-white | Good | 2-column Details, no Single | ERRORS |
| Broken URL | Good | 2-column Details, no Single | ERRORS |
| Good | `#VALUE!`, empty, or no usable Details | Single-only preview | ERRORS |
| NO IMAGE | `#VALUE!` or no usable Details | No usable output, report only | ERRORS |
| Good | Valid Details but JPEG height >3800px | Uncropped full Combine | ERRORS |
| Uncertain gray | Good | Preserve image for manual inspection | ERRORS |

Existing Brand only. Source order and two-column layout stay unchanged. Excel date/SKU recovery, approved domains, and original XLSX non-mutation remain unchanged. The v2.0.9 requirement to retain **valid** Single-only outputs for broken iframe rows remains in force.

## QA and limits

`test/single-no-image-v210.test.js` verifies both positive/negative pixel samples, OCR fallback behavior, actual JPEG/HTML exclusion, passed/errors routing, and Single-only error fallback. The test suite injects OCR responses, while local Tesseract CLI independently reads the generated test image as `NO IMAGE`. This is not a live Yahoo integration test: the real user's uploaded screenshot does not contain the original full-resolution Single files. Some visually different CDN placeholders may require adding more signature examples after Windows testing.
