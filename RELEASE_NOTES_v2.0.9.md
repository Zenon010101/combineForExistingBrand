# Rakuten Combine Batch v2.0.9 — Excel SKU date protection + iframe-error Single fallback

Built from v2.0.8. **Existing Brand only**. No BrandForge changes.

1. Date-styled A/B SKU columns are inspected without modifying the source workbook. In the reported sample `MAR-90`, `MAR-93`, `MAR-94`, `MAR-96`, `MAR-97`, `MAR-99`, Yahoo Single suffixes `32933`, `34029`, `34394`, `35125`, `35490`, `36220` are exactly the corresponding Excel serial dates. A verified repair may use `glv_mar-90` instead of `glv_32933` and recover the file ID from the Rakuten iframe, or from a consistent date display + serial when the iframe is broken.
2. Repairs are **marked REVIEW**, not silently PASSED. If SKU/date evidence conflicts with the iframe, do not auto-repair a suspect Single; preserve the original URL and mark the row for review. A repaired URL can still return 404 or the wrong product and should be reviewed.
3. For iframe `#VALUE!`, blank, HTTP failure, or all failed Details, a valid Single again generates `SKUcombine.jpg` and `SKU.html` under ERRORS. The error-only Single output is marked `SINGLE_ONLY_IFRAME_ERROR`, is review-only, and is excluded from the Rakuten OUTPUT HTML cell. Valid Details always produce the same two-column layout as before. With no usable pixels, there are no fake outputs.
4. The errors-only Excel now adds original source SKU A/B, recovery method, and actual Single URL used, alongside the original iframe and Single links. Main results Excel and JSON report include the same metadata. The app reports counts of recovered SKUs and corrected Single URLs.
5. Preserves the 3800px height QC, source-order 600px JPEG and 780px table HTML, test 3/full batch, error folder structure, download safety, and Existing Brand-only UI.

The `docs/NO_SINGLE_ONLY_V208.md` describes v2.0.8 historical behavior; v2.0.9 supersedes it.

**Limitations:** External Yahoo/Rakuten URLs and ExcelJS writer must be verified on the production Windows installation. A successful rewritten URL is a candidate, not proof it references the intended product. A decodable `NO IMAGE` placeholder remains a separate visual-QC task.
