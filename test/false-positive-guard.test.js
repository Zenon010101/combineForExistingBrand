"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {smartSplitImages}=require("../src/core/variationClassifier");
const {discoverImages}=require("../src/core/iframeHtml");
const {ColorCaptionOcr}=require("../src/core/imageOcr");
const {parseColorCaption}=require("../src/core/colorCaption");
const {legacyCombineJpegHtml}=require("../src/core/iframeJpegLayout");

function page(entries,{prefix="",detailsAt=null,variationAt=null,postfix=""}={}){
    let html=prefix;
    const urls=[];
    for(let i=0;i<entries.length;i++){
        if(variationAt===i)html+="<h2>COLOR VARIATIONS</h2>";
        if(detailsAt===i)html+="<h2>DETAILS</h2>";
        const url=`https://image.rakuten.co.jp/glv/cabinet/testing/guard_${i+1}.jpg`;
        urls.push(url);html+=`<img src="${url}">`;
    }
    html+=postfix;
    const discovery=discoverImages(html,"https://www.rakuten.ne.jp/gold/glv/six/guard.html");
    const ocrReader=async url=>entries[urls.indexOf(url)];
    return {html,discovery,ocrReader};
}
const unavailable=async()=>{throw Error("not needed");};

// This was the direct root cause: a cropped bottom OCR label previously meant
// the full image was SKIPPED, thereby missing an upper feature heading.
test("Detail images with bottom color names and full-image specifications cannot enter Line Up",async()=>{
    const samples=["BLACK","WHITE","RED"].map(color=>({
        text:color,captionText:color,
        fullText:`${color}\nMATERIAL: leather\nHandle details`,
        hasFullImageDetailSignal:true
    })).concat([{text:"Close-up side"}]);
    const x=page(samples);
    const out=await smartSplitImages(x.discovery,{sourceHtml:x.html,ocrReader:x.ocrReader,inspector:unavailable});
    assert.equal(out.lineupCount,0);assert.equal(out.detailsCount,4);
    assert.ok(out.classificationEvidence.detailSignals>=3);
    assert.equal(out.method,"details-first-review");
});

test("Four-cut feature collage with incidental colors is Details",async()=>{
    const samples=[
        {text:"BLACK\nWHITE\nRED\nInside pocket\nStorage",layout:{type:"four-cut",cuts:4,confidence:.93}},
        {text:"BLUE\nMaterial: cotton",layout:{type:"horizontal",cuts:2,confidence:.92}},
        {text:"Navy\nHeight 30cm"}
    ];
    const x=page(samples);
    const out=await smartSplitImages(x.discovery,{sourceHtml:x.html,ocrReader:x.ocrReader});
    assert.equal(out.lineupCount,0);assert.equal(out.introCount,0);
});

test("First genuine 3 variations stop before a Detail image with bottom RED and text on top",async()=>{
    const samples=[{text:"100 WHITE"},{text:"101 ECRU"},{text:"990 BLACK"},
        {captionText:"RED",fullText:"RED\nBack side\nFabric detail"},
        {text:"material texture"}];
    const x=page(samples);
    const out=await smartSplitImages(x.discovery,{sourceHtml:x.html,ocrReader:x.ocrReader,inspector:unavailable});
    assert.equal(out.lineupCount,3);assert.equal(out.detailsCount,2);
    const html=legacyCombineJpegHtml(out);
    assert.ok(html.indexOf("guard_3.jpg")<html.indexOf(">DETAILS</h2>"));
    assert.ok(html.indexOf(">DETAILS</h2>")<html.indexOf("guard_4.jpg"));
});

test("Wrong source heading that includes a material photo cannot force it into Line Up",async()=>{
    const samples=[{text:"100 WHITE"},{text:"990 BLACK"},
        {text:"Material: POLYESTER\nFEATURE"},
        {text:"Height 30cm"},
        {text:"Detail view"}];
    const x=page(samples,{variationAt:0,detailsAt:4});
    const out=await smartSplitImages(x.discovery,{sourceHtml:x.html,ocrReader:x.ocrReader});
    assert.equal(out.lineupCount,2);assert.equal(out.detailsCount,3);
    assert.match(out.warnings.join(" "),/Detail image|Detail|boundary/i);
});

