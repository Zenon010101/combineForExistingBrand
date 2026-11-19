"use strict";

// Download only public image hosts already supported by this Rakuten workflow.
// This avoids navigating arbitrary URLs or relying on a hidden Electron browser.
const https = require("https");
const zlib = require("zlib");
const HOSTS = new Set([
    "image.rakuten.co.jp", "shop.r10s.jp", "www.rakuten.ne.jp", "rakuten.ne.jp",
    "item-shopping.c.yimg.jp"
]);
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

function safeImageUrl(source, base) {
    let parsed;
    try { parsed = new URL(String(source || "").trim(), base); }
    catch { throw new Error("Invalid image URL."); }
    if (parsed.protocol !== "https:" || parsed.port || parsed.username || parsed.password ||
        !HOSTS.has(parsed.hostname.toLowerCase())) {
        throw new Error(`Image host is not approved: ${parsed.hostname || "unknown"}.`);
    }
    parsed.hash = "";
    return parsed.href;
}
function requestImage(url, {maxBytes=MAX_IMAGE_BYTES, timeoutMs=16000, redirects=0}={}) {
    const safe = safeImageUrl(url);
    if (redirects > 4) return Promise.reject(new Error("Image request exceeded redirect limit."));
    return new Promise((resolve, reject) => {
        let settled = false;
        const fail = error => {if(!settled){settled=true;reject(error);}};
        const referer = new URL(safe).hostname === "item-shopping.c.yimg.jp"
            ? "https://shopping.yahoo.co.jp/" : "https://www.rakuten.ne.jp/";
        const req = https.get(safe, {headers:{
            "User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36",
            "Referer":referer, "Accept":"image/avif,image/webp,image/apng,image/*,*/*;q=0.5",
            "Accept-Encoding":"identity"
        },timeout:timeoutMs}, res => {
            const status=res.statusCode||0;
            if(status>=300 && status<400 && res.headers.location){
                res.resume();
                let destination;
                try{destination=safeImageUrl(res.headers.location,safe);}catch(e){fail(e);return;}
                requestImage(destination,{maxBytes,timeoutMs,redirects:redirects+1}).then(data=>{if(!settled){settled=true;resolve(data);}},fail);
                return;
            }
            if(status!==200){
                res.resume();fail(new Error(`HTTP ${status} from image host (${new URL(safe).pathname.slice(0,150)}).`));return;
            }
            const type=String(res.headers["content-type"]||"").toLowerCase();
            if(type && !/^(?:image\/|application\/octet-stream)/i.test(type)){
                res.resume();fail(new Error(`Image URL returned ${type}, not image bytes.`));return;
            }
            let size=0;const parts=[];
            res.on("data", chunk=>{
                size+=chunk.length;
                if(size>maxBytes){req.destroy(new Error(`Image download exceeded ${Math.round(maxBytes/1024/1024)} MB limit.`));return;}
                parts.push(chunk);
            });
            res.on("error",fail);
            res.on("end",()=>{
                if(settled)return;
                try {
                    let bytes=Buffer.concat(parts);
                    const enc=String(res.headers["content-encoding"]||"").toLowerCase();
                    if(enc==="gzip")bytes=zlib.gunzipSync(bytes);
                    if(enc==="deflate")bytes=zlib.inflateSync(bytes);
                    if(bytes.length<1||bytes.length>maxBytes)throw new Error("Downloaded image bytes are empty or exceed the size limit.");
                    settled=true;resolve(bytes);
                }catch(e){fail(e);}
            });
        });
        req.on("error",fail);
        req.on("timeout",()=>req.destroy(new Error(`Image download timed out after ${timeoutMs} ms.`)));
    });
}
async function getImageBuffer(url, options={}) {
    const retries=options.retries==null?1:options.retries;
    for(let attempt=0;;attempt++) {
        try{return await requestImage(url,options);}
        catch(error) {
            if(attempt>=retries||/\bHTTP (?:400|401|403|404|410|422)\b|not approved|Invalid image URL/i.test(error.message))throw error;
            await new Promise(resolve=>setTimeout(resolve,300*(attempt+1)));
        }
    }
}
module.exports={HOSTS,MAX_IMAGE_BYTES,safeImageUrl,requestImage,getImageBuffer};
