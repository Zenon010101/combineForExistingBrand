# Rakuten Combine Batch v1.3.0 — Strict Line Up Routing + Clear Button

## Problem reported
The old iframe converter treated the first three images as Line Up when the source section boundary was unclear. For products without color variants (sandals and bottle promotional images), this incorrectly placed detail images above the DETAILS heading. For products with many genuine color variants (suitcase example), a fixed count also split the color group incorrectly. Some generated JPEGs showed large blank space below their actual content.

## Changes

1. **Removed arbitrary first-three-images fallback** from batch processing and the legacy split helper.
2. **Strict semantic classification:** explicit COLOR VARIATION / LINE UP source headings and repeated color captions can define a variation group; a DETAILS heading alone does not.
3. **Shape-based supplementary check:** when markup is insufficient, a bounded, in-memory comparison of original image silhouettes on light backgrounds can identify repeated color-variation views. .png, white background and text do not independently prove a variation.
4. **Conservative fallback:** unverified images go to DETAILS (and are flagged REVIEW in Excel) instead of potentially wrong Line Up positions. `LINEUP COUNT` allows manual correction, including zero, in the results workbook.
5. **Correct empty sections:** skip Line Up entirely when zero confirmed variants, and bring the full Details section up. Skip DETAILS heading when there are no details.
6. **Single remains first** in 780px HTML and 600px JPEG, read from Column E Yahoo URL or accepted local path, as previously fixed in v1.2.0.
7. **Clear previous work** button: reset selected workbook, progress, statistics, log, and recent result shortcuts without deleting files or forgetting the last Excel folder.
8. **JPEG height fix:** measure actual `main.bf-page` content rather than the previous reused Electron window's viewport, to avoid oversized blank tails.
9. **Separate standalone application; BrandForge untouched.** Output workbook saved beside source Excel, source files never overwritten.

## Design limits
Visual variation identification is an image heuristic, not guaranteed semantic understanding or OCR. No text is erased. Large, mixed-media pages can be ambiguous and will be marked REVIEW for user validation. Visual checks fetch image bytes into memory for analysis; no separate source image files are saved. A network failure means the classifier uses Details-first safety fallback. If the source page provides no reliable separation, operators should use the editable `LINEUP COUNT` column in a second run.

## Build

`npm install` then `npm run validate` and `npm run build:portable` on Windows.

JavaScript mock regression tests pass; native Electron photo capture and live public Rakuten/Yahoo data require a short Windows verification run before bulk publication.
