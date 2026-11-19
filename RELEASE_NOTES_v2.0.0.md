# Rakuten Combine Batch Standalone v2.0.0 - Two-Mode Redesign

## Existing Brand
- Removed automatic Line Up vs Details classification from the batch production path.
- Source iframe image sequence is preserved without a generated DETAILS label.
- All images in one max-two-per-row flow layout: preserve native size when it fits; wrap the second image downward when it does not.
- The only proportional downscale happens if a single image is wider than the entire available canvas.
- 600px JPEG, 780px HTML, dynamic height, 8px X / 7px Y gaps, 3px JPEG margin and optional 600px Single with 15px gap.
- Retained actual C=iframe, D=HTML, E=Single workbook mapping, HTML/JPG output, cancellation, report logs and source-file preservation.
- The obsolete LINEUP COUNT value is read for backwards compatibility but deliberately ignored in Existing Brand mode.

## New Brand
- Added a separate tab: manual Single, Line Up and Details upload with drag/drop and up/down ordering controls.
- Added optional editable color captions, with 1-item, 2-item horizontal and 2-item vertical modes.
- Copied original BrandForge Combine geometry, visible-bounds measurement, PSD Smart Object compositor, Windows Photoshop COM bridge and output publishing. No OCR/text cleanup or source text removal.
- Added 600px live layout guide. JPEG and layered PSD/PSB are produced together by Photoshop on Windows.
- Added name validation, input source mutation protection, and automatic version-safe output naming.

## Verification
- 76 Node.js source/unit/mock tests pass.
- JPEG wrapping layout verified by pure geometry tests, but automated Chromium screenshot could not run in this container.
- Windows executable and real Photoshop generation are **not** verified in this environment.
- Verify generated HTML inside Rakuten because its editor may reject CSS display/flex rules.

## Compatibility
- Project is Rakuten_Combine_Batch_Standalone, not the Rakuten Converter v2 and not BrandForge.
- No original brand source images, original Excel files, or original BrandForge project were edited.
