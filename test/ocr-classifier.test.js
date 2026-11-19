"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {parseColorCaption,analyzeOcrText}=require("../src/core/colorCaption");
const {smartSplitImages}=require("../src/core/variationClassifier");
const {discoverImages}=require("../src/core/iframeHtml");
const {legacyCombineJpegHtml}=require("../src/core/iframeJpegLayout");
const {ColorCaptionOcr}=require("../src/core/imageOcr");

function page(code, captions, {detailsHeadingAt=null,headingAtStart=false}={}){
    const html=(headingAtStart?"<h2>DETAILS</h2>":"")+captions.map((_,i)=>
        `${detailsHeadingAt===i?"<h2>DETAILS</h2>":""}<img src="https://image.rakuten.co.jp/glv/cabinet/test/${code}_${i+1}.jpg">`).join("");
    const discovery=discoverImages(html,`https://www.rakuten.ne.jp/gold/glv/six/test/${code}.html`);
    const ocrReader=async url=>{
        const i=Number(/_(\d+)\.jpg/.exec(url)?.[1]||0)-1;
        return {text:captions[i]||""};
    };
    return {html,discovery,ocrReader};
}
const noVisual=async()=>{throw new Error("If OCR recognized the line up, visual evidence must not be needed.");};

test("bilingual color caption parser handles Japanese, English and separators",()=>{
    for(const label of ["Yellow x Black","YELLOW × BLACK","イエロー／ブラック",
        "Ivory × Ice × Gold","100 WHITE","997 VOLCAN","578 CANYON",
        "1. コアブラック/フットウェアホワイト","10. フットウェアホワイト/インディゴ/ガム"]){
        assert.equal(parseColorCaption(label).isLabel,true,label);
    }
    for(const detail of ["30Sheets 約23cm","Fabric: cotton, Black", "DETAILS", "black zipper and storage", "約70×140cm"]){
        assert.equal(parseColorCaption(detail).isLabel,false,detail);
    }
    assert.equal(analyzeOcrText("990 BLACK\n\n").hasLabel,true);
    assert.equal(analyzeOcrText("DETAILS\nブラック\n素材：コットン100%").hasDetailSignal,true);
});

test("ABY-71: all 9 labeled towel colors including 997 VOLCAN stay in Line Up",async()=>{
    const captions=["100 WHITE","103 IVORY","101 ECRU","383 ZANZIBAR","578 CANYON",
        "990 BLACK","770 LINEN","992 PLATINUM","997 VOLCAN","", "towel seam", "" ];
    const x=page("aby71",captions);
    const split=await smartSplitImages(x.discovery,{sourceHtml:x.html,ocrReader:x.ocrReader,inspector:noVisual});
    assert.equal(split.lineupCount,9);assert.equal(split.detailsCount,3);
    assert.equal(split.method,"image-ocr-color-caption-sequence");
    assert.match(split.warnings.join(" "),/boundary/);
    const jpg=legacyCombineJpegHtml(split);
    assert.ok(jpg.indexOf('aby71_9.jpg')<jpg.indexOf('>DETAILS</h2>'));
    assert.ok(jpg.indexOf('>DETAILS</h2>')<jpg.indexOf('aby71_10.jpg'));
    assert.equal((jpg.match(/<div class="bf-slot bf-lineup-slot">/g)||[]).length,9);
});

test("ABY-70: 4 sets of multi-color labels, then DETAILS, then product images",async()=>{
    const captions=["Ivory × Ice × Gold","Blue × Green","Nude × Blush","Ecru × Grey × Beige","","",""];
    const x=page("aby70",captions);
    const split=await smartSplitImages(x.discovery,{sourceHtml:x.html,ocrReader:x.ocrReader,inspector:noVisual});
    assert.equal(split.lineupCount,4);assert.equal(split.detailsCount,3);
    const jpg=legacyCombineJpegHtml(split);
    assert.ok(jpg.indexOf('aby70_4.jpg')<jpg.indexOf('>DETAILS</h2>'));
    assert.ok(jpg.indexOf('>DETAILS</h2>')<jpg.indexOf('aby70_5.jpg'));
    assert.match(jpg,/Hiragino Kaku Gothic Pro W3/);
    assert.match(jpg,/font-size:28px/);
});

test("ADI-8: all 14 numbered Japanese colorways are Line Up before shoe angle photos",async()=>{
    const colors=["コアブラック/フットウェアホワイト", "コアブラック/クラウドホワイト",
        "ホワイト/バーガンディー/ガム","ホワイト/インディゴ/ガム",
        "コアブラック/パワースカーレット/ガム","フットウェアホワイト/ネイビー",
        "シルバードーン/ホワイト", "フットウェアホワイト/レッド",
        "ホワイト/ナイトインディゴ", "フットウェアホワイト/ロイヤルブルー",
        "フットウェアホワイト/グリーン", "フットウェアホワイト/ビクトリー/ナイトインディゴ",
        "コアブラック/コアブラック", "コアブラック/グレーシックス"];
    const captions=colors.map((label,i)=>`${i+1}. ${label}`).concat(["", "", ""]);
    const x=page("adi8",captions);
    const split=await smartSplitImages(x.discovery,{sourceHtml:x.html,ocrReader:x.ocrReader,inspector:noVisual});
    assert.equal(split.lineupCount,14);assert.equal(split.detailsCount,3);
    const jpg=legacyCombineJpegHtml(split);
    assert.ok(jpg.indexOf('adi8_14.jpg')<jpg.indexOf('>DETAILS</h2>'));
    assert.ok(jpg.indexOf('>DETAILS</h2>')<jpg.indexOf('adi8_15.jpg'));
});

