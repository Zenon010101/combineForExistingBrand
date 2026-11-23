# Patch v2.0.9 from v2.0.8

Apply **only** to Rakuten Combine Batch Standalone v2.0.8. Extract the patch ZIP **inside the existing project folder**, preserving relative paths, or use the v2.0.9 Full Project ZIP for a clean installation. Do not apply to BrandForge, older v2.0.x versions, or an arbitrary directory.

Changed/new source: `src/core/skuRecovery.js` (new), `excel.js`, `batch.js`, `combineOutput.js`, `errorWorkbook.js`, renderer UI/logs, package version, updated source tests, and new date-SKU tests. Release notes/docs updated. Existing historical v2.0.8 docs remain for reference; see `docs/DATE_SKU_RECOVERY_V209.md` for current rules.

After applying, run `npm run validate` (requires npm dependencies), then launch with `START_DEV.cmd` or build with `BUILD_PORTABLE.cmd` on Windows. The project ZIP is source code and does not contain a prebuilt portable EXE.

The original input workbook and old batch output folders are not overwritten. Every new run creates its own PASSED/ERRORS directory beside the input Excel.
