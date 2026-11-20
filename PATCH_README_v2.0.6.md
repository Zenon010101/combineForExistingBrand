# Patch Rakuten Combine Batch v2.0.5 → v2.0.6

- Patch includes only new and changed project files; existing files not listed are preserved.
- No New Brand module is included or restored.
- Back up the v2.0.5 folder; unzip the patch **contents** over the matching project source folders. Overwrite changed files.
- Run `npm run validate`, then `START_DEV.cmd` to verify Test 3 before a full batch.
- Existing outputs and original Excel workbooks are **not deleted or moved** by the patch. New generations use `PASSED` and `ERRORS` subfolders instead of root-level HTML_FILES/JPEG_FILES.
- The supplied ZIP is source, not a prebuilt Windows EXE. If needed, use `BUILD_PORTABLE.cmd` on Windows after installing dependencies.

## Changed/new source files

- `PATCH_README_v2.0.6.md`
- `README.md`
- `RELEASE_NOTES_v2.0.6.md`
- `docs/BROKEN_IMAGE_QC_V206.md`
- `package.json`
- `src/core/batch.js`
- `src/core/directJpegRenderer.js`
- `src/core/errorWorkbook.js`
- `src/core/excel.js`
- `src/core/existingBrand.js`
- `src/main.js`
- `src/preload.js`
- `src/renderer/app.js`
- `src/renderer/index.html`
- `test/batch-v203.test.js`
- `test/batch.test.js`
- `test/broken-image-qc-v206.test.js`
- `test/existing-brand-v202.test.js`