test("Source DETAILS above a color gallery cannot override verified embedded OCR labels",async()=>{
    const x=page("header",["100 WHITE","101 ECRU","990 BLACK","", ""],{headingAtStart:true});
    const split=await smartSplitImages(x.discovery,{sourceHtml:x.html,ocrReader:x.ocrReader,inspector:noVisual});
    assert.equal(split.lineupCount,3);assert.equal(split.detailsCount,2);
    assert.match(split.warnings.join(' '),/DETAILS position/);
});

test("Product feature text with an incidental color name stays in DETAILS",async()=>{
    const x=page("specs",["Black zipper and 2 pockets", "Material: BLACK polyester", "30Sheets 約23cm", "", ""]);
    const split=await smartSplitImages(x.discovery,{sourceHtml:x.html,ocrReader:x.ocrReader,
        inspector:async()=>({error:true})});
    assert.equal(split.lineupCount,0);assert.equal(split.detailsCount,5);
    assert.equal(split.method,"details-first-review");
});

test("The LINEUP COUNT workbook override wins over OCR evidence",async()=>{
    const x=page("manual",["BLACK","RED","WHITE", ""]);
    let ocrInvoked=false;
    const split=await smartSplitImages(x.discovery,{sourceHtml:x.html,lineupCount:0,
        ocrReader:async()=>{ocrInvoked=true;return "BLACK";}});
    assert.equal(split.lineupCount,0);assert.equal(ocrInvoked,false);
});

test("OCR failure is not silently treated as a successful color classification",async()=>{
    const x=page("unavail",["BLACK","RED","WHITE", ""]);
    const split=await smartSplitImages(x.discovery,{sourceHtml:x.html,
        ocrReader:async()=>({error:"Japanese OCR engine unavailable"}),
        inspector:async()=>({error:true})});
    assert.equal(split.lineupCount,0);
    assert.match(split.warnings.join(" "),/OCR unavailable/);
});

test("OCR image preprocessing works in-memory with a mocked worker",async()=>{
    const sharp=require("sharp");
    const buffer=await sharp({create:{width:640,height:800,channels:3,background:"white"}}).png().toBuffer();
    let recognizeCalls=0;
    const ocr=new ColorCaptionOcr({
        fetchImage:async()=>({buffer,contentType:"image/png"}),
        createWorker:async()=>({recognize:async()=>{recognizeCalls++;return {data:{text:"997 VOLCAN"}};},terminate:async()=>{}})
    });
    try{
        const a=await ocr.recognizeUrl("https://image.rakuten.co.jp/glv/cabinet/test/product_1.png");
        const b=await ocr.recognizeUrl("https://image.rakuten.co.jp/glv/cabinet/test/product_1.png");
        assert.ok(a.text.includes("997 VOLCAN"));assert.deepEqual(a,b);
        assert.equal(a.fullText,"997 VOLCAN");
        assert.equal(recognizeCalls,2); // full image scanned even after bottom match
    }finally{await ocr.close();}
});

test("4-cut original image retries OCR on each individual variation caption band",async()=>{
    const sharp=require("sharp");
    const patch=await sharp({create:{width:230,height:230,channels:3,background:"#5d5d5d"}}).png().toBuffer();
    const buffer=await sharp({create:{width:600,height:600,channels:3,background:"white"}})
        .composite([
            {input:patch,left:40,top:30},{input:patch,left:330,top:30},
            {input:patch,left:40,top:330},{input:patch,left:330,top:330}
        ]).png().toBuffer();
    const labels=["", "", "BLACK", "ホワイト", "BLUE", "RED"];
    let calls=0;
    const ocr=new ColorCaptionOcr({
        fetchImage:async()=>({buffer,contentType:"image/png"}),
        createWorker:async()=>({recognize:async()=>({data:{text:labels[calls++]||""}}),terminate:async()=>{}})
    });
    try{
        const x=await ocr.recognizeUrl("https://image.rakuten.co.jp/glv/cabinet/test/four.png");
        assert.equal(x.layout.type,"four-cut");
        assert.equal(calls,6);
        const result=analyzeOcrText(x.text);
        assert.equal(result.labels.length,4);
        assert.deepEqual(result.labels.map(v=>v.key),["black","ホワイト","blue","red"]);
    }finally{await ocr.close();}
});
