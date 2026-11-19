"use strict";

// Strict image routing for the standalone Combine workflow.
// A numbered filename, white background, .png suffix, or any old 'first 3'
// default is NEVER sufficient proof of a color variation.
// Source HTML section labels take priority, followed by repeated captions and
// an optional in-memory shape check. Unverified images go to DETAILS for QC.

const { getUrlBuffer } = require("./fetch");
const { parseColorCaption,analyzeOcrText } = require("./colorCaption");
const {isSupportedMultiCut}=require("./lineupLayout");
const MAX_VISUAL_PROBES = 32;
const MAX_OCR_PROBES = 60;
const MAX_CREATIVE_PREFIX = 4;
const MAX_UNLABELED_LOOKAHEAD = 4;
const SHAPE_SIZE = 48;
const VARIATION_HEADING = /^(?:(?:color|colour)(?:\s+(?:variations?|line[ -]?up|options?|choices?))?|(?:line[ -]?up|variations?)|(?:カラー(?:バリエーション|展開|一覧)?)|(?:色(?:展開|一覧|違い)))$/i;

function plainText(html) {
    return String(html||"")
        .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi," ")
        .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi," ")
        .replace(/<!--[^]*?-->/g," ")
        .replace(/<[^>]*>/g," ")
        .replace(/&nbsp;|&#160;/gi," ")
        .replace(/&amp;/gi,"&")
        .replace(/\s+/g," ").trim();
}
function htmlStructure(html, discovery) {
    const source=String(html||"");
    const markers=[];
    const re=/<(h[1-6]|strong|b|p|div|td|span)\b[^>]*>([\s\S]{0,240}?)<\/\1>/gi;
    for(const m of source.matchAll(re)){
        const label=plainText(m[2]);
        if(label.length<2||label.length>75)continue;
        if(VARIATION_HEADING.test(label) &&
            !(/^(?:color|colour|カラー|色)$/i.test(label) && !/^h[1-6]$/i.test(m[1])))
            markers.push({offset:m.index,label,kind:"variation"});
    }
    const captions=[];
    for(let i=0;i<discovery.images.length;i++){
        const image=discovery.images[i];
        const next=discovery.images[i+1];
        // A small, immediately following standalone caption can be evidence.
        // An arbitrary description or embedded product marketing text cannot.
        const textBetween=source.slice(image.offset,Math.min(image.offset+500,next?next.offset:source.length));
        const tagEnd=textBetween.indexOf(">");
        const text=tagEnd>=0?textBetween.slice(tagEnd+1):"";
        const captionTag=/<(?:span|small|p|figcaption|td|div|b|strong)\b[^>]*>([^<]{1,50})<\/[^>]+>/i.exec(text)?.[1];
        // Short image-adjacent HTML text may already contain the variation caption.
        // Use exactly the same Japanese/English parser as embedded-image OCR.
        const nearby=captionTag?plainText(captionTag):"";
        const imageTag=/<img\b[^>]*>/i.exec(source.slice(image.offset,image.offset+800))?.[0]||"";
        const alt=/\b(?:alt|title)\s*=\s*["']([^"']+)["']/i.exec(imageTag)?.[1]||"";
        // A bare "COLOR" title is NOT a variant name. An image needs an
        // actual, parseable color label (and preferably distinct neighbors).
        const parsed=parseColorCaption(nearby);
        const fallback=parseColorCaption(alt);
        captions.push(parsed.isLabel?parsed:(fallback.isLabel?fallback:null));
    }
    return {variationMarkers:markers,captions};
}

