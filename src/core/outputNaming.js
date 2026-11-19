"use strict";

// Product ID for Existing Brand output files comes from the LAST segment
// of the public Yahoo Single URL in Excel column E, e.g.
// https://item-shopping.c.yimg.jp/i/n/glv_abu-90 -> abu-90.
// For rows without a Yahoo Single, fall back to the original iframe HTML basename.
const path = require("path");
const {cleanCellValue} = require("./iframeSingle");

function safeProductId(candidate) {
    const id = String(candidate||"").trim();
    if (!/^[a-z0-9][a-z0-9._-]{0,99}$/i.test(id) || id.includes("..") || id.endsWith("."))
        throw new Error(`Cannot create safe output filenames from product ID: ${id.slice(0,120)}`);
    return id;
}
function productIdFromSources(singleSource, iframeSource) {
    const single = cleanCellValue(singleSource);
    if (/^https?:\/\//i.test(single)) {
        let parsed;
        try {parsed=new URL(single);}catch { /* Invalid Single URL is validated by the existing Single preparer. */ }
        if(parsed && parsed.hostname.toLowerCase()==="item-shopping.c.yimg.jp") {
            const encoded=path.posix.basename(parsed.pathname);
            let fileStem;
            try {fileStem=decodeURIComponent(encoded);}catch {throw new Error("Yahoo Single URL contains an invalid product ID encoding.");}
            // Strip the shop prefix (glv_, lucida-gulliver_, etc.), not the SKU's inner underscores.
            const marker=fileStem.indexOf("_");
            const id=marker<0?fileStem:fileStem.slice(marker+1);
            return safeProductId(id);
        }
    }
    let parsed;
    try {parsed=new URL(iframeSource);}catch {throw new Error("No valid Rakuten iframe URL available for product ID fallback.");}
    const pathname=path.posix.basename(parsed.pathname);
    let stem;
    try {stem=decodeURIComponent(pathname);}catch {throw new Error("Iframe URL contains an invalid product ID encoding.");}
    return safeProductId(stem.replace(/\.html?$/i,""));
}
function outputFileNames(id) {
    const safe=safeProductId(id);
    return {html:`${safe}.html`,jpeg:`${safe}combine.jpg`};
}
module.exports={safeProductId,productIdFromSources,outputFileNames};
