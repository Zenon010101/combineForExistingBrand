# Line Up image recognition using Slider Maker layout signals

## Positive evidence

- One original source image has horizontal two-cut (two items side-by-side), vertical two-cut (two stacked items), or four-cut (two by two) arrangement. Detection checks either light gutters OR clean full-bleed seams near the middle of the source image.
- Original image contains short Japanese/English color captions; text may be embedded at the bottom of each tile rather than directly below the whole image.
- Captions can be individual colors (`ホワイト`, `NAVY`), combined names (`Yellow x Black`, `イエロー/ブラック`), or branded numeric color names (`997 VOLCAN`). One combined name is ONE caption, not two separate variation images.
- Several consecutive captioned source images support a Line Up sequence. An unusually strong 4-cut image with at least three separate captions can be a Line Up of one source image.
- A short leading creative image can appear before the Line Up. Only when the following variation group is verified is that creative kept above the lineup. If it cannot be verified, originals remain in Details for review.

## Negative evidence

- A four-panel chart illustrating features, pocket locations, measurements, and fabric closeups is Details even though it has a 2x2 grid.
- 'Black zipper' or 'Red material' inside a feature description is not a Line Up color label.
- Geometry alone, file extension, the first few images, or image similarity alone cannot certify variations.
- One JPEG containing two side-by-side detail shots with no distinct isolated color captions remains Details by default.

## Output and QC

- Single (optional, supplied in Excel) > leading creative (optional, full width) > verified Line Up (2 columns) > DETAILS (28px Hiragino Kaku Gothic Pro W3 where available) > remaining Details (JPEG 2 columns, HTML 3 columns).
- Original source URL order is retained; no text erasure, image download folder, or item modification.
- One creative-prefix decision is automatically REVIEW and appears in BATCH_REPORT.json `introCount` field. Verify manually in result workbook and output JPG.
- `LINEUP COUNT` manual override continues to mean the number of initial source images in Line Up, as in v1.4.0. It does not let you explicitly set a creative prefix. Clear any override to use new automatic creative detection.
- Local OCR is heuristic; styled type, tiny fonts, colored backgrounds, dense collages, or different photo layouts can still be missed. The application must not silently claim 100% accurate classification.
