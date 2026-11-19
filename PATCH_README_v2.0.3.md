# Rakuten Combine Batch Standalone v2.0.3 patch from v2.0.2

1. Keep a backup of your original v2.0.2 project directory.
2. Close the Rakuten Combine Batch app.
3. Extract **all contents of this patch ZIP directly into your existing v2.0.2 project folder**, overwriting matching files and retaining the added `src/core/directJpegRenderer.js` and `src/core/imageDownload.js`.
4. Run `START_DEV.cmd` to start the updated source or `BUILD_PORTABLE.cmd` to rebuild the portable Windows EXE. A prebuilt EXE is not included.
5. Choose your Excel workbook, click **Test 3 products** and inspect HTML + JPEG in the separate `COMBINE_TEST3_*` folder. Click **Generate full batch** only when satisfied.

Version 2.0.3 eliminates the failing hidden-Chromium JPEG screenshot/geometry validation for Existing Brand, replacing it with Sharp direct image composition. It marks JPEG failures FAILED and stops a full batch after five consecutive JPEG errors. New Brand manual Combine is unchanged.

Run `npm run validate` for the automated checks. See `RELEASE_NOTES_v2.0.3.md` and `docs/DIRECT_JPEG_LAYOUT_QA.md`.
