# Bundled OCR language data

`eng.traineddata.gz` and `jpn.traineddata.gz` are compressed English/Japanese Tesseract trained-data files, bundled for offline OCR language loading. Original model bytes were sourced from the environment's installed Tesseract 5 language-data set. Tesseract project and data resources: https://github.com/tesseract-ocr/tessdata ; Apache License, Version 2.0. These files are OCR model data, not fonts.

Bundling these files means that Tesseract.js should not need to download language data on the user's PC. Product images still require access to the original Rakuten URLs.
