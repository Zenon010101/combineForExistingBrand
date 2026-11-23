# v2.0.12 PATCH from v2.0.11

Extract over a **clean v2.0.11 source project**, preserving relative paths, and replace matching files. The patch changes behavior for detected NO IMAGE Singles **only**: keep the downloaded Single graphic in the error JPEG/HTML, but mark `SINGLE_NO_IMAGE` and retain ERRORS routing. It also fixes a test file shipped with v2.0.11, updates user-visible rules, and includes new regression tests. All original layout and SKU-date behavior remains. For users who have older versions or a different source layout, use the full v2.0.12 project instead.

Run `npm run validate`, then `START_DEV.cmd` and regenerate a new batch. If using the portable EXE, rebuild with `BUILD_PORTABLE.cmd`; source updates do not replace an existing EXE. See `RELEASE_NOTES_v2.0.12.md` and `docs/NO_IMAGE_RETAIN_V212.md`.
