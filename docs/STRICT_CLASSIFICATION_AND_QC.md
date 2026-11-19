# Strict Combine classification and operator review

## Desired output order (HTML and JPEG)

1. Optional Single image from the original Excel row. In `rak1-normal-item.xlsx` it is Column E, including extensionless Yahoo URLs such as `https://item-shopping.c.yimg.jp/i/n/glv_abu-90`.
2. Line Up / color variations only when evidenced by variation headings, repeated color labels in source markup, and a corroborated image sequence. Repeated silhouettes alone are not sufficient in v1.6.0.
3. A 28px DETAILS heading if any details exist.
4. All Details images in original order.

If no verified variation group exists, skip Line Up; bring Details directly under Single. If no Details exist, omit the heading. Read embedded source-image captions using local Japanese/English OCR without modifying, erasing, cropping or editorially changing the exported source images.

## Reported examples

- **Sandals**: multiple angles of the same beige sandals with size/discount labels are **DETAILS**, not different color choices. Strict fallback should assign zero Line Up images when no distinct variations are proven.
- **Suitcase**: green, blue, black, navy, white, yellow, gray, brown, teal and pink upright suitcases in the same product pose constitute a likely color-variation group. The manufacturer detail shots, internal dividers, handles, wheels and zipper are **DETAILS**. Text labels may be embedded in the source images; no text removal.
- **Bottle**: hero/promo collage, lifestyle photos and image captions describing 460ml or usage are **DETAILS** unless they are actual color-selection images. Incidental text is never a variation marker by itself.

The JPEG retains the **old Combine 600px / two-column** layout. The HTML retains **780px / Line Up 2 columns / Details 3 columns**. Single remains on top of both.

## Automated rule priority

1. Explicit `LINEUP COUNT` supplied by the operator in Excel (`0` means no Line Up).
2. Clear `COLOR VARIATION`/`LINE UP` and `DETAILS` source headings.
3. Three or more repeated, dedicated color captions in HTML directly after an image.
4. In-memory silhouette and 2/4-cut layout checks can support **captioned** color variation candidates. They must not promote a source image by themselves; many Details show repeated product angles on white backgrounds. Full source-image OCR is mandatory before interpreting a bottom color label as a variation when OCR is available.
5. Anything not confirmed goes to **DETAILS** and gets **REVIEW**. Images with small textual labels, white backgrounds, or `.png` extensions are not automatically Line Up.

No automatic method can infer every visual category perfectly; inspect REVIEW items before publishing. The app never downloads the images as separate source files; classification inspects only bounded memory buffers and generated HTML/JPEGs are saved as final output.

## Correct REVIEW rows quickly

1. Open the generated `*_COMBINE_RESULTS.xlsx` in the output directory.
2. Find `STATUS = REVIEW`. The workbook shows `DETECTED LINE UP`, `DETECTED DETAILS`, `SPLIT METHOD`, and `REVIEW / ERROR`.
3. Enter the **verified number** of leading source images which are color variations in the editable `LINEUP COUNT` column. Enter `0` to put all images in Details. Leave it blank for automatic classification.
4. Save the results workbook, close Excel, and drop that saved workbook back into the standalone app. It starts immediately and creates a **new** subfolder beside the workbook; it does not overwrite the previous run.
5. Check the new HTML and JPEG links; do not upload/publish any REVIEW rows before manual QC.

The original Excel input and all older generated files are preserved. **Clear previous work** in the app resets current UI/logs/last output shortcuts only. It retains your last visited Excel folder and does not delete project files.
