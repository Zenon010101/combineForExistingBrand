"use strict";

// Single may be a public image URL (including extensionless Yahoo image URLs),
// or a local / shared-drive image file. Only public URLs are publishable in HTML.
// Local files are kept unchanged and can be used in the 600px JPEG only.
const fs = require("fs");
const path = require("path");
const {fileURLToPath} = require("url");

const MAX_SINGLE_BYTES = 80 * 1024 * 1024;
const MAX_DATA_URI_BYTES = 2 * 1024 * 1024;
const IMAGE_EXT = /\.(?:jpe?g|png|webp|tiff?|bmp|gif|avif)$/i;
const SINGLE_HOSTS = new Set([
    "item-shopping.c.yimg.jp", "image.rakuten.co.jp", "shop.r10s.jp"
]);

function cleanCellValue(value) {
    const raw = String(value ?? "").trim();
    if ((raw.startsWith('"') && raw.endsWith('"')) ||
        (raw.startsWith("'") && raw.endsWith("'"))) return raw.slice(1,-1).trim();
    return raw;
}
function safeSingleImageUrl(value) {
    const raw = cleanCellValue(value);
    let parsed;
    try { parsed = new URL(raw); } catch { throw new Error(`Invalid Single image URL: ${raw.slice(0,160)}`); }
    if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.port ||
        !SINGLE_HOSTS.has(parsed.hostname.toLowerCase()) || !parsed.pathname || parsed.pathname === "/") {
        throw new Error(`Single image URL must use public HTTPS on an allowed image host (Yahoo item-shopping, Rakuten images): ${raw.slice(0,160)}`);
    }
    // IMPORTANT: Yahoo item-shopping URLs such as /i/n/glv_abu-90 do not end in .jpg.
    parsed.hash = "";
    return parsed.href;
}
function looksLikeRemoteSingle(value) {
    return /^https?:\/\//i.test(cleanCellValue(value));
}
function looksLikeLocalSingle(value) {
    const raw = cleanCellValue(value);
    return Boolean(raw && !looksLikeRemoteSingle(raw) &&
        (IMAGE_EXT.test(raw) || /^file:\/\//i.test(raw)) && !/[\r\n<>]/.test(raw));
}
function looksLikeSingleSource(value) {
    if (looksLikeRemoteSingle(value)) {
        try {safeSingleImageUrl(value);return true;} catch {return false;}
    }
    return looksLikeLocalSingle(value);
}
// Keep the old public helper name for any external integrations.
const looksLikeSinglePath = looksLikeSingleSource;

function resolveSinglePath(value, excelFile) {
    const raw = cleanCellValue(value);
    if (!raw) return null;
    if (looksLikeRemoteSingle(raw)) throw new Error("Remote Single image URLs must be handled as URLs, not local file paths.");
    if (/^file:\/\//i.test(raw)) {
        const resolved = fileURLToPath(raw);
        if (!IMAGE_EXT.test(resolved)) throw new Error("Local Single file must end in JPG, PNG, WEBP, TIFF, BMP, GIF or AVIF.");
        return resolved;
    }
    if (!looksLikeLocalSingle(raw)) throw new Error(`Invalid local Single image path: ${raw.slice(0,180)}`);
    // G:\ and \\server paths must stay absolute on Windows.
    if (path.win32.isAbsolute(raw)) return path.win32.normalize(raw);
    if (path.isAbsolute(raw)) return path.normalize(raw);
    return path.resolve(path.dirname(excelFile), raw);
}
async function prepareSingleImage(value, excelFile) {
    const raw = cleanCellValue(value);
    if (!raw) return null;
    if (looksLikeRemoteSingle(raw)) {
        const url = safeSingleImageUrl(raw);
        // Keep the public URL in the HTML. The direct JPEG compositor downloads
        // this Single temporarily and verifies the pixels before writing JPEG.
        return {kind:"remote", sourcePath:url, dataUri:url, htmlUrl:url};
    }
    const sourcePath = resolveSinglePath(raw, excelFile);
    const stat = await fs.promises.stat(sourcePath).catch(error => {
        if (error?.code === "ENOENT") throw new Error(`Single image not found: ${sourcePath}`);
        throw error;
    });
    if (!stat.isFile() || stat.size < 1 || stat.size > MAX_SINGLE_BYTES)
        throw new Error(`Single image is not a readable file (or exceeds 80 MB): ${sourcePath}`);
    // This dependency is lazy so source-only unit tests work without npm install.
    const sharp = require("sharp");
    const buffer = await sharp(sourcePath,{limitInputPixels:80000000})
        .rotate().resize({width:600,height:600,fit:"inside",withoutEnlargement:true})
        .flatten({background:"#ffffff"}).jpeg({quality:92,mozjpeg:true}).toBuffer();
    if (buffer.length > MAX_DATA_URI_BYTES)
        throw new Error(`Local Single image was too large after preview conversion: ${sourcePath}`);
    return {kind:"local", sourcePath, dataUri:"data:image/jpeg;base64,"+buffer.toString("base64"), htmlUrl:null};
}
module.exports = {
    IMAGE_EXT, SINGLE_HOSTS, cleanCellValue, safeSingleImageUrl,
    looksLikeRemoteSingle, looksLikeSingleSource, looksLikeSinglePath,
    resolveSinglePath, prepareSingleImage
};