function clip(value,low,high){return Math.max(low,Math.min(high,value));}
function maskOverlap(a,b){
    if(!a?.mask||!b?.mask||a.mask.length!==b.mask.length)return 0;
    let both=0,any=0;
    for(let i=0;i<a.mask.length;i++) {if(a.mask[i]||b.mask[i])any++;if(a.mask[i]&&b.mask[i])both++;}
    return any?both/any:0;
}
function boundsOverlap(a,b){
    if(!a?.bbox||!b?.bbox)return 0;
    const [ax,ay,bx,by]=a.bbox,[cx,cy,dx,dy]=b.bbox;
    const intersection=Math.max(0,Math.min(bx,dx)-Math.max(ax,cx))*Math.max(0,Math.min(by,dy)-Math.max(ay,cy));
    const union=(bx-ax)*(by-ay)+(dx-cx)*(dy-cy)-intersection;
    return union?intersection/union:0;
}
function compareShapes(a,b){
    if(!a||!b||a.error||b.error)return {match:false,score:0};
    const aspectDiff=Math.abs(Math.log((a.aspect||1)/(b.aspect||1)));
    const iou=maskOverlap(a,b),bbox=boundsOverlap(a,b);
    const compatible=aspectDiff<0.11 && a.lightBackground && b.lightBackground &&
        iou>=0.70 && bbox>=0.80;
    return {match:compatible,score:clip(0.8*iou+0.2*bbox,0,1),iou,bbox};
}

async function signatureFromBuffer(buffer) {
    // Lazily loaded; the production app already depends on sharp for JPEGs.
    const sharp=require("sharp");
    const info=await sharp(buffer,{limitInputPixels:35000000,failOn:"error"}).metadata();
    if(!info.width||!info.height)throw new Error("Invalid source image dimensions.");
    const raw=await sharp(buffer,{limitInputPixels:35000000})
        .rotate().flatten({background:"#ffffff"})
        .resize(SHAPE_SIZE,SHAPE_SIZE,{fit:"fill",kernel:"lanczos3"})
        .removeAlpha().raw().toBuffer();
    const mask=new Uint8Array(SHAPE_SIZE*SHAPE_SIZE);
    let whiteBorder=0,borderCount=0,x0=SHAPE_SIZE,y0=SHAPE_SIZE,x1=0,y1=0;
    for(let y=0;y<SHAPE_SIZE;y++)for(let x=0;x<SHAPE_SIZE;x++){
        const i=y*SHAPE_SIZE+x,base=i*3;
        const r=raw[base],g=raw[base+1],b=raw[base+2];
        const min=Math.min(r,g,b),max=Math.max(r,g,b);
        // Includes pale-color objects; this is not a textual OCR signal.
        const isForeground=min<231 || max-min>24;
        mask[i]=isForeground?1:0;
        if(isForeground){x0=Math.min(x,x0);y0=Math.min(y,y0);x1=Math.max(x+1,x1);y1=Math.max(y+1,y1);}
        if(x<4||x>=SHAPE_SIZE-4||y<4||y>=SHAPE_SIZE-4){
            borderCount++; if(min>=235&&max-min<22)whiteBorder++;
        }
    }
    const lightRatio=borderCount?whiteBorder/borderCount:0;
    const contentPixels=mask.reduce((a,b)=>a+b,0);
    return {
        aspect:info.width/info.height,mask,bbox:[x0,y0,x1,y1],
        lightBackground:lightRatio>=0.73 && contentPixels>75 && contentPixels<SHAPE_SIZE*SHAPE_SIZE*0.88,
        lightRatio,contentPixels
    };
}

async function fetchSignature(url,{fetchImage=getUrlBuffer}={}){
    const response=await fetchImage(url,{maxBytes:5*1024*1024,timeoutMs:9500});
    const mime=String(response.contentType||"").toLowerCase();
    if(mime && !/^image\/(?:jpeg|png|webp|gif|avif|bmp|tiff)(?:\s*;|\s*$)/.test(mime))
        throw new Error("Source image returned a non-image content type.");
    return signatureFromBuffer(response.buffer);
}

