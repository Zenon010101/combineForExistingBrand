# Rakuten Combine v2.0.10 patch (from v2.0.9)

Apply this patch only to an extracted **v2.0.9 full project**. Copy all patch files into the original project folder and replace matching paths. Do not delete your real source Excel or generated batch folders. Use the new Full Project ZIP if unsure of the installed version.

v2.0.10 detects gray "NO IMAGE" Single placeholders, excludes confirmed placeholders from JPEG and HTML, preserves valid Details as Combine under ERRORS, and retains valid Single-only error previews for broken iframe rows. Excel date/SKU recovery is unchanged.

Verification: `npm run validate`; use a controlled workbook on Windows to verify live Yahoo placeholder URLs and the actual ExcelJS errors workbook. Do not rely on old v2.0.9 outputs to move themselves; rerun affected rows with the new version.
