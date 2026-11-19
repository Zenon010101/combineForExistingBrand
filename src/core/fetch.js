"use strict";
const https = require("https");
const zlib = require("zlib");
const ALLOWED = new Set(["www.rakuten.ne.jp", "rakuten.ne.jp", "image.rakuten.co.jp", "shop.r10s.jp"]);
function safeUrl(raw, base, kind="page") {
    let url;
    try { url = new URL(String(raw||"").trim(), base||undefined); }
    catch { throw new Error(`Invalid ${kind} URL.`); }
    if (url.protocol!=="https:" || !ALLOWED.has(url.hostname.toLowerCase()) || url.port || url.username || url.password)
        throw new Error(`Only public HTTPS Rakuten ${kind} URLs are supported.`);
    url.hash="";
    return url.href;
}
function getUrlBuffer(source, {maxBytes=12*1024*1024,timeoutMs=16000,redirectCount=0}={}) {
    const url=safeUrl(source);
    if(redirectCount>4) return Promise.reject(new Error("Too many HTTP redirects."));
    return new Promise((resolve,reject)=>{
        const req=https.get(url,{headers:{
            "User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
            "Accept":"text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.1",
            "Accept-Encoding":"gzip, deflate, br"
        },timeout:timeoutMs},res=>{
            const code=res.statusCode||0;
            if(code>=300&&code<400&&res.headers.location){
                res.resume();
                let redirected;
                try{redirected=safeUrl(res.headers.location,url);}catch(e){reject(e);return;}
                getUrlBuffer(redirected,{maxBytes,timeoutMs,redirectCount:redirectCount+1}).then(resolve,reject);
                return;
            }
            if(code!==200){res.resume();reject(new Error(`Rakuten returned HTTP ${code} for ${new URL(url).pathname}.`));return;}
            let size=0;const parts=[];
            res.on("data",part=>{size+=part.length;if(size>maxBytes)req.destroy(new Error("Page response exceeded 12 MB."));else parts.push(part);});
            res.on("error",reject);
            res.on("end",()=>{
                try{
                    let bytes=Buffer.concat(parts);
                    const enc=String(res.headers["content-encoding"]||"").toLowerCase();
                    if(enc==="gzip")bytes=zlib.gunzipSync(bytes);
                    else if(enc==="deflate")bytes=zlib.inflateSync(bytes);
                    else if(enc==="br")bytes=zlib.brotliDecompressSync(bytes);
                    if(bytes.length>maxBytes)throw new Error("Decompressed response exceeded 12 MB.");
                    resolve({buffer:bytes,contentType:String(res.headers["content-type"]||"")});
                }catch(e){reject(e);}
            });
        });
        req.on("error",reject);
        req.on("timeout",()=>req.destroy(new Error("Rakuten request timed out.")));
    });
}
module.exports={safeUrl,getUrlBuffer};
