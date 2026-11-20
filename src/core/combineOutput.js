"use strict";

// The SAME validated image sequence drives the HTML table and the JPEG
// compositor, irrespective of PASSED/ERRORS routing. Broken detail URLs have
// been removed before this step; surviving images are reflowed left-to-right.
const {galleryImages,existingBrandSnippet,existingBrandJpegHtml}=require('./existingBrand');
const {standaloneHtml}=require('./iframeHtml');

function buildExistingCombineOutput({images=[],single=null,singleUrl=null}={}){
    const gallery=galleryImages(images,{allowEmpty:Boolean(single)});
    if(!gallery.length&&!single)throw new Error('Cannot build a Combine without validated images.');
    const isLocalSingle=Boolean(single&&!singleUrl);
    // Remote Singles are embedded by URL. A local Single is embedded only in
    // the REVIEW file and never copied into Rakuten's Excel OUTPUT cell.
    const htmlSnippet=existingBrandSnippet(gallery,{
        singleUrl:singleUrl||null,
        previewSingle:isLocalSingle?single:null
    });
    return {
        gallery,
        single,
        htmlSnippet,
        htmlDocument:standaloneHtml(htmlSnippet),
        jpegHtml:existingBrandJpegHtml({images:gallery,single}),
        expectedImages:gallery.length+(single?1:0),
        galleryRows:Math.ceil(gallery.length/2),
        htmlPublishable:!isLocalSingle,
        layout:'SINGLE_TOP_THEN_TWO_COLUMNS'
    };
}

module.exports={buildExistingCombineOutput};
