# Patch 2.0.0 -> 2.0.1 (Rakuten Combine Batch Standalone)

Apply **only** over the full Rakuten_Combine_Batch_Standalone v2.0.0 source folder.
Extract the files at the project root, overwriting matching files. Do NOT apply to
Rakuten Converter Electron v2, BrandForge, or any older v1.x Combine project.

Changes: strict 2-column Existing Brand in 600px JPEG and 780px HTML;
fixed 293px JPEG and 386px HTML image columns; 8px horizontal / 7px
vertical gaps; 3px outer JPEG margin, 15px after optional Single.
No image cropping/stretching/upscaling. Oversized image sources are uniformly
fitted only to their standard column. Source order is unchanged.

The JPEG exporter validates the actual rendered two-column geometry before
saving. If it cannot confirm two columns, generation reports an error rather
than publishing a broken image. New Brand mode is untouched.

Run `npm run validate` (78 unit/mock tests passed here) and then test the
Windows portable build, JPG output, and HTML in the Rakuten editor.
