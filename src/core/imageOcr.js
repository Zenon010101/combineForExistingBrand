"use strict";
// Embedded Japanese + English caption OCR for the stand-alone Electron main
// process. No text extraction is needed from the final JPG; original Rakuten
// image bytes are fetched transiently and never written as separate images.
const fs=require("fs");
const path=require("path");
const {getUrlBuffer}=require("./fetch");
const {analyzeOcrText}=require("./colorCaption");
const {detectLayoutFromBuffer,isSupportedMultiCut}=require("./lineupLayout");

function languageDirectory(){
    let directory=path.join(__dirname,"..","ocr-data");
    // Electron builder stores OCR models outside app.asar for worker-thread
    // access. In development, the regular src/ocr-data directory is used.
    if(directory.includes(`${path.sep}app.asar${path.sep}`))
        directory=directory.replace(`${path.sep}app.asar${path.sep}`,`${path.sep}app.asar.unpacked${path.sep}`);
    return directory;
}
class ColorCaptionOcr {
    constructor({fetchImage=getUrlBuffer,createWorker=null}={}){
        this.fetchImage=fetchImage;this.createWorker=createWorker;
        this.worker=null;this.workerInit=null;this.failure="";
        this.queue=Promise.resolve();this.cache=new Map();
    }
    async ensureWorker(){
        if(this.worker)return this.worker;
        if(this.failure)throw new Error(this.failure);
        if(!this.workerInit){
            this.workerInit=(async()=>{
                try{
                    const directory=languageDirectory();
                    if(!fs.existsSync(path.join(directory,"jpn.traineddata.gz")) ||
                        !fs.existsSync(path.join(directory,"eng.traineddata.gz")))
                        throw new Error("Bundled Japanese/English OCR models are missing.");
                    const create=this.createWorker||require("tesseract.js").createWorker;
                    this.worker=await create(["jpn","eng"],1,{
                        langPath:directory,gzip:true,cacheMethod:"none",logger:()=>{}
                    });
                    return this.worker;
                }catch(e){this.failure=String(e?.message||e);throw e;}
            })();
        }
        return this.workerInit;
    }
    async recognizeUrl(url){
        if(this.cache.has(url))return this.cache.get(url);
        const run=async()=>{
            try{
                const worker=await this.ensureWorker();
                const response=await this.fetchImage(url,{maxBytes:9*1024*1024,timeoutMs:14000});
                const type=String(response.contentType||"").toLowerCase();
                if(type&&!/^image\/(?:jpeg|png|webp|gif|avif|bmp|tiff)(?:\s*;|\s*$)/.test(type))
                    throw new Error("Source did not return an image.");
                const sharp=require("sharp");
                let layout={type:"single",cuts:1,confidence:0};
                let signature=null;
                // Compare source product silhouettes from these SAME fetched
                // bytes: do not make a second network request per image.
                try{signature=await require("./variationClassifier").signatureFromBuffer(response.buffer);}catch{/* optional support */}
                // The source may contain a 2-up horizontal/vertical or a
                // 4-cut Slider Maker image. Never infer Line Up from cuts alone.
                try{layout=await detectLayoutFromBuffer(response.buffer);}catch{/* OCR still works */}
                // Preprocess in memory. Bottom captions get a larger OCR view.
                const prepared=await sharp(response.buffer,{limitInputPixels:45000000})
                    .rotate().flatten({background:"#ffffff"})
                    .resize({width:1450,height:1800,fit:"inside",withoutEnlargement:false})
                    .grayscale().normalize().sharpen().png().toBuffer();
                const meta=await sharp(prepared).metadata();
                const top=Math.max(0,Math.floor(meta.height*.49));
                const band=await sharp(prepared).extract({left:0,top,width:meta.width,height:meta.height-top}).png().toBuffer();
                const bottom=String((await worker.recognize(band))?.data?.text||"").trim();
                // IMPORTANT: never stop at a short bottom color word. Details
                // graphics can say BLACK at the bottom, while the top says
                // MATERIAL, FEATURE, SIZE, etc. Read the WHOLE source image
                // before classifying it as a color variation.
                const full=String((await worker.recognize(prepared))?.data?.text||"").trim();
                const tileTexts=[];
                // For a 2/4-cut source, inspect each cut separately. Only
                // short genuine color labels are positive evidence; panels by
                // themselves are not a color section.
                if(isSupportedMultiCut(layout) && analyzeOcrText([bottom,full].join("\n")).labels.length<layout.cuts){
                    const xc=Math.max(1,Math.min(meta.width-1,Math.round((layout.verticalCut||.5)*meta.width)));
                    const yc=Math.max(1,Math.min(meta.height-1,Math.round((layout.horizontalCut||.5)*meta.height)));
                    const cells=layout.type==="four-cut"
                        ?[[0,0,xc,yc],[xc,0,meta.width-xc,yc],[0,yc,xc,meta.height-yc],[xc,yc,meta.width-xc,meta.height-yc]]
                        :layout.type==="horizontal"
                            ?[[0,0,xc,meta.height],[xc,0,meta.width-xc,meta.height]]
                            :[[0,0,meta.width,yc],[0,yc,meta.width,meta.height-yc]];
                    for(const [x,y,w,h] of cells){
                        if(w<15||h<15)continue;
                        const start=y+Math.floor(h*.50),bandHeight=y+h-start;
                        const patch=await sharp(prepared).extract({left:x,top:start,width:w,height:bandHeight})
                            .resize({width:900,withoutEnlargement:false}).png().toBuffer();
                        const local=String((await worker.recognize(patch))?.data?.text||"").trim();
                        if(local)tileTexts.push(local);
                    }
                }
                return {
                    text:[bottom,full,...tileTexts].filter(Boolean).join("\n").slice(0,6000),
                    captionText:bottom,fullText:full,tileTexts,layout,signature,
                    // The following field makes it impossible for a bottom-only
                    // label to hide detailed explanatory copy found elsewhere.
                    hasFullImageDetailSignal:analyzeOcrText(full).hasDetailSignal
                };
            }catch(e){return {text:"",error:String(e?.message||e).slice(0,250)};}
        };
        // One OCR worker is shared by all 3 batch workers; recognition must
        // run serially to avoid Tesseract contention and memory spikes.
        const promise=this.queue.then(run,run);
        this.queue=promise.then(()=>{},()=>{});
        this.cache.set(url,promise);
        if(this.cache.size>250)this.cache.delete(this.cache.keys().next().value);
        return promise;
    }
    async close(){
        await this.queue.catch(()=>{});
        if(this.worker){await this.worker.terminate().catch(()=>{});this.worker=null;}
        this.workerInit=null;this.failure="";this.cache.clear();
    }
}
module.exports={ColorCaptionOcr,languageDirectory};
