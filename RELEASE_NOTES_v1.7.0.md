# Rakuten Combine Batch Standalone v1.7.0 — One-Boundary Line Up Fix

**Base:** v1.6.0 Standalone. No changes to BrandForge or Rakuten Converter Electron v2.

### Root causes
- v1.6 stopped the OCR scan after a short unlabeled sequence and required *every* gallery image to have a readable color caption; any missed caption could truncate the group and incorrectly place later variations in Details.
- A source COLOR heading with OCR enabled could promote a long interval if only two captions were recognized. This could put genuine Details images in Line Up.
- A creative photo with an isolated color word could be stitched to a later real lineup if a gap-bridge were too permissive.

### Fixes
- Global gallery section detection instead of an independent image-by-image classification; one contiguous Line Up followed by Details.
- Bounded 4-image OCR lookahead beyond last candidate color label, with no reordering; stop early when no credible group is found.
- One missing *internal* color label can be bridged only with **two distinct confirmed prior colors plus another verified variation immediately afterward**, no positive Detail text, and no incompatible product silhouette. Such cases explicitly become REVIEW.
- A feature/specification caption is a hard Details boundary; 2-cut and 4-cut patterns alone remain non-authoritative.
- A source COLOR heading with live image OCR can promote an interval only when all members are verified variants; original no-OCR HTML heading behavior is preserved for compatibility.
- Classification report now records `boundaryAfter`, `verifiedOcrCount`, `bridgedCaptionPositions`, `boundaryUncertain`, and an image-level section assignment where inspected.
- Includes approved ADI-8 Combine reference image and ten new regression tests, including 14 colorways + 9 Details, and one OCR miss.

### Preserved
- Excel C=iframe, D=HTML, E=Single, existing `LINEUP COUNT` override, 600px two-column JPEG, 780px HTML with 2-column Line Up and 3-column Details, creative prefix, 28px Hiragino Kaku Gothic Pro W3 DETAILS, original image URL order, portable build commands.

### Validation
- `npm run validate` passes on Node 22 with global Sharp available in the build environment.
- **Important:** The supplied screenshots show the target output but are not the original per-image OCR input. Live Rakuten GOLD sources were inaccessible in this environment. This is a source-code patch, not a verified Windows binary or 100% reliable visual classifier. Any `REVIEW` result must be checked before publishing.
