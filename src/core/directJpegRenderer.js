"use strict";

// Existing Brand JPEG exporter: pixel-based, independent of Chromium CSS,
// screenshot timing, display scaling, or webpage network restrictions.
const fs = require("fs");
const sharp = require("sharp");
const {getImageBuffer} = require("./imageDownload");
const {SinglePlaceholderInspector}=require("./singlePlaceholder");
const {galleryImages,calculateFlow} = require("./existingBrand");
const {DIM} = require("./layoutConstants");
const {MAX_HEIGHT} = require("./iframeJpegRenderer");
const WIDTH = DIM.width;
const MAX_INPUT_PIXELS = 80000000;
const MAX_INLINE_BYTES = 20 * 1024 * 1024;

function inlineImageBytes(raw) {
    const match = /^data:image\/(?:jpeg|jpg|png|webp);base64,([a-z0-9+/]+={0,2})$/i.exec(raw||"");
    if(!match||match[1].length>Math.ceil(MAX_INLINE_BYTES*4/3)+8)
        throw new Error("Single image is not a valid JPEG/PNG/WEBP data URI or is too large.");
    const buffer=Buffer.from(match[1],"base64");
    if(!buffer.length||buffer.length>MAX_INLINE_BYTES)throw new Error("Single image data exceeds the supported size.");
    return buffer;
}
async function mapLimited(items,limit,mapper){
    const result=new Array(items.length);let cursor=0;
    async function worker(){while(cursor<items.length){const i=cursor++;result[i]=await mapper(items[i],i);}}
    await Promise.all(Array.from({length:Math.min(limit,items.length)},worker));
    return result;
}
// A nearly white Single may be a truly blank image, or a legitimate white
// product. Never silently discard it; request manual review instead.
async function isNearlyBlankSingle(normalizedPng){
    const {data,info}=await sharp(normalizedPng).flatten({background:'#ffffff'})
        .resize({width:64,height:64,fit:'fill'}).removeAlpha().raw().toBuffer({resolveWithObject:true});
    let white=0,total=0;
    for(let i=0;i<data.length;i+=info.channels){
        total++;
        if(data[i]>=250 && data[i+1]>=250 && data[i+2]>=250)white++;
    }
    return total>0 && white/total>=0.998;
}
function planExistingJpeg(gallerySizes,singleHeight=0){
    if(!Array.isArray(gallerySizes)||(!gallerySizes.length&&!singleHeight))
        throw new Error("Existing Brand JPEG: no usable images to compose.");
    if(!Number.isInteger(singleHeight)||singleHeight<0)
        throw new Error("Existing Brand JPEG: invalid Single height.");
    const grid=calculateFlow(gallerySizes);
    const galleryY=singleHeight && gallerySizes.length?singleHeight+DIM.singleGap:singleHeight;
    // 3px bottom breathing room belongs to gallery only; Single is full bleed.
    const height=galleryY+grid.height+(gallerySizes.length?DIM.margin:0);
    if(!Number.isInteger(height)||height<1||height>MAX_HEIGHT)
        throw new Error(`Existing Brand JPEG height ${height}px exceeds ${MAX_HEIGHT}px. Split this product or review very tall source images.`);
    const tiles=grid.rows.flat().map(tile=>({...tile,x:Math.round(tile.x),y:Math.round(tile.y)+galleryY}));
    return {width:WIDTH,height,galleryY,columnWidth:grid.columnWidth,tiles,hasSingle:singleHeight>0,singleHeight};
}
class DirectJpegRenderer {
    constructor({imageFetcher=getImageBuffer,maxConcurrentDownloads=3,singleInspector=null}={}){
        this.imageFetcher=imageFetcher;
        this.singleInspector=singleInspector||new SinglePlaceholderInspector();
        this.maxConcurrentDownloads=Math.max(1,Math.min(6,maxConcurrentDownloads|0));
    }
    async loadImage(source,targetWidth,label,{allowUpscale=false}={}){
        try {
            const data=Buffer.isBuffer(source)?source:
                (typeof source==="string"&&source.startsWith("data:image/"))?inlineImageBytes(source):
                await this.imageFetcher(source);
            if(!Buffer.isBuffer(data)||!data.length)throw new Error("No image bytes returned.");
            const result=await sharp(data,{limitInputPixels:MAX_INPUT_PIXELS,failOn:"error"})
                .rotate().resize({width:targetWidth,withoutEnlargement:!allowUpscale})
                .png().toBuffer({resolveWithObject:true});
            if(!result.info.width||!result.info.height||result.info.width>targetWidth)
                throw new Error("Image decoder returned invalid dimensions.");
            return {bytes:result.data,width:result.info.width,height:result.info.height};
        } catch(error) {
            throw new Error(`${label}: ${String(error?.message||error)}`);
        }
    }
    // Image preflight intentionally returns each failure instead of rejecting
    // the entire product. Successful decoded PNGs are reused by capture(),
    // avoiding a second network request (and eliminating HTML/JPEG mismatch).
    async prepareAssets({images=[],single=null}={}){
        const gallery=await mapLimited(images,this.maxConcurrentDownloads,async(url,i)=>{
            try { return {url,index:i,image:await this.loadImage(url,DIM.cell,`Gallery image ${i+1}`)}; }
            catch(error){return {url,index:i,error:String(error?.message||error)};}
        });
        let singleAsset=null,singleError=null,singleBlank=false,singleNoImage=false;
        let singlePlaceholderReview=false,singlePlaceholderDetail='',singlePlaceholderMatch=null;
        if(single){
            try{
                singleAsset=await this.loadImage(single,WIDTH,'Single image',{allowUpscale:true});
                singleBlank=await isNearlyBlankSingle(singleAsset.bytes);
                if(!singleBlank){
                    const inspection=await this.singleInspector.inspect(singleAsset.bytes);
                    singleNoImage=Boolean(inspection.noImage);
                    singlePlaceholderReview=Boolean(inspection.review||inspection.error);
                    singlePlaceholderDetail=inspection.reason||inspection.error||'';
                    singlePlaceholderMatch=inspection.appearance?.yahooPlaceholderSimilarity??null;
                }
            } catch(error){singleError=String(error?.message||error);}
        }
        return {galleryEntries:gallery.filter(x=>x.image),failedGallery:gallery.filter(x=>x.error),
            singleAsset,singleError,singleBlank,singleNoImage,singlePlaceholderReview,singlePlaceholderDetail,singlePlaceholderMatch};
    }
    async capture(_htmlFile,outputJpeg,{images,single=null,expectedImages,preparedAssets=null}={}) {
        const urls=galleryImages(images,{allowEmpty:Boolean(single)});
        if(Number.isInteger(expectedImages)&&expectedImages!==urls.length+(single?1:0))
            throw new Error(`Existing Brand JPEG expected ${expectedImages} image(s) but received ${urls.length+(single?1:0)}.`);
        let singleImage,gallery;
        if(preparedAssets){
            const entries=preparedAssets.galleryEntries||[];
            if(entries.length!==urls.length||entries.some((entry,i)=>entry.url!==urls[i]))
                throw new Error('Prepared image list does not match the validated gallery.');
            if(Boolean(single)!==Boolean(preparedAssets.singleAsset))
                throw new Error('Prepared Single does not match the selected output.');
            singleImage=preparedAssets.singleAsset;
            gallery=entries.map(e=>e.image);
        } else {
            [singleImage,gallery]=await Promise.all([
                single?this.loadImage(single,WIDTH,"Single image",{allowUpscale:true}):Promise.resolve(null),
                mapLimited(urls,this.maxConcurrentDownloads,(url,i)=>this.loadImage(url,DIM.cell,`Gallery image ${i+1}`))
            ]);
        }
        const plan=planExistingJpeg(gallery.map(x=>({width:x.width,height:x.height})),singleImage?.height||0);
        const layers=[];
        if(singleImage)layers.push({input:singleImage.bytes,left:0,top:0});
        plan.tiles.forEach((pos,i)=>layers.push({input:gallery[i].bytes,left:pos.x,top:pos.y}));
        const partial=outputJpeg+".partial";
        try {
            await sharp({create:{width:WIDTH,height:plan.height,channels:3,background:"#ffffff"}})
                .composite(layers).jpeg({quality:91,mozjpeg:true}).toFile(partial);
            const metadata=await sharp(partial).metadata();
            if(metadata.format!=="jpeg"||metadata.width!==WIDTH||metadata.height!==plan.height)
                throw new Error("Final JPEG verification failed: dimensions or format are incorrect.");
            await fs.promises.rename(partial,outputJpeg);
            return {width:WIDTH,height:plan.height,galleryCount:urls.length,
                renderer:"DIRECT_SHARP",singleHeight:singleImage?.height||0};
        } catch(error) {
            await fs.promises.rm(partial,{force:true}).catch(()=>{});
            throw error;
        }
    }
    async close(){await this.singleInspector?.close?.();}
}
module.exports={DirectJpegRenderer,planExistingJpeg,mapLimited,inlineImageBytes,isNearlyBlankSingle};
