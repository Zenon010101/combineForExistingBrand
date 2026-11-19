# Exact mapping for supplied `rak1-normal-item.xlsx`

This workbook's first row is `A1 = 商品管理番号（商品URL）`, `B1 = 商品番号`, `C1 = blank`, `D1 = whitespace`, `E1 = blank`.

Actual product row example:

- A2: `abu-90`
- B2: `ABU-90`
- C2: `<iframe src="https://www.rakuten.ne.jp/gold/glv/six/asobu/ABU-90.html" ...></iframe>`
- D2: ` ` (reserved for full HTML code)
- E2: `https://item-shopping.c.yimg.jp/i/n/glv_abu-90` (Single, remote image URL with no extension)

The new app **does not need** a `SINGLE IMAGE PATH` header. It detects E from the image URL values. The user does not have to move any columns.

## Result workbook

| A | B | C | D | E | F | G | H+ |
|---|---|---|---|---|---|---|---|
| Item ID | SKU | iframe | **OUTPUT full HTML** | **Original Single URL** | HTML FILE LINK | JPEG FILE LINK | QC / warnings |

The exact iframe, Single URL, item IDs and SKU are preserved; output files are linked from the same row. No new summary sheet is created. The original Excel is never overwritten.

## Data problems

The supplied workbook contains 6,818 rows with iframe HTML and 940 rows where C contains `#VALUE!`. The invalid rows remain in the results workbook and get `FAILED` in the QC columns, explaining which source cell needs repair. These cannot yield a complete Line Up/Details output without a valid iframe source.

## Image rules

- HTML width 780px: optional full-width Single from E, 15px gap, Line Up 2 columns, DETAILS 28px, Details 3 columns.
- JPEG width 600px: optional Single from E, 15px gap, Line Up 2 columns, DETAILS 28px, Details 2 columns.
- Direct remote URLs such as Yahoo `.../i/n/glv_abu-90` are valid even without `.jpg`.
- No source-image-folder download or Photoshop dependency.
- If Single is present but the image cannot load, the JPEG is not published silently without it; the row is marked for review.
