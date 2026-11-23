# Patch v2.0.8 from v2.0.7

Patch only applies to Rakuten Combine Batch **v2.0.7**. Extract patch files over the v2.0.7 project root, preserving their relative paths. Do not apply over BrandForge or Rakuten Combine v2.0.5/v2.0.6.

Changed: batch output gating, no-Single-only Combine builder, headerless/missing iframe Excel recognition, errors-only classification, test cases, version display, documentation. There are no removed files in this patch.

Run `npm install` if dependencies are missing, then `npm run validate`; start with `START_DEV.cmd` or build portable Windows EXE using `BUILD_PORTABLE.cmd` on a Windows machine.

The original source Excel is never modified. Existing older output folders are not edited/deleted: rerun v2.0.8 to get new compliant results.
