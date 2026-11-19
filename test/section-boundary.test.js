"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {discoverImages}=require("../src/core/iframeHtml");
const {smartSplitImages}=require("../src/core/variationClassifier");
const {legacyCombineJpegHtml}=require("../src/core/iframeJpegLayout");

function makePage(entries,{variationAt=null,detailsAt=null}={}){
    let html="";
    const urls=entries.map((_,i)=>`https://image.rakuten.co.jp/glv/cabinet/regression/item_${i+1}.jpg`);
    for(let i=0;i<entries.length;i++){
        if(variationAt===i)html+="<h2>COLOR VARIATIONS</h2>";
        if(detailsAt===i)html+="<h2>DETAILS</h2>";
        html+=`<img src="${urls[i]}">`;
    }
    const discovery=discoverImages(html,"https://www.rakuten.ne.jp/gold/glv/six/regression/item.html");
    const ocrReader=async url=>entries[urls.indexOf(url)];
    return {html,discovery,ocrReader};
}
function shape(x0,y0,x1,y1){
    const mask=new Uint8Array(48*48);
    for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++)mask[y*48+x]=1;
    return {mask,bbox:[x0,y0,x1,y1],aspect:1,lightBackground:true};
}
async function classify(samples,options={}){
    const p=makePage(samples,options);
    return smartSplitImages(p.discovery,{sourceHtml:p.html,ocrReader:p.ocrReader});
}

test("ADI-8 golden boundary: Single -> all 14 colorways -> DETAILS; OCR misses interior label",async()=>{
    const colors=["1. コアブラック/フットウェアホワイト","2. コアブラック/クラウドホワイト",
        "3. ホワイト/バーガンディー/ガム","4. ホワイト/インディゴ/ガム",
        "5. コアブラック/パワースカーレット/ガム","6. フットウェアホワイト/ネイビー",
        "7. シルバードーン/ホワイト","8. フットウェアホワイト/レッド",
        "9. ホワイト/ナイトインディゴ","10. フットウェアホワイト/ロイヤルブルー",
        "11. フットウェアホワイト/グリーン","12. フットウェアホワイト/ビクトリー/ナイトインディゴ",
        "13. コアブラック/コアブラック","14. コアブラック/グレーシックス"];
    const samples=colors.map((text,i)=>({text:i===6?"":text})).concat([
        {text:""},{text:"Rear view"},{text:"Side angle"}, {text:""},
        {text:"Heel detail"},{text:""},{text:""},{text:""},{text:"Outsole material"}
    ]);
    const result=await classify(samples);
    assert.equal(result.lineupCount,14);
    assert.equal(result.detailsCount,9);
    assert.equal(result.introCount,0);
    assert.ok(result.classificationEvidence.bridgedCaptionPositions.includes(7));
    assert.match(result.warnings.join(" "),/OCR missed a color caption/);
    const html=legacyCombineJpegHtml({...result,single:"https://item-shopping.c.yimg.jp/i/n/glv_adi-8"});
    assert.ok(html.indexOf('alt="Single image"') < html.indexOf('class="bf-lineup"'));
    assert.ok(html.indexOf('item_14.jpg') < html.indexOf('>DETAILS</h2>'));
    assert.ok(html.indexOf('>DETAILS</h2>') < html.indexOf('item_15.jpg'));
});

test("ABY-71 golden boundary: 9 towel colors; one middle caption unreadable",async()=>{
    const colors=["100 WHITE","103 IVORY","101 ECRU","383 ZANZIBAR","578 CANYON",
        "990 BLACK","770 LINEN","992 PLATINUM","997 VOLCAN"];
    const result=await classify(colors.map((x,i)=>({text:i===4?"":x})).concat([
        {text:""},{text:"Fabric texture"},{text:"Stitching detail"},{text:""}
    ]));
    assert.equal(result.lineupCount,9);
    assert.equal(result.detailsCount,4);
    assert.deepEqual(result.classificationEvidence.bridgedCaptionPositions,[5]);
});

