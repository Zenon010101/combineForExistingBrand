'use strict';

// Detect the pale gray "NO IMAGE" Single supplied as a successful JPEG by
// some image CDNs. A successful HTTP 200 and a decodable JPEG are not proof
// that a usable product photograph was returned.
//
// Fast pixel preflight selects gray placeholder candidates; bundled English
// OCR then confirms the literal NO IMAGE label. If OCR is unavailable or the
// label cannot be read, an exact known Yahoo image visual match is still
// automatically blocked; ambiguous gray variants are routed to REVIEW.
const path=require('path');
const fs=require('fs');
const sharp=require('sharp');

function ocrModelDirectory(){
    const directory=path.join(__dirname,'..','ocr-data');
    return directory.replace(`${path.sep}app.asar${path.sep}`,`${path.sep}app.asar.unpacked${path.sep}`);
}
function noImageText(text){
    const upper=String(text||'').toUpperCase().replace(/[|!]/g,'I');
    // Accept OCR whitespace/line breaks and a few common character mistakes.
    const compact=upper.replace(/[^A-Z0-9]/g,'').replace(/0/g,'O').replace(/1/g,'I');
    return /NOIMAG[E3]/.test(compact)||/NOIM[A4]G[E3]/.test(compact)||/NOIMAGES/.test(compact);
}
function computeAppearance(data,width,height,channels){
    let total=0,neutral=0,light=0,veryLight=0,icon=0,iconTotal=0,label=0,labelTotal=0,outer=0,outerTotal=0;
    let visible=0,mode=0;
    const bins=new Uint32Array(16);
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
        const pos=(y*width+x)*channels,r=data[pos],g=data[pos+1],b=data[pos+2];
        const high=Math.max(r,g,b),low=Math.min(r,g,b),gray=(r+g+b)/3;
        total++;
        if(high-low<=20)neutral++;
        if(low>=210)light++;
        if(low>=235)veryLight++;
        if(gray<218)visible++;
        const bin=Math.max(0,Math.min(15,Math.floor(gray/16)));bins[bin]++;
        const nx=(x+.5)/width,ny=(y+.5)/height;
        if(nx>=.28&&nx<=.72&&ny>=.18&&ny<.58){
            iconTotal++;if(gray<218)icon++;
        }
        if(nx>=.23&&nx<=.77&&ny>=.54&&ny<.82){
            labelTotal++;if(gray<218)label++;
        }
        if(nx<.12||nx>.88||ny<.1||ny>.90){
            outerTotal++;if(gray<218)outer++;
        }
    }
    for(const n of bins)mode=Math.max(mode,n);
    const stats={neutral:neutral/total,light:light/total,veryLight:veryLight/total,
        mode:mode/total,ink:visible/total,
        icon:icon/Math.max(1,iconTotal),label:label/Math.max(1,labelTotal),
        outer:outer/Math.max(1,outerTotal)};
    // Text-only product packaging is not a placeholder. Require a pale,
    // overwhelmingly neutral field and centered icon AND caption glyphs.
    // v2.0.10 excluded the ACTUAL Yahoo placeholder before OCR ever ran:
    // its light-pixel share is ~.75 and its gray ink covers ~.26, while the
    // earlier thresholds required .77 light / at most .21 ink. Keep this
    // broad enough to inspect real CDN variants; matching/OCR is strict.
    stats.candidate=stats.neutral>=.92&&stats.light>=.60&&stats.veryLight>=.38&&
        stats.mode>=.28&&stats.ink>=.006&&stats.ink<=.40&&
        stats.icon>=.025&&stats.label>=.005&&stats.outer<.060;
    stats.strongGeometry=stats.candidate&&stats.neutral>=.977&&stats.light>=.70&&
        stats.mode>=.48&&stats.icon>=.065&&stats.label>=.012&&stats.outer<.023;
    return stats;
}
function isConfidentPlaceholderGeometry(stats){
    // Fallback for the standard centered gray pictogram + NO IMAGE caption
    // when OCR cannot read tiny/light lettering. Requiring almost no color,
    // a very small foreground footprint and empty margins avoids most real
    // grayscale product photographs.
    return Boolean(stats.strongGeometry&&stats.neutral>=.995&&stats.light>=.93&&
        stats.mode>=.78&&stats.ink<=.09&&stats.icon>=.07&&
        stats.label>=.02&&stats.outer<.005);
}

// A visual fingerprint of the Yahoo fallback graphic from an observed failed
// Single (the image icon above a gray NO IMAGE caption). This is a cropped
// reference graphic ONLY: no product content or screenshot UI is included.
// Tolerant to resize, JPEG compression, and brightness/contrast shifts.
const REFERENCE_FILE=path.join(__dirname,'assets','yahoo-no-image-reference.png');
let referencePromise=null;
async function grayscaleSignature(input){
    const {data}=await sharp(input,{limitInputPixels:80000000})
        .flatten({background:'#ffffff'}).resize(160,160,{fit:'fill'})
        .grayscale().raw().toBuffer({resolveWithObject:true});
    return data;
}
function normalizedSimilarity(reference,image){
    if(!reference||reference.length!==image?.length||reference.length<4)return -1;
    let sumR=0,sumI=0,sumRR=0,sumII=0,sumRI=0;
    const n=reference.length;
    for(let i=0;i<n;i++){
        const a=reference[i],b=image[i];
        sumR+=a;sumI+=b;sumRR+=a*a;sumII+=b*b;sumRI+=a*b;
    }
    const covariance=sumRI-sumR*sumI/n;
    const varianceR=sumRR-sumR*sumR/n,varianceI=sumII-sumI*sumI/n;
    if(varianceR<1||varianceI<1)return -1;
    return Math.max(-1,Math.min(1,covariance/Math.sqrt(varianceR*varianceI)));
}
async function knownYahooPlaceholderSimilarity(image){
    if(!referencePromise){
        referencePromise=fs.promises.readFile(REFERENCE_FILE)
            .then(grayscaleSignature).catch(error=>{referencePromise=null;throw error;});
    }
    const [reference,actual]=await Promise.all([referencePromise,grayscaleSignature(image)]);
    return normalizedSimilarity(reference,actual);
}

