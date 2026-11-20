# Patch Rakuten Combine Batch v2.0.6 → v2.0.7

1. Make a backup of the existing v2.0.6 project folder.
2. Extract this patch ZIP into the **root** of the v2.0.6 project folder, replacing files where prompted. Preserve relative subfolders `src/`, `test/`, and `docs/`.
3. Confirm `package.json` says `2.0.7` and the UI title says v2.0.7.
4. Run `npm run validate`, then `START_DEV.cmd`. On Windows, build a portable EXE with `BUILD_PORTABLE.cmd` if required.
5. Run **Test 3 Products** and inspect both PASSED and ERRORS folders before a full batch.

The patch only adds/updates files listed in the ZIP. No New Brand files are added. Do not apply this patch to v2.0.5 or the BrandForge project.
