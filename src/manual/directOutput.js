"use strict";
// New Brand's JPEG renderer is independent of Photoshop/COM. It uses the exact
// BrandForge planner placements and source-preserving prepared PNGs.
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const { planJPEGParts } = require("./jpegParts");

const CAPTION_FONT = "Hiragino Kaku Gothic Pro";
const CAPTION_FONT_SIZE = 28;
const CAPTION_FONT_FAMILY = `'Hiragino Kaku Gothic Pro', 'Hiragino Kaku Gothic Pro W3', 'Yu Gothic', 'Noto Sans CJK JP', sans-serif`;
const escapeXml = value => String(value).replace(/[&<>"']/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&apos;"}[char]));

function captionsFromPrepared(job) {
    const labels = [];
    for (const entry of job.lineup || []) {
        for (const label of entry.labels || []) {
            if (!Array.isArray(label.lines) || !label.lines.length) continue;
            for (let i=0; i<label.lines.length; i++) {
                labels.push({text:String(label.lines[i]),x:Number(label.x)+Number(label.width)/2,
                    baseline:Number(label.y)+(i+1)*Number(job.geometry?.labelLine||36)-7,
                    align:"middle"});
            }
        }
    }
    if (job.detailsHeader) labels.push({text:"DETAILS",x:job.detailsHeader.x,
        baseline:job.detailsHeader.y+CAPTION_FONT_SIZE,align:"start"});
    return labels;
}
function captionsSVG(width,height,top,labels) {
    const selected=labels.filter(label=>label.baseline>=top-40&&label.baseline<=top+height+40);
    if(!selected.length)return null;
    const nodes=selected.map(label=>
        `<text x="${label.x}" y="${label.baseline-top}" fill="#1e1e1e" font-size="${CAPTION_FONT_SIZE}px" font-weight="300" `+
        `font-family="${escapeXml(CAPTION_FONT_FAMILY)}" text-anchor="${label.align}">${escapeXml(label.text)}</text>`).join("\n");
    return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${nodes}</svg>`);
}
async function renderNewBrandJPEG(prepared,folder,progress=()=>{}) {
    const {layout,job}=prepared;
    if(layout.width!==600) throw new Error("New Brand canvas width must remain 600px.");
    const all=[...(job.single?[job.single]:[]),...job.lineup,...job.details];
    const parts=planJPEGParts(layout.height,folder);
    const captions=captionsFromPrepared(job);
    progress({stage:"compositing",message:`Compositing ${all.length} images on a 600px canvas...`});
    const outputs=[];
    for(let partIndex=0;partIndex<parts.length;partIndex++) {
        const part=parts[partIndex];
        const composites=[];
        for(const entry of all){
            const top=Math.max(part.top,entry.y),bottom=Math.min(part.top+part.height,entry.y+entry.placedHeight);
            if(bottom<=top) continue;
            const cropTop=top-entry.y, cropHeight=bottom-top;
            const crop=await sharp(entry.input,{limitInputPixels:400000000})
                .extract({left:0,top:cropTop,width:entry.placedWidth,height:cropHeight})
                .png().toBuffer();
            composites.push({input:crop,left:entry.x,top:top-part.top});
        }
        // Caption is drawn last and is separate from the original image pixels.
        const overlay=captionsSVG(layout.width,part.height,part.top,captions);
        if(overlay)composites.push({input:overlay,left:0,top:0});
        progress({stage:"compositing",message:`Rendering JPEG part ${partIndex+1}/${parts.length} ...`});
        const partial=part.path+".partial";
        try {
            await sharp({create:{width:layout.width,height:part.height,channels:3,background:"#ffffff"},limitInputPixels:400000000})
                .composite(composites).jpeg({quality:94,chromaSubsampling:"4:4:4"}).toFile(partial);
            const result=await sharp(partial).metadata();
            if(result.format!=="jpeg"||result.width!==layout.width||result.height!==part.height)
                throw new Error(`JPEG part ${partIndex+1} dimensions are invalid.`);
            await fs.promises.rename(partial,part.path);
            outputs.push(part);
            progress({stage:"jpeg",message:`JPEG part ${partIndex+1}/${parts.length} ready (${layout.width} x ${part.height}px).`});
        } catch(error){await fs.promises.rm(partial,{force:true}).catch(()=>{});throw error;}
    }
    return outputs;
}
function newBrandHtml(name,parts){
    const images=parts.map((part,i)=>{
        // Relative filename: works locally and when HTML + JPEG are hosted in the same folder.
        const file=parts.length===1?`${name}.jpg`:`${name}_${String(i+1).padStart(2,"0")}.jpg`;
        return `  <tr><td><img src="${escapeXml(file)}" width="600" alt="${escapeXml(name)}${parts.length>1?` part ${i+1}`:""}" style="display:block;border:0;margin:0;padding:0;width:600px;height:auto;"></td></tr>`;
    }).join("\n");
    return `<!doctype html>\n<html lang="ja">\n<head><meta charset="utf-8"><title>${escapeXml(name)} - Combine</title></head>\n<body style="margin:0;padding:0;background:#ffffff">\n<!-- Upload each JPEG with this HTML to the same web folder. For Rakuten product-page code, replace relative image filenames with hosted HTTPS image URLs. -->\n<table width="600" border="0" cellpadding="0" cellspacing="0" role="presentation" style="border-collapse:collapse;width:600px">\n${images}\n</table>\n</body>\n</html>\n`;
}
module.exports={CAPTION_FONT,CAPTION_FONT_SIZE,CAPTION_FONT_FAMILY,renderNewBrandJPEG,newBrandHtml,captionsFromPrepared};
