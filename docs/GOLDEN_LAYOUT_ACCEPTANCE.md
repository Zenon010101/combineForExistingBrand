# Approved layout reference and acceptance criteria (v1.7.0)

Visual ground truth: `ADI-8_APPROVED_OUTPUT_REFERENCE.jpg` (supplied as the correct final Combine result).

**Order is fixed:** Single image from Excel column E (if present), then exactly one continuous color Line Up section, then one DETAILS heading if there are Details, then all remaining detail images. No image is reordered or merged with a different source image. A short promotional source creative may remain above Line Up, without creating an extra named section.

## Verified screenshot counts

- **ADI-8**: 1 Single, **14** captioned Japanese shoe colorways in Line Up (7 two-image rows), then **9** unlabeled shoe-angle/sole/detail photographs (four two-image rows plus a last one-image row). DETAILS appears precisely between the 14th variation and the first Detail photo.
- **ABY-71**: 9 labeled towel colorways, including final `997 VOLCAN`; do not move the 9th into Details merely to make the 2-column grid even.
- **ABY-70**: 4 labeled combination-color groups; DETAILS follows the fourth group, not before the variations.

## Classification behavior

1. Read complete original image text, not just the bottom caption, and treat feature text as a hard Details signal.
2. Look for a continuous **section** of Japanese/English color captions; horizontal/vertical/4-cut source layouts only support the decision, they cannot create a Line Up by themselves.
3. Permit **one unreadable internal caption** only when at least two distinct preceding variation labels are already confirmed and a positive labeled variation follows it. Flag the rescued image as REVIEW (do not silently call it guaranteed).
4. Never infer a missing *last* variation using similarity alone; if the boundary remains uncertain, keep the image in Details and mark REVIEW. A human can enter the exact `LINEUP COUNT` in the results workbook and re-run.
5. Never accept a source COLOR heading as permission to pull all photos through DETAILS when the original image OCR has not confirmed those members.
6. The order `Single → Line Up → DETAILS` must never alternate back to Line Up; only one boundary is allowed.

## Important QA limitation

The approved JPG is a **combined output**, not the individual source photos. Therefore it documents the correct target ordering, but does not prove local OCR on the original remote Rakuten JPEGs. The public GOLD HTML sources were not accessible from the build environment. Regression tests use representative captions, OCR-miss conditions and image shape signals, not live end-to-end Rakuten OCR. Validate with real iframe URLs on a Windows build PC, especially before bulk deployment.
