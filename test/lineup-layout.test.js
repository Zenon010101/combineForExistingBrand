"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {detectLayoutFromGray}=require("../src/core/lineupLayout");
const {smartSplitImages}=require("../src/core/variationClassifier");
const {discoverImages,generateSnippet}=require("../src/core/iframeHtml");
const {legacyCombineJpegHtml}=require("../src/core/iframeJpegLayout");

function surface(rectangles,w=240,h=240){
    const gray=Buffer.alloc(w*h,255);
    for(const [x0,y0,x1,y1] of rectangles)for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++)gray[y*w+x]=80;
    return detectLayoutFromGray(gray,w,h);
}
const left=[20,30,94,206],right=[146,30,218,206];
const upper=[20,20,218,94],lower=[20,146,218,220];
const grid=[[18,16,93,93],[146,16,224,93],[18,146,93,224],[146,146,224,224]];
test("detects Slider Maker horizontal two-up layout",()=>{
    const l=surface([left,right]);assert.equal(l.type,"horizontal");assert.equal(l.cuts,2);
    assert.ok(l.confidence>=.65);
});
test("detects Slider Maker vertical two-up layout",()=>{
    const l=surface([upper,lower]);assert.equal(l.type,"vertical");assert.equal(l.cuts,2);
});
test("detects Slider Maker 4-cut / 2x2 layout",()=>{
    const l=surface(grid);assert.equal(l.type,"four-cut");assert.equal(l.cuts,4);
});
test("one uninterrupted detail image has no cut-layout evidence",()=>{
    const l=surface([[35,23,207,220]]);assert.equal(l.type,"single");
});
function gallery(labels){
    const html=labels.map((_,i)=>`<img src="https://image.rakuten.co.jp/glv/cabinet/test/example_${i+1}.jpg">`).join("");
    const found=discoverImages(html,"https://www.rakuten.ne.jp/gold/glv/six/example.html");
    const ocrReader=async url=>{
        const index=Number(/_(\d+)\.jpg/.exec(url)?.[1])-1;
        return labels[index];
    };
    return {html,found,ocrReader};
}
test("one creative image stays above confirmed Line Up and DETAILS comes after",async()=>{
    const labels=[
        {text:"Premium collection\nNew season"},
        {text:"100 WHITE",layout:surface([left,right])},
        {text:"101 IVORY"},{text:"997 VOLCAN"},{text:"Material: cotton\n30cm"},
        {text:"Detail angle photograph"}
    ];
    const {html,found,ocrReader}=gallery(labels);
    const x=await smartSplitImages(found,{sourceHtml:html,ocrReader,
        inspector:async()=>{throw Error("Boundary inspector mock unavailable");}});
    assert.equal(x.introCount,1);assert.equal(x.lineupCount,3);assert.equal(x.detailsCount,2);
    assert.equal(x.method,"image-ocr-captioned-multicut-lineup");
    assert.ok(x.warnings.some(s=>s.includes("creative")));
    const htmlOut=generateSnippet(x);
    const j=legacyCombineJpegHtml(x);
    for(const content of [htmlOut,j]){
        assert.ok(content.indexOf("example_1.jpg")<content.indexOf("example_2.jpg"));
        assert.ok(content.indexOf("example_4.jpg")<content.indexOf("DETAILS"));
        assert.ok(content.indexOf("DETAILS")<content.indexOf("example_5.jpg"));
    }
    assert.equal((j.match(/bf-intro/g)||[]).length>=2,true);
});
test("a four-cut image with four independent colors is one Line Up source image",async()=>{
    const labels=[
        {text:"ブラック\nホワイト\nネイビー\nレッド",layout:surface(grid)},
        {text:"Material: cotton\nSize 30cm"},
        {text:"Close-up fabric"}
    ];
    const {html,found,ocrReader}=gallery(labels);
    const x=await smartSplitImages(found,{sourceHtml:html,ocrReader,inspector:async()=>({error:true})});
    assert.equal(x.lineupCount,1);assert.equal(x.detailsCount,2);
    assert.equal(x.method,"image-ocr-captioned-multicut-lineup");
});
test("two captioned multi-cut images can establish a Line Up group",async()=>{
    const labels=[
        {text:"ブラック\nホワイト",layout:surface([left,right])},
        {text:"Yellow × Black",layout:surface([upper,lower])},
        {text:"素材・サイズ: 30cm"},{text:"Back of product"}
    ];
    const {html,found,ocrReader}=gallery(labels);
    const x=await smartSplitImages(found,{sourceHtml:html,ocrReader,inspector:async()=>({error:true})});
    assert.equal(x.lineupCount,2);
    assert.equal(x.detailsCount,2);
});
test("multi-cut details with feature text do not become Line Up",async()=>{
    const labels=[
        {text:"DETAILS\nMaterial 30cm\nBLACK",layout:surface(grid)},
        {text:"Pocket storage\nSize 30cm",layout:surface([left,right])},
        {text:"Black buckle and red zipper"}
    ];
    const {html,found,ocrReader}=gallery(labels);
    const x=await smartSplitImages(found,{sourceHtml:html,ocrReader,inspector:async()=>({error:true})});
    assert.equal(x.lineupCount,0);
    assert.equal(x.detailsCount,3);
    assert.equal(x.introCount,0);
});
test("multi-cut geometry without color names is not sufficient for Line Up",async()=>{
    const labels=[
        {text:"",layout:surface(grid)},
        {text:"",layout:surface([left,right])},
        {text:"",layout:surface([upper,lower])}
    ];
    const {html,found,ocrReader}=gallery(labels);
    const x=await smartSplitImages(found,{sourceHtml:html,ocrReader,visualEnabled:false});
    assert.equal(x.lineupCount,0);assert.equal(x.detailsCount,3);
});

test("full-bleed split photos with hard seams can still count as two cut",()=>{
    const gray=Buffer.alloc(240*240);
    for(let y=0;y<240;y++)for(let x=0;x<240;x++)gray[y*240+x]=x<120?85:175;
    const x=detectLayoutFromGray(gray,240,240);
    assert.equal(x.type,"horizontal");assert.equal(x.cuts,2);
});
test("full-bleed four-panel collage is recognized by both straight seams",()=>{
    const gray=Buffer.alloc(240*240);
    for(let y=0;y<240;y++)for(let x=0;x<240;x++)gray[y*240+x]=
        y<120?(x<120?85:170):(x<120?145:45);
    const x=detectLayoutFromGray(gray,240,240);
    assert.equal(x.type,"four-cut");assert.equal(x.cuts,4);
});