// Classify one complete, ordered color-variation SECTION, not isolated photos.
// The previous implementation stopped on the first failed OCR caption, which
// sent later legitimate variants into DETAILS. This one performs bounded
// lookahead and only bridges an OCR gap when confirmed variations surround it.
function incompatiblePoses(a,b){
    if(!a?.signature||!b?.signature||a.hasCut||b.hasCut)return false;
    if(!a.signature.lightBackground||!b.signature.lightBackground)return false;
    const match=compareShapes(a.signature,b.signature);
    const aspectDelta=Math.abs(Math.log((a.signature.aspect||1)/(b.signature.aspect||1)));
    return aspectDelta>.30 || (match.iou<.43 && match.bbox<.55);
}
function chooseLineupBoundary(evidence,{total,detailsPos=null,readErrors=[]}={}){
    const candidates=[];
    const maxStart=Math.min(MAX_CREATIVE_PREFIX,evidence.length-1);
    for(let start=0;start<=maxStart;start++){
        if(!evidence[start]?.variant)continue;
        let end=start,positives=0,cutImages=0,fourCuts=0,shapeBreak=false;
        const keys=new Set(),bridged=[];
        const anchor=evidence[start];
        while(end<evidence.length){
            const item=evidence[end];
            if(item.hasDetailSignal)break; // detail copy always vetoes Line Up
            if(item.variant){
                if(end>start && incompatiblePoses(anchor,item)){
                    shapeBreak=true;break;
                }
                positives++;
                for(const label of item.labels||[])keys.add(label.key);
                if(item.hasCut){cutImages++;if(item.layout?.cuts===4)fourCuts++;}
                end++;continue;
            }
            // A single missing caption INSIDE a labeled group is permissible.
            // Never add an unlabeled trailing image: it might be a Detail.
            const next=evidence[end+1];
            if(end>start && positives>=2 && keys.size>=2 &&
                next?.variant && !next.hasDetailSignal &&
                evidence[end-1]?.variant && !incompatiblePoses(anchor,item) &&
                !incompatiblePoses(item,next) && !incompatiblePoses(anchor,next)){
                bridged.push(end);end++;continue;
            }
            break;
        }
        const width=end-start;
        const verified=positives>=3 && keys.size>=2;
        const cutVerified=cutImages>=1 && positives>=2 && keys.size>=2;
        const fourVerified=fourCuts>=1 && keys.size>=3;
        const headingSupports=detailsPos===end && positives>=2 && keys.size>=2 && bridged.length===0;
        if(!(verified||cutVerified||fourVerified||headingSupports))continue;
        const hasBoundary=end<evidence.length;
        const complete=total===evidence.length;
        const capped=!hasBoundary&&!complete;
        const laterLabels=evidence.slice(end+1).filter(x=>x.variant).length;
        const errorInSection=readErrors.some(e=>e.index>=start&&e.index<end);
        const sourceMismatch=detailsPos!=null&&detailsPos>start&&detailsPos!==end;
        const uncertainty=Boolean(bridged.length||errorInSection||shapeBreak||laterLabels||sourceMismatch);
        candidates.push({start,count:width,end,positives,uniqueCaptions:keys.size,
            gridImages:cutImages,hasBoundary,complete,capped,bridged,shapeBreak,
            laterLabels,sourceMismatch,uncertainty,
            confident:!capped && (hasBoundary||complete),
            // Stronger, longer verified runs beat a misleading first color
            // word in a promo/creative image. Prefer the earlier start on ties.
            score:positives*6 + keys.size + (hasBoundary?3:0) - bridged.length*2 -
                (shapeBreak?2:0) - (sourceMismatch?1:0) - start*.15,
            reason:cutImages?'captioned-horizontal-vertical-four-cut-lineup':
                'global-color-caption-boundary'});
    }
    candidates.sort((a,b)=>b.score-a.score || a.start-b.start);
    return candidates[0]||null;
}
async function assessOcrSequence(images,{ocrReader,inspector,detailsPos=null,captionHints=[]}={}){
    if(typeof ocrReader!=="function")return null;
    void inspector;
    const limit=Math.min(images.length,MAX_OCR_PROBES);
    const evidence=[],readErrors=[];
    let lastPositive=-1,firstPositive=-1;
    for(let i=0;i<limit;i++){
        let read={text:""};
        try{
            read=await ocrReader(images[i].url);
            if(typeof read==="string")read={text:read};
            read=read||{text:""};
            if(read.error)readErrors.push({index:i,message:String(read.error)});
        }catch(e){
            read={text:""};readErrors.push({index:i,message:String(e?.message||e)});
        }
        // Full-image Detail signals outweigh cropped/tile color labels. HTML
        // captions can rescue a missed image caption, but cannot override a
        // positive Feature/Details finding from the original image.
        const parsed=analyzeOcrText([read.text,read.fullText,read.captionText,
            ...(Array.isArray(read.tileTexts)?read.tileTexts:[])].filter(Boolean).join("\n"));
        const full=read.fullText?analyzeOcrText(read.fullText):null;
        const hint=captionHints[i]?.isLabel?captionHints[i]:null;
        const labels=[...new Map([...parsed.labels,...(hint?[hint]:[])]
            .map(label=>[label.key,label])).values()];
        const hasDetailSignal=Boolean(parsed.hasDetailSignal||full?.hasDetailSignal||
            read.hasFullImageDetailSignal);
        const hasCut=isSupportedMultiCut(read.layout);
        const variant=labels.length>0&&!hasDetailSignal&&!read.error;
        evidence.push({...parsed,labels,hasLabel:labels.length>0,
            hasDetailSignal,layout:read.layout||null,hasCut,
            variant,signature:read.signature||null,ocrError:Boolean(read.error)});
        if(variant){
            if(firstPositive<0)firstPositive=i;
            lastPositive=i;
        }
        // A few introductory creatives are allowed. Do not turn a long
        // details-only gallery into a slow full-gallery OCR scan.
        if(firstPositive<0&&i>=MAX_CREATIVE_PREFIX+3)break;
        // Read several following images before fixing the boundary. Missing
        // one OCR caption is common; do not switch sections immediately.
        if(lastPositive>=0&&i-lastPositive>=MAX_UNLABELED_LOOKAHEAD)break;
    }
    const best=chooseLineupBoundary(evidence,{total:images.length,detailsPos,readErrors});
    const error=readErrors.map(e=>`image ${e.index+1}: ${e.message}`).join(" | ").slice(0,260);
    if(best)return {...best,analyzed:evidence.length,error,evidence,
        ocrErrors:readErrors.length,visualConflict:best.shapeBreak,
        ambiguousGap:best.bridged.length>0};
    return {start:0,count:0,confident:false,analyzed:evidence.length,error,
        evidence,ocrErrors:readErrors.length,
        reason:"no-confirmed-complete-variation-group"};
}

