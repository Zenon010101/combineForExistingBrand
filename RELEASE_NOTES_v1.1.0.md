# Standalone Combine Batch v1.1.0 — Single URL + HTML hotfix

Previous problem: v1.0.0 expected a local Single image filename ending in `.jpg` / `.png` and intentionally did not insert Single into HTML. The user's Yahoo URL `https://item-shopping.c.yimg.jp/i/n/glv_abu-90` has no image extension and was rejected or ignored.

Corrected:
- Supports HTTPS Yahoo item-shopping Single image URLs without extensions.
- Supports Single URL/header text and hyperlink cells in Excel; detects Single immediately left of IFRAME even with no header.
- Inserts remote Single at the **top of the 780px HTML code** before Line Up.
- Also inserts remote Single at the **top of the classic 600px JPEG**.
- Keeps 2-column HTML Line Up, 3-column HTML Details, 2-column JPEG Line Up, 2-column JPEG Details.
- Accepts local Singles for JPEG only and explicitly warns that a local Windows path cannot be published in HTML.
- Flags invalid/missing Singles without silently generating a no-Single JPEG.
- Keeps same-row Excel OUTPUT, HTML and JPEG links, automatic save beside Excel and remembered input/output locations.
- BrandForge unchanged.

Automated regression suite includes mocked remote URLs, iframe parsing, 1000 rows, and Excel hyperlink handling. Live website responses and native Windows Electron capture remain unverified.
