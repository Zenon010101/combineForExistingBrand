# Patch v2.0.11 from v2.0.10

Extract the patch ZIP over your **v2.0.10 full project source folder**, preserving the relative paths, and overwrite matching files. It includes the detector fix, small reference artwork, regression fixture, tests, and release notes. Do not apply this patch to older versions directly; use the full project ZIP instead. For an already built Windows portable EXE, rebuild with `BUILD_PORTABLE.cmd`; a source ZIP patch will not alter the old EXE.

**Confirmed fix:** Actual Yahoo gray "NO IMAGE" image from the user's screenshot is now flagged `SINGLE_NO_IMAGE`. With valid Details, generate a Details-only two-column JPEG + HTML under ERRORS. Genuine Single URL failure is `SINGLE_BROKEN`, also ERRORS. Valid Single + broken iframe keeps Single-only review output under ERRORS. Original Excel and v2.0.9 Excel-date SKU recovery remain intact.

Check app header for **v2.0.11**. Run `npm run validate` and regenerate a new batch; old PASSED outputs are not modified. For reproducibility and changed files see `PATCH_MANIFEST_v2.0.11.txt` and `RELEASE_NOTES_v2.0.11.md`.