// Computes only the consecutive, confidently similar starting group, not a
// count copied from a configurable default. Every probe stays in memory.
function assessVisualSignatures(signatures,{detailsLimit=null}={}){
    const list=signatures||[];
    let matchCount=0,scoreSum=0;
    const cap=detailsLimit==null?list.length:Math.min(list.length,detailsLimit);
    if(cap<3||!list[0]?.lightBackground)return {count:0,confident:false,reason:"not-enough-variation-evidence"};
    // Require a stable anchor as well as adjacent matches. Different shooting
    // angles of the same non-variant product should not become a Line Up.
    for(let i=1;i<cap;i++){
        const anchor=compareShapes(list[0],list[i]);
        const previous=compareShapes(list[i-1],list[i]);
        if(!anchor.match||!previous.match)break;
        matchCount=i+1;scoreSum+=Math.min(anchor.score,previous.score);
    }
    const average=matchCount>1?scoreSum/(matchCount-1):0;
    const capReached=matchCount===cap && cap===list.length;
    return {count:matchCount>=4?matchCount:0,
        confident:matchCount>=4 && average>=0.77 && !capReached,
        capped:capReached,average,reason:matchCount>=4?"repeated-white-background-silhouette":"not-enough-variation-evidence"};
}

// Every automatic route is checked for actual color-caption support and
// details signals. Ambiguous images are Details+REVIEW, not guessed Line Up.
async function smartSplitImages(discovery,{lineupCount=null,sourceHtml="",inspector=fetchSignature,
    visualEnabled=true,ocrReader=null}={}){
    const images=discovery.images||[];
    if(!images.length)throw new Error("No source images to classify.");
    const warnings=[...(discovery.warnings||[])];
    const result=(count,method,extraWarnings=[],start=0,meta={})=>{
        const boundary=start+count;
        const classifiedEvidence={...meta,selectedStart:start,boundaryAfter:boundary,
            imageEvidence:(meta.imageEvidence||[]).map(entry=>({
                ...entry,assignedSection:entry.position<=start?"CREATIVE":
                    entry.position<=boundary?"LINE_UP":"DETAILS"}))};
        return {intro:images.slice(0,start).map(x=>x.url),
            lineup:images.slice(start,boundary).map(x=>x.url),
            details:images.slice(boundary).map(x=>x.url),
            introCount:start,lineupCount:count,detailsCount:images.length-boundary,
            method,warnings:[...warnings,...extraWarnings],
            classificationEvidence:classifiedEvidence};
    };
    if(lineupCount!==null && lineupCount!==""){
        const count=Number(lineupCount);
        if(!Number.isInteger(count)||count<0||count>images.length)
            throw new Error(`Line Up Count must be a whole number from 0 to ${images.length}.`);
        return result(count,"manual-excel-override");
    }
    const hasDetailsHeading=discovery.detailsOffset>=0;
    const detailsPos=images.filter(x=>x.offset<(hasDetailsHeading?discovery.detailsOffset:Infinity)).length;
    const structure=htmlStructure(sourceHtml,discovery);
    const ocr=await assessOcrSequence(images,{ocrReader,
        inspector:visualEnabled?inspector:null, captionHints:structure.captions,
        detailsPos:hasDetailsHeading?detailsPos:null});
    const evidence=ocr?.evidence||[];
    const detailAt=(from,to)=>{
        for(let i=from;i<to && i<evidence.length;i++)if(evidence[i]?.hasDetailSignal)return i;
        return -1;
    };
    const meta=()=>({ocrAnalyzed:ocr?.analyzed||0,ocrError:ocr?.error||null,
        boundaryAfter:ocr?.count?(ocr.start+ocr.count):null,
        verifiedOcrCount:ocr?.positives||0,bridgedCaptionPositions:(ocr?.bridged||[]).map(i=>i+1),
        boundaryUncertain:Boolean(ocr?.uncertainty),
        verifiedOcrCaptions:evidence.filter(x=>x.variant).length,
        detailSignals:evidence.filter(x=>x.hasDetailSignal).length,
        // Compact per-source-image audit; no OCR contents or photo bytes are
        // persisted. Inspect the first 40 original positions for debugging.
        imageEvidence:evidence.slice(0,40).map((entry,i)=>({position:i+1,
            colorLabels:entry.labels.map(v=>v.key).slice(0,5),
            detailSignal:Boolean(entry.hasDetailSignal),
            cutType:entry.layout?.type||"unknown",
            candidate:Boolean(entry.variant),
            missingCaptionBridge:Boolean(ocr?.bridged?.includes(i))}))});

    // Captions INSIDE images take precedence over approximate HTML heading
    // placement; the source may use one generic DETAILS heading for a gallery.
    if(ocr?.count && ocr.confident){
        const concerns=[];
        const boundary=ocr.start+ocr.count;
        if(ocr.start)concerns.push(`${ocr.start} creative image(s) before the verified Line Up; inspect their placement.`);
        if(hasDetailsHeading&&detailsPos!==boundary)concerns.push(
            `Original DETAILS position is after ${detailsPos} images; verified caption sequence ends after ${boundary}. Review conflicting source markup.`);
        if(ocr.bridged?.length)concerns.push(
            `OCR missed a color caption at original image position(s) ${ocr.bridged.map(x=>x+1).join(", ")}; flanking confirmed variants kept the image in Line Up. Verify in the JPEG.`);
        if(ocr.laterLabels)concerns.push(
            `Possible additional color captions occur after the proposed Details boundary; manually verify the split.`);
        if(ocr.ocrErrors)concerns.push(
            `${ocr.ocrErrors} image OCR read(s) failed; verify classification before publishing.`);
        if(ocr.visualConflict)concerns.push(
            "Next image has a different product silhouette despite OCR color text; moved it to DETAILS. Verify this boundary.");
        else if(ocr.hasBoundary){
            const next=evidence[boundary];
            if(next&&!next.hasDetailSignal)concerns.push(
                "Line Up ends at an image without a confirmed Details label. Verify the boundary.");
        }
        return result(ocr.count,ocr.gridImages?
            "image-ocr-captioned-multicut-lineup":"image-ocr-color-caption-sequence",
            concerns,ocr.start,meta());
    }
    if(ocr?.error)warnings.push(
        `Image OCR unavailable or incomplete: ${ocr.error.slice(0,130)}. Do not trust the automatic Line Up count.`);
    if(ocr?.visualConflict)warnings.push(
        "Image silhouettes changed within a captioned run; possible Details mixed with Line Up.");
    if(ocr?.count&&!ocr.confident)warnings.push(
        "Possible colors detected, but the full sequence/boundary is not confirmed. Check images and set LINEUP COUNT if necessary.");

    // Explicit headings are hints, not proof. v1.6 could accept an entire
    // interval with dozens of detail images if only TWO image captions were
    // confirmed. v1.7 requires positive evidence on EVERY member here; OCR
    // gap recovery belongs exclusively to the sequence detector above.
    const variationHeading=structure.variationMarkers.find(x=>(!hasDetailsHeading||x.offset<discovery.detailsOffset) &&
        images.filter(img=>img.offset<x.offset).length<=MAX_CREATIVE_PREFIX);
    if(variationHeading && hasDetailsHeading && detailsPos<images.length){
        const start=images.filter(img=>img.offset<variationHeading.offset).length;
        if(detailsPos>start){
            const early=detailAt(start,detailsPos);
            if(early>=0){
                warnings.push(`A source COLOR heading contains a Detail image at gallery position ${early+1}; not treating the entire interval as variations.`);
                // When OCR saw a real contiguous variation run before that
                // Detail image, use ONLY verified members; otherwise fail safe.
                const verified=evidence.slice(start,early).filter(x=>x.variant);
                const distinct=new Set(verified.flatMap(x=>x.labels.map(label=>label.key)));
                if(!ocr?.error && !ocr?.visualConflict &&
                    verified.length===early-start && verified.length>=2 && distinct.size>=2)
                    return result(early-start,"source-heading-truncated-by-detail-evidence",
                        ["Details signal ended the color sequence early. Review this corrected boundary."],start,meta());
            }else if((typeof ocrReader!=="function" ||
                (!ocr?.error && !ocr?.visualConflict &&
                    evidence.length>=detailsPos &&
                    evidence.slice(start,detailsPos).every(x=>x.variant&&!x.hasDetailSignal) &&
                    detailsPos-start>=2 &&
                    new Set(evidence.slice(start,detailsPos).flatMap(x=>x.labels.map(label=>label.key))).size>=2))){
                const caution=(ocr && evidence.length)?[
                    "Source headings supplied the boundary; verify image-level colors against Details."]:[];
                if(start)caution.push(`${start} creative image(s) before variation heading preserved.`);
                return result(detailsPos-start,"source-variation-and-details-heading",
                    caution,start,meta());
            }else{
                warnings.push("Source variation heading could not be corroborated by OCR; leaving images in Details.");
            }
        }
    }

    // HTML image-adjacent captions must be REAL color names, not repeated
    // generic labels such as 'Color'. Validate negatives found by image OCR.
    for(let start=0;start<=MAX_CREATIVE_PREFIX && start<structure.captions.length;start++){
        if(!structure.captions[start]?.isLabel)continue;
        let count=0;const keys=new Set();
        while(structure.captions[start+count]?.isLabel && (!hasDetailsHeading||
            images[start+count]?.offset<discovery.detailsOffset)){
            const idx=start+count;
            if(evidence[idx]?.hasDetailSignal)break;
            keys.add(structure.captions[idx].key);count++;
        }
        if(count>=3&&keys.size>=2&&start+count<images.length && !ocr?.error &&
            (!ocr || (evidence.length>=start+count &&
                evidence.slice(start,start+count).filter(x=>x.variant).length>=2))){
            return result(count,"repeated-color-captions",
                ["HTML labels define the group; review the last variation against the first Details image.",
                    ...(start?[`${start} leading creative image(s) preserved.`]:[])],start,meta());
        }
    }
    if(hasDetailsHeading&&detailsPos===0 && typeof ocrReader!=="function")
        return result(0,"source-details-only",[],0,meta());
    if(hasDetailsHeading&&detailsPos===0&&ocr&&!ocr.count&&!ocr.error)
        return result(0,"source-details-only",[],0,meta());
    // v1.6 deliberately removes SILHOUETTE-ONLY auto-promotion: a series of
    // product-angle/feature images often shares the same white background,
    // crop and outline. Shapes/cuts are SUPPORT only, not classification.
    return result(0,"details-first-review",[
        "No verified color-caption group and safe boundary. All unverified images remain in DETAILS; use LINEUP COUNT to correct after visual QC."
    ],0,meta());
}
module.exports={smartSplitImages,htmlStructure,assessOcrSequence,chooseLineupBoundary,assessVisualSignatures,compareShapes,signatureFromBuffer,fetchSignature};
