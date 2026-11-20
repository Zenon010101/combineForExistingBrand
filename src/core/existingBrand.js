"use strict";

// Existing Brand: Single first, followed by EXACTLY TWO IMAGE COLUMNS.
// No Line Up / Details classification. Images retain their source order and
// their aspect ratios. A source is only scaled DOWN to the standard cell width,
// never enlarged, cropped, or shrunk based on its neighbor's size.
// 600px JPEG: 3px outer margins + 293px columns + 8px gap.
// 780px Rakuten HTML: 386px image columns + 8px gap.
const {DIM}=require("./layoutConstants");
const {safeSingleImageUrl}=require("./iframeSingle");
const WIDTH=DIM.width, HTML_WIDTH=780, GAP_X=DIM.columnGap, GAP_Y=DIM.rowGap;
const HTML_CELL=(HTML_WIDTH-GAP_X)/2;
const escapeAttr=value=>String(value).replace(/&/g,"&amp;").replace(/"/g,"&quot;")
    .replace(/</g,"&lt;").replace(/>/g,"&gt;");

function galleryImages(discovery,{allowEmpty=false}={}){
    const src=Array.isArray(discovery)?discovery:discovery?.images;
    if(!Array.isArray(src)||(!allowEmpty&&src.length<1))throw new Error("Existing Brand: no source images found.");
    return src.map((item,i)=>{
        const url=typeof item==="string"?item:item?.url;
        if(typeof url!=="string"||!/^https:\/\//i.test(url))
            throw new Error(`Existing Brand: invalid image URL at ${i+1}.`);
        return url;
    });
}
function galleryRows(urls,{allowEmpty=false}={}){
    const images=galleryImages(urls,{allowEmpty}),rows=[];
    for(let i=0;i<images.length;i+=2)rows.push(images.slice(i,i+2));
    return rows;
}

// Mirrors the fixed-column renderer for unit tests and spacing diagnostics.
// Row 1: images 1 & 2; row 2: images 3 & 4. An odd final image stays left.
function calculateFlow(images,{width=WIDTH,margin=DIM.margin,columnGap=GAP_X,rowGap=GAP_Y}={}){
    const available=width-2*margin,columnWidth=(available-columnGap)/2,rows=[];
    if(!(columnWidth>0))throw new Error("Invalid two-column gallery width.");
    let y=0;
    for(let i=0;i<images.length;i+=2){
        const pair=images.slice(i,i+2),row=[];
        let rowHeight=0;
        for(let col=0;col<pair.length;col++){
            const item=pair[col];
            if(!(Number.isFinite(item.width)&&item.width>0&&Number.isFinite(item.height)&&item.height>0))
                throw new Error("Image width and height must be positive.");
            const scale=Math.min(1,columnWidth/item.width);
            const w=Math.max(1,Math.round(item.width*scale));
            const h=Math.max(1,Math.round(item.height*scale));
            const x=margin+col*(columnWidth+columnGap)+(columnWidth-w)/2;
            row.push({index:i+col,column:col,x,y,width:w,height:h,
                sourceWidth:item.width,sourceHeight:item.height,scale});
            rowHeight=Math.max(rowHeight,h);
        }
        rows.push(row);
        y+=rowHeight+rowGap;
    }
    return {width,rows,height:Math.max(0,y-rowGap),columnWidth,columnGap,rowGap};
}

function cellImage(url,i,limit){
    return `<img src="${escapeAttr(url)}" alt="Product ${i+1}" loading="eager" `+
        `style="display:block;width:auto;height:auto;max-width:${limit}px;max-height:none;border:0;object-fit:contain">`;
}
function htmlTableRows(images,{allowEmpty=false}={}){
    return galleryRows(images,{allowEmpty}).map((pair,r)=>{
        const left=`<td class="eb-cell eb-left" width="390" align="center" valign="top" style="width:390px;box-sizing:border-box;padding:0 4px 0 0;vertical-align:top">${cellImage(pair[0],r*2,HTML_CELL)}</td>`;
        const right=`<td class="eb-cell eb-right" width="390" align="center" valign="top" style="width:390px;box-sizing:border-box;padding:0 0 0 4px;vertical-align:top">${pair[1]?cellImage(pair[1],r*2+1,HTML_CELL):""}</td>`;
        const spacer=r?`<tr class="eb-gap"><td colspan="2" height="${GAP_Y}" style="height:${GAP_Y}px;font-size:0;line-height:0;padding:0"></td></tr>`:"";
        return `${spacer}<tr class="eb-gallery-row">${left}${right}</tr>`;
    }).join("\n");
}
// Local Singles can be represented in a review-only HTML file as an inline
// JPEG, preserving the actual Single + gallery Combine layout. Rakuten HTML
// must NEVER use this inline source: the batch deliberately leaves its Excel
// OUTPUT cell blank and marks the row for review instead.
function htmlSingleRows(src,{hasGallery=true,allowInlinePreview=false}={}){
    if(!src)return "";
    const valid=allowInlinePreview?validatedPreviewSingle(src):safeSingleImageUrl(src);
    // The Single is the only image allowed to occupy both columns.
    // Full bleed: the Single touches the top, left and right boundaries.
    // Preserve its aspect ratio even for a non-square Single image.
    return `<tr class="eb-single-row"><td colspan="2" width="${HTML_WIDTH}" `+
        `align="left" valign="top" style="padding:0;margin:0;line-height:0;text-align:left;vertical-align:top">`+
        `<img src="${escapeAttr(valid)}" alt="Single" width="${HTML_WIDTH}" style="display:block;width:${HTML_WIDTH}px;max-width:100%;height:auto;border:0;margin:0;padding:0"></td></tr>`+
        (hasGallery?`<tr class="eb-single-gap"><td colspan="2" height="${DIM.singleGap}" style="height:${DIM.singleGap}px;font-size:0;line-height:0;padding:0"></td></tr>`:"");
}
function validatedPreviewSingle(src){
    if(typeof src!=="string"||src.length>3_000_000||
       !/^data:image\/jpeg;base64,[a-z0-9+/]+={0,2}$/i.test(src))
        throw new Error('Local Single preview must be a valid bounded JPEG data URI.');
    return src;
}
function existingBrandSnippet(images,{singleUrl=null,previewSingle=null}={}){
    if(singleUrl&&previewSingle)throw new Error('A Single cannot be both public and local preview.');
    if(previewSingle)validatedPreviewSingle(previewSingle);
    const chosenSingle=singleUrl||previewSingle;
    const entries=galleryImages(images,{allowEmpty:Boolean(chosenSingle)});
    // Use table/tr/td for Rakuten HTML instead of flex-wrap, which could
    // collapse two columns when the image's natural size was 380px or more.
    return `<table class="eb-gallery-table" width="${HTML_WIDTH}" border="0" cellpadding="0" cellspacing="0" `+
        `style="width:${HTML_WIDTH}px;max-width:${HTML_WIDTH}px;table-layout:fixed;border-collapse:collapse;background:#fff;margin:0;padding:0"><tbody>`+
        htmlSingleRows(chosenSingle,{hasGallery:entries.length>0,allowInlinePreview:Boolean(previewSingle)})+
        htmlTableRows(entries,{allowEmpty:Boolean(chosenSingle)})+`</tbody></table>`;
}
function jpegGalleryImages(images){
    return images.map((url,i)=>`<div class="eb-image" data-order="${i+1}">${cellImage(url,i,DIM.cell)}</div>`).join("\n");
}
function existingBrandJpegHtml({images,single=null}={}){
    const entries=galleryImages(images,{allowEmpty:Boolean(single)});
    const validSingle=single?( /^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/i.test(single)
        ?single:safeSingleImageUrl(single) ):null;
    return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=${WIDTH},initial-scale=1"><title>Existing Brand Combine</title>
<style>html,body{margin:0;padding:0;overflow-x:hidden;background:white}body{width:${WIDTH}px}.bf-page{box-sizing:border-box;width:${WIDTH}px;padding:0;margin:0}
.eb-gallery{display:grid;grid-template-columns:${DIM.cell}px ${DIM.cell}px;grid-auto-flow:row;column-gap:${GAP_X}px;row-gap:${GAP_Y}px;align-items:start;justify-items:stretch;width:${DIM.dualWidth}px;margin:0 ${DIM.margin}px ${DIM.margin}px}
.eb-image{display:flex;align-items:flex-start;justify-content:center;box-sizing:border-box;width:${DIM.cell}px;min-width:0;overflow:hidden}
.eb-image img{display:block;width:auto;height:auto;max-width:${DIM.cell}px;max-height:none;border:0;object-fit:contain}
.bf-single{width:${WIDTH}px;margin:0 0 ${DIM.singleGap}px 0;padding:0;line-height:0}
.bf-single img{display:block;width:${WIDTH}px;height:auto;max-width:none;max-height:none;margin:0;padding:0;border:0}</style></head><body>
<main class="bf-page">${validSingle?`<section class="bf-single"><img src="${escapeAttr(validSingle)}" alt="Single"></section>`:""}<div class="eb-gallery">${jpegGalleryImages(entries)}</div></main></body></html>`;
}
module.exports={WIDTH,HTML_WIDTH,GAP_X,GAP_Y,HTML_CELL,galleryImages,galleryRows,calculateFlow,existingBrandSnippet,existingBrandJpegHtml};