test("Bare 'color' HTML text three times is not evidence of variation",async()=>{
    const sample=[{text:""},{text:""},{text:""},{text:""}];
    let html=sample.map((_,i)=>`<img src="https://image.rakuten.co.jp/glv/cabinet/testing/blank_${i}.jpg"><span>color</span>`).join("");
    const discovery=discoverImages(html,"https://www.rakuten.ne.jp/gold/glv/six/blank.html");
    const out=await smartSplitImages(discovery,{sourceHtml:html,ocrReader:async()=>({text:""})});
    assert.equal(out.lineupCount,0);
    assert.equal(out.detailsCount,4);
});

test("Two leading creatives remain outside the actual color group",async()=>{
    const samples=[{text:"Welcome to the collection"},{text:"Lifestyle photo"},
        {text:"100 WHITE"},{text:"101 ECRU"},{text:"990 BLACK"},
        {text:"Material: fabric"},{text:"Zoom detail"}];
    const x=page(samples);
    const out=await smartSplitImages(x.discovery,{sourceHtml:x.html,ocrReader:x.ocrReader,inspector:unavailable});
    assert.equal(out.introCount,2);
    assert.equal(out.lineupCount,3);
    assert.equal(out.detailsCount,2);
});

test("Brand-specific Japanese numbered mixed colorway is recognized without broad free-text matching",()=>{
    assert.equal(parseColorCaption("7. シルバードーン/ホワイト").isLabel,true);
    assert.equal(parseColorCaption("7. シルバードーン/ホワイト MATERIAL").isLabel,false);
    assert.equal(parseColorCaption("BLACK inside pocket").isLabel,false);
});

test("OCR engine always checks entire image after a bottom-band color label",async()=>{
    const sharp=require("sharp");
    const buffer=await sharp({create:{width:320,height:400,channels:3,background:"white"}}).png().toBuffer();
    let calls=0;
    const ocr=new ColorCaptionOcr({fetchImage:async()=>({buffer,contentType:"image/png"}),
        createWorker:async()=>({recognize:async()=>({data:{text:++calls===1?"BLACK":"DETAILS\nMATERIAL 100% cotton\nBLACK"}}),terminate:async()=>{}})});
    try{
        const response=await ocr.recognizeUrl("https://image.rakuten.co.jp/glv/cabinet/testing/a.png");
        assert.equal(calls,2);
        assert.equal(response.hasFullImageDetailSignal,true);
        assert.ok(response.fullText.includes("MATERIAL"));
    }finally{await ocr.close();}
});

function shape(x0,y0,x1,y1){
    const mask=new Uint8Array(48*48);
    for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++)mask[y*48+x]=1;
    return {mask,bbox:[x0,y0,x1,y1],aspect:1,lightBackground:true};
}

test("Even when a detail angle has an incidental color label, silhouette break keeps it out",async()=>{
    const a=shape(10,8,40,42),detail=shape(1,1,15,15);
    const samples=["100 WHITE","101 ECRU","990 BLACK"].map(text=>({text,signature:a}))
        .concat([{text:"BLUE",signature:detail},{text:"Other photos",signature:detail}]);
    const x=page(samples);
    const out=await smartSplitImages(x.discovery,{sourceHtml:x.html,ocrReader:x.ocrReader});
    assert.equal(out.lineupCount,3);
    assert.equal(out.detailsCount,2);
    assert.match(out.warnings.join(" "),/silhouette/);
});

test("Unrelated detail-angle photos with different silhouettes remain Details even with color words",async()=>{
    const samples=[{text:"BLACK",signature:shape(3,3,18,18)},
        {text:"BLUE",signature:shape(28,28,46,46)},
        {text:"RED",signature:shape(10,10,45,45)},
        {text:"WHITE",signature:shape(8,35,42,46)}];
    const x=page(samples);
    const out=await smartSplitImages(x.discovery,{sourceHtml:x.html,ocrReader:x.ocrReader});
    assert.equal(out.lineupCount,0);
    assert.equal(out.detailsCount,4);
});