async function singleAppearance(bytes){
    const {data,info}=await sharp(bytes,{limitInputPixels:80000000})
        .flatten({background:'#ffffff'}).resize(160,160,{fit:'fill'})
        .removeAlpha().raw().toBuffer({resolveWithObject:true});
    return computeAppearance(data,info.width,info.height,info.channels);
}
class SinglePlaceholderInspector{
    constructor({recognizeText=null}={}){
        this.recognizeText=recognizeText;
        this.worker=null;this.workerInit=null;this.queue=Promise.resolve();
    }
    async workerReady(){
        if(this.worker)return this.worker;
        if(!this.workerInit){
            this.workerInit=(async()=>{
                const createWorker=require('tesseract.js').createWorker;
                this.worker=await createWorker('eng',1,{langPath:ocrModelDirectory(),gzip:true,
                    cacheMethod:'none',logger:()=>{}});
                return this.worker;
            })();
        }
        return this.workerInit;
    }
    async readText(bytes){
        // All candidate Singles share one worker so a large Excel batch does
        // not create many OCR workers/large memory allocations at once.
        if(this.recognizeText)return String(await this.recognizeText(bytes)||'');
        const run=async()=>{
            const worker=await this.workerReady();
            return String((await worker.recognize(bytes))?.data?.text||'');
        };
        const current=this.queue.then(run,run);
        this.queue=current.catch(()=>{});
        return current;
    }
    async inspect(normalizedPng){
        const appearance=await singleAppearance(normalizedPng);
        let signature=-1,signatureError='';
        // The actual Yahoo image has a larger gray icon than the old synthetic
        // fixtures. Try its specific visual signature BEFORE the OCR preflight.
        if(appearance.neutral>=.90&&appearance.light>=.48&&appearance.mode>=.20){
            try{signature=await knownYahooPlaceholderSimilarity(normalizedPng);}
            catch(error){signatureError=String(error?.message||error).slice(0,180);}
        }
        appearance.yahooPlaceholderSimilarity=signature>=0?Number(signature.toFixed(4)):null;
        if(signature>=.84){
            return {noImage:true,review:false,
                reason:`Standard Yahoo NO IMAGE graphic detected (visual match ${signature.toFixed(3)}).`,appearance};
        }
        const possibleSignature=signature>=.46;
        if(!appearance.candidate&&!possibleSignature){
            // A failed signature asset must never silently PASS a plausible
            // placeholder. Route suspicious pale singles for inspection.
            if(signatureError&&appearance.neutral>=.96&&appearance.light>=.65&&appearance.mode>=.38)
                return {noImage:false,review:true,reason:'Placeholder signature check unavailable: '+signatureError,appearance};
            return {noImage:false,review:false,appearance};
        }
        try{
            const image=await sharp(normalizedPng).flatten({background:'#ffffff'})
                .resize({width:1100,withoutEnlargement:false}).grayscale().normalize()
                .sharpen().png().toBuffer();
            const extracted=await this.readText(image);
            if(noImageText(extracted)){
                return {noImage:true,review:false,
                    reason:'Image is a gray NO IMAGE placeholder (text confirmed).',appearance};
            }
        }catch(error){
            if(isConfidentPlaceholderGeometry(appearance)){
                return {noImage:true,review:false,
                    reason:'Gray NO IMAGE pictogram and caption layout detected (OCR unavailable).',appearance};
            }
            return {noImage:false,review:true,
                reason:'Possible NO IMAGE Single; text check unavailable: '+
                    String(error?.message||error).slice(0,150),appearance};
        }
        if(isConfidentPlaceholderGeometry(appearance)){
            return {noImage:true,review:false,
                reason:'Gray NO IMAGE pictogram and caption layout detected.',appearance};
        }
        if(possibleSignature||appearance.strongGeometry){
            return {noImage:false,review:true,
                reason:`Gray Single resembles a NO IMAGE placeholder (visual match ${signature.toFixed(3)}); review manually.`,appearance};
        }
        return {noImage:false,review:false,appearance};
    }
    async close(){
        try{await this.queue.catch(()=>{});}catch{}
        try{await this.workerInit?.catch(()=>{});}catch{}
        try{await this.worker?.terminate();}catch{}
        this.worker=null;
    }
}
module.exports={SinglePlaceholderInspector,singleAppearance,computeAppearance,noImageText,isConfidentPlaceholderGeometry,ocrModelDirectory,knownYahooPlaceholderSimilarity,normalizedSimilarity};