test("ABY-70 golden boundary: 4 multi-color sets then detail close-ups",async()=>{
    const result=await classify(["Ivory x Ice x Gold","Blue x Green","Nude x Blush",
        "Ecru x Grey x Beige","","Material stitching","",""].map(text=>({text})));
    assert.equal(result.lineupCount,4);
    assert.equal(result.detailsCount,4);
});

test("One OCR exception between two confirmed color labels is bridged and flagged REVIEW",async()=>{
    const p=makePage([{text:"100 WHITE"},{text:"101 ECRU"},
        {error:"temporary fetch failure"},{text:"990 BLACK"},{text:"997 VOLCAN"},
        {text:"Details: stitched label"},{text:"Sole photo"}]);
    const result=await smartSplitImages(p.discovery,{sourceHtml:p.html,ocrReader:p.ocrReader});
    assert.equal(result.lineupCount,5);
    assert.equal(result.detailsCount,2);
    assert.match(result.warnings.join(" "),/failed/);
});

test("Detail text veto cannot be bridged even if color captions appear on BOTH sides",async()=>{
    const result=await classify([{text:"100 WHITE"},{text:"101 ECRU"},{text:"990 BLACK"},
        {text:"BLUE\nMaterial: cotton"},{text:"RED"},{text:"Sole and material"}]);
    assert.equal(result.lineupCount,3);
    assert.equal(result.detailsCount,3);
});

test("A Detail photo followed by a misleading isolated color caption is not bridged when shapes differ",async()=>{
    const same=shape(9,9,40,41),angle=shape(1,2,16,14);
    const samples=[...(["WHITE","BLACK","BLUE"].map(text=>({text,signature:same}))),
        {text:"",signature:angle},{text:"RED",signature:angle},{text:"Close-up"}];
    const result=await classify(samples);
    assert.equal(result.lineupCount,3);
    assert.equal(result.detailsCount,3);
    assert.deepEqual(result.classificationEvidence.bridgedCaptionPositions,[]);
});

test("Source COLOR heading covering ten images cannot promote eight unlabeled Details",async()=>{
    const entries=[{text:"BLACK"},{text:"WHITE"},
        {text:"Details: toe construction"},{text:"Material: leather"},{text:""},
        {text:""},{text:""},{text:""},{text:""},{text:""}];
    const result=await classify(entries,{variationAt:0,detailsAt:9});
    assert.equal(result.lineupCount,2);
    assert.equal(result.detailsCount,8);
    assert.notEqual(result.method,"source-variation-and-details-heading");
});

test("An early creative with accidental color word cannot displace a stronger later variation section",async()=>{
    const result=await classify([{text:"BLACK"},{text:"New season campaign"},
        {text:"100 WHITE"},{text:"101 ECRU"},{text:"990 BLACK"},{text:"997 VOLCAN"},
        {text:"Material information"},{text:""}]);
    assert.equal(result.introCount,2);
    assert.equal(result.lineupCount,4);
    assert.equal(result.detailsCount,2);
});

test("Unlabeled product-angle tail never enters Line Up simply because the silhouette is similar",async()=>{
    const same=shape(9,9,39,40);
    const samples=["100 WHITE","101 ECRU","990 BLACK","","","",""].map(text=>({text,signature:same}));
    const result=await classify(samples);
    assert.equal(result.lineupCount,3);
    assert.equal(result.detailsCount,4);
});

test("Do not silently accept incomplete OCR scanning when no Details boundary was actually seen",async()=>{
    const result=await classify(Array.from({length:75},(_,i)=>({text:`${100+i} BLACK`})));
    assert.equal(result.lineupCount,0);
    assert.equal(result.method,"details-first-review");
    assert.match(result.warnings.join(" "),/No verified color-caption group/);
});
