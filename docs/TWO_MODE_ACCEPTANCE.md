# Acceptance and QC - v2.0.4

## Existing Brand — strict 2-column acceptance
- [ ] Single is the ONLY full-width image and touches canvas top, left and right (0px outer margin). Its height is proportional to the source, not forcibly square; it is followed by a 15px gap.
- [ ] Every gallery image after Single occupies one of two fixed columns: 293px + 8px + 293px at 600px JPEG width.
- [ ] In 780px HTML there is one fixed table with two 390px table cells per gallery row; 4px inside padding on each side gives two 386px image areas and an 8px gap.
- [ ] With 5 images: 1/2, 3/4, then image 5 in the LEFT column; no full-width rows or generated blank image.
- [ ] With original 310px and 290px sources: two images in the same row. The 310px source fits down proportionally to 293px; the 290px image is not upscaled or resized to match it.
- [ ] With original 800px source: proportional fit to 293px JPEG column, not full-canvas width, and no crop or image distortion.
- [ ] Dynamic row heights follow the taller image in each row. Every new row starts after a 7px gap; no overlaps.
- [ ] Confirm all images remain in their original iframe order, with existing text/captions unchanged, without a DETAILS heading or color OCR.
- [ ] HTML uses table/tr/td cells, not CSS flex-wrap. Validate in the actual Rakuten editor in case it strips inline style properties.
- [ ] Single-free products start immediately with the two-column gallery; no reserved blank Single region.
- [ ] For `https://item-shopping.c.yimg.jp/i/n/glv_abu-90` in Excel column E, output is **`abu-90.html` and `abu-90combine.jpg`**, and the HTML includes that exact Single URL above the gallery.
- [ ] Original Excel column C iframe, column D output and column E Single are not moved or overwritten incorrectly.
- [ ] A duplicate product ID never overwrites an earlier exported file; the duplicate row receives FAILED and an explanatory warning.
- [ ] The output contains no visible `DETAILS` text, no generated empty sections, no Line Up detection, and no source-image reorder.

## New Brand
- [ ] Upload optional Single and confirm 600x600 canvas area and 15px gap.
- [ ] Upload 1, 2, 3 Line Up images; odd final item stays in left slot and is not stretched.
- [ ] Add an English or Japanese color caption; check Hiragino Kaku Gothic Pro W3 28px JPEG and optional editable Photoshop text (requires locally installed Hiragino font for exact typography).
- [ ] Leave an image caption empty; verify no duplicate/blank caption layer is generated.
- [ ] Choose LEFT/RIGHT dual for a two-item picture; single intact full-width image with two captions.
- [ ] Choose TOP/BOTTOM vertical mode and adjust caption positions; original full canvas remains intact.
- [ ] Confirm Details are 293px boxes, 2 across, 8px horizontal / 7px vertical gaps.
- [ ] With Details only, DETAILS appears at the top. With Line Up + Details, DETAILS appears after the last Line Up with correct separation. With no Details, heading is omitted.
- [ ] Generate JPEG + HTML **without Photoshop**. Confirm HTML references each JPEG and opens beside them. Optional: select PSD/PSB on Windows and inspect editable Smart Objects/text.
- [ ] Re-run same filename: save a new version without overwriting existing generated files.
- [ ] Verify original JPG, PNG, TIF, PSD images are unchanged and no text cleanup stage exists. Unsupported nonimages are rejected with an actionable error.
- [ ] Import 24 images: after `Fitted 24/24`, observe `Rendering JPEG`, `Saved JPEG`, `Saved HTML`, then `DONE`, with real files present.
- [ ] Disable optional PSD and confirm 24-image JPEG + HTML output still succeeds without Photoshop.
- [ ] Force Photoshop failure with optional PSD enabled and confirm JPEG + HTML remain safely saved.
- [ ] Open the app again: Single, Line Up, Details, Output folder pickers remember their own paths. Clear memory must not delete source/output files.
- [ ] Same output name is versioned rather than overwritten, including its HTML and all JPEG strips.
- [ ] To publish inside Rakuten, replace local HTML relative image sources with public HTTPS URLs after uploading the images.

## Regression source products
- ADI-8, ABY-70, ABY-71 are useful sample products, but v2 Existing Brand does not attempt to reclassify their images.
- If iframe source order is incorrect, fix source HTML or use the New Brand manual workflow.

## v2.0.3 JPEG recovery acceptance
- [ ] Choosing Excel does NOT automatically start the full batch; the Test 3 and Generate full batch buttons are enabled.
- [ ] Test 3 runs the first 3 valid iframe rows and outputs into a separate COMBINE_TEST3 folder.
- [ ] Gallery JPEG uses direct Sharp compositor, not Chromium; the recurring `two-column gallery did not render correctly` error is no longer reachable in Existing Brand batch.
- [ ] Test Single at x=0, y=0, full width; 15px gap before 293px/293px two-column gallery.
- [ ] Inspect colored synthetic tests: smaller images are not enlarged, odd last image stays left; vertical gaps follow the tallest image in each row.
- [ ] If a source image is unreachable, HTML is preserved but JPEG status and row status are FAILED with a specific image error.
- [ ] A full run with 5 consecutive JPEG failures auto-stops, preserves all completed outputs, marks remaining SKIPPED, and reports stoppedReason.
- [ ] Confirm actual Rakuten/Yahoo downloads, app startup, ExcelJS parsing, 3 JPEG output files, and resulting HTML inside the destination Rakuten editor on Windows.
