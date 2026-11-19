# Patch — v2.0.3 → v2.0.4

This is for **Rakuten_Combine_Batch_Standalone**, NOT BrandForge or Rakuten Converter Electron v2.

1. Back up your existing v2.0.3 project directory.
2. Extract the changed files in this patch into the root of that project, preserving the `src`, `test`, and `docs` subdirectories. Replace files when prompted.
3. Run `START_DEV.cmd` or `npm run validate` once dependencies are installed.
4. Open **New Brand**, choose Single / Line Up / Details, select output folder, and click **Generate JPEG + HTML**. Optional PSD/PSB is a separate checkbox requiring Photoshop.
5. Check that both `NAME.jpg` and `NAME.html` appear in the chosen folder and that opening HTML locally displays the JPEG. For Rakuten upload, host the JPEG first and replace the HTML relative image path with its HTTPS URL.
6. Folder memory is in the Electron userData directory and is separate from Existing Brand memory. Clear Folder Memory resets only paths, not output files.

Existing Brand behavior is unchanged. This patch contains source changes, **not** a precompiled EXE. The Photoshop/Windows build must be tested on the workstation.
