"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const fs=require("fs"),os=require("os"),path=require("path");
const {readJobs,writeResults}=require("../src/core/excel");
const {StandaloneBatch}=require("../src/core/batch");
const {iframeUrl,discoverImages,splitImages,generateSnippet}=require("../src/core/iframeHtml");
const {prepareSingleImage,looksLikeSingleSource,safeSingleImageUrl}=require("../src/core/iframeSingle");
const {legacyCombineJpegHtml}=require("../src/core/iframeJpegLayout");
const {Preferences}=require("../src/core/preferences");
const {smartSplitImages,compareShapes,assessVisualSignatures}=require("../src/core/variationClassifier");

// Minimal ExcelJS-compatible workbook in tests. Production app uses the real
// ExcelJS package; this fixture verifies the exact result columns & file writes.
class Cell{
    constructor(){this.value=null;this.text="";this.font={};this.alignment={};this.fill={};}
}
class Row{
    constructor(){this.cells=new Map();this.height=0;}
    getCell(n){if(!this.cells.has(n))this.cells.set(n,new Cell());return this.cells.get(n);}
    get cellCount(){return this.cells.size?Math.max(...this.cells.keys()):0;}
}
class Sheet{
    constructor(name,rows){this.name=name;this.rows=new Map();this.columns=new Map();this.views=[];
        rows.forEach((cells,i)=>cells.forEach((value,j)=>{this.getRow(i+1).getCell(j+1).value=value;}));}
    getRow(n){if(!this.rows.has(n))this.rows.set(n,new Row());return this.rows.get(n);}
    get rowCount(){return this.rows.size?Math.max(...this.rows.keys()):0;}
    get columnCount(){return this.rowCount?Math.max(...[...this.rows.values()].map(r=>r.cellCount),0):0;}
    getColumn(n){if(!this.columns.has(n))this.columns.set(n,{width:10});return this.columns.get(n);}
    eachRow(callback){for(let i=1;i<=this.rowCount;i++)if(this.rows.has(i))callback(this.getRow(i),i);}
    spliceColumns(col,remove,...insert){
        const amount=insert.length-remove;
        for(const row of this.rows.values()){
            const old=[...row.cells.entries()];row.cells.clear();
            for(const [key,cell] of old){if(key<col)row.cells.set(key,cell);else if(key>=col+remove)row.cells.set(key+amount,cell);}
            for(let i=0;i<insert.length;i++)if(insert[i]!==undefined)row.getCell(col+i).value=insert[i];
        }
    }
}
class Book{
    constructor(sheets){this.worksheets=sheets;this.xlsx={
        readFile:async()=>{},writeFile:async outfile=>{
            const dumped=Object.fromEntries(this.worksheets.map(ws=>[ws.name,
                [...ws.rows.entries()].map(([row,r])=>[row,...[...r.cells.entries()].map(([col,cell])=>[col,cell.value])]) ]));
            await fs.promises.writeFile(outfile,JSON.stringify(dumped,null,2));
        }
    };}
}
const iframe=(id)=>`<iframe src="https://www.rakuten.ne.jp/gold/glv/six/test/${id}.html" scrolling="no" frameborder="0" width="780" height="610"></iframe>`;
const srcPage=(stem,n=13,split=3)=>`<html><body>${split>0?"<h2>COLOR VARIATION</h2>":""}${Array.from({length:n},(_,i)=>
    `${i===split?'<h2>DETAILS</h2>':''}<img src="https://image.rakuten.co.jp/glv/cabinet/test/${stem}_${i+1}.jpg">`).join('')}</body></html>`;

test("parses 780px HTML with 2 line-up and 3 details, 28px heading",()=>{
    const url=iframeUrl(iframe("TNR-90"));
    const found=discoverImages(srcPage("tnr-90",13,3),url);
    const split=splitImages(found,{lineupCount:3});
    assert.equal(split.lineup.length,3);assert.equal(split.details.length,10);
    assert.equal(split.method,"manual-excel-override");
    const html=generateSnippet(split);
    assert.match(html,/<img [^>]*width="380"/);assert.match(html,/<img [^>]*width="250"/);
    assert.match(html,/font-size:28px/);assert.match(html,/<td><\/td>/);
    assert.doesNotMatch(html,/<iframe/i);
});

test("JPEG uses classic 600px two-column layout with optional data or remote Single",()=>{
    const split={lineup:["https://image.rakuten.co.jp/glv/cabinet/test/a_1.jpg"],
        details:["https://image.rakuten.co.jp/glv/cabinet/test/a_2.jpg"]};
    const without=legacyCombineJpegHtml(split);
    assert.match(without,/width:600px/);
    assert.match(without,/grid-template-columns:293px 293px/);
    assert.doesNotMatch(without,/class="bf-single"/);
    const withSingle=legacyCombineJpegHtml({...split,single:"data:image/jpeg;base64,aGk="});
    assert.match(withSingle,/class="bf-single"/);assert.match(withSingle,/margin:-3px -3px 15px/);
    assert.equal((withSingle.match(/class="bf-slot bf-/g)||[]).length,4);
});

test("readJobs detects Single + iframe across sheets and optional per-row lineup counts",()=>{
    const book=new Book([
        new Sheet("Brand1",[["SINGLE IMAGE PATH","IFRAME","LINEUP COUNT","BRAND"],["single/TNR-90.jpg",iframe("TNR-90"),3,"tenera"],["",iframe("SEC-84"),2,"secrid"]]),
        new Sheet("Brand2",[["Notes","IFRAME"],["x",iframe("ALI-20")]])
    ]);
    const {jobs,sheets,singleCount}=readJobs(book);
    assert.equal(jobs.length,3);assert.equal(sheets.length,2);assert.equal(singleCount,1);
    assert.equal(jobs[0].singlePath,"single/TNR-90.jpg");assert.equal(jobs[0].lineupCount,"3");
    assert.equal(jobs[1].singlePath,"");assert.equal(jobs[2].sheet,"Brand2");
});

test("writes HTML immediately after original iframe, preserving additional columns",()=>{
    const source=new Sheet("Brand1",[["SINGLE IMAGE PATH","IFRAME","LINEUP COUNT","BRAND"],
        ["single/TNR-90.jpg",iframe("TNR-90"),3,"tenera"],["",iframe("SEC-84"),2,"secrid"]]);
    const book=new Book([source]);const read=readJobs(book);
    writeResults(book,read.sheets,[
        {sheet:"Brand1",row:2,status:"READY",code:"<table>one</table>",htmlFile:"/a/b/tnr-90.html",jpegFile:"/a/b/tnr-90.jpg",lineupCount:3,detailsCount:10,method:"manual",jpegStatus:"READY",singleStatus:"INCLUDED"},
        {sheet:"Brand1",row:3,status:"REVIEW",code:"<table>two</table>",htmlFile:"/a/b/sec-84.html",jpegFile:null,lineupCount:2,detailsCount:10,method:"default-review",jpegStatus:"FAILED",singleStatus:"OPTIONAL / NONE",warning:"Missing image"}
    ]);
    assert.equal(source.getRow(1).getCell(2).value,"IFRAME");
    assert.equal(source.getRow(1).getCell(3).value,"OUTPUT");
    assert.equal(source.getRow(1).getCell(4).value,"HTML FILE LINK");
    assert.equal(source.getRow(1).getCell(5).value,"JPEG FILE LINK");
    assert.equal(source.getRow(2).getCell(2).value,iframe("TNR-90"));
    assert.equal(source.getRow(2).getCell(3).value,"<table>one</table>");
    assert.match(source.getRow(2).getCell(4).value.hyperlink,/tnr-90.html$/);
    assert.match(source.getRow(2).getCell(5).value.hyperlink,/tnr-90.jpg$/);
    assert.equal(source.getRow(2).getCell(6).value,3);
    assert.equal(source.getRow(2).getCell(7).value,"tenera");
    assert.equal(source.getRow(3).getCell(5).value,null);
});

test("standalone batch auto-saves beside Excel and creates HTML + JPEG for every row",async()=>{
    const temp=await fs.promises.mkdtemp(path.join(os.tmpdir(),"standalone-batch-test-"));
    try{
        const excel=path.join(temp,"IFRAMES.xlsx");await fs.promises.writeFile(excel,"test workbook");
        const book=new Book([new Sheet("Items",[["SINGLE IMAGE PATH","IFRAME","LINEUP COUNT"],
            ["images/TNR-90.jpg",iframe("TNR-90"),3],["",iframe("SEC-84"),null]])]);
        let images=[],singles=[],captures=[];
        const renderer={capture:async(file,jpeg,{expectedImages,renderHtml})=>{
            captures.push({file,jpeg,expectedImages,renderHtml});
            assert.match(renderHtml,/600px/);
            await fs.promises.writeFile(jpeg,Buffer.from("fake-jpeg"));
            return {width:600,height:1000};
        },close:async()=>{}};
        const service=new StandaloneBatch({
            excelFactory:()=>book,
            rendererFactory:()=>renderer,
            singlePreparer:async(value,source)=>{singles.push({value,source});return {dataUri:"data:image/jpeg;base64,aGk="};},
            fetcher:async(url)=>{images.push(url);return{buffer:Buffer.from(srcPage(path.basename(new URL(url).pathname,".html").toLowerCase(),13,3)),contentType:"text/html"};}
        });
        const progress=[];
        const output=await service.generate(excel,{defaultLineupCount:3,progress:d=>progress.push(d)});
        assert.equal(output.total,2);assert.equal(output.htmlFiles,2);assert.equal(output.jpegReady,2);
        assert.equal(output.singleIncluded,1);assert.equal(output.cancelled,false);
        assert.equal(path.dirname(output.outputFolder),temp);
        assert.equal(singles[0].value,"images/TNR-90.jpg");assert.equal(singles[0].source,excel);
        assert.deepEqual(captures.map(x=>x.expectedImages).sort((a,b)=>a-b),[13,14]);
        assert.equal(captures.filter(x=>x.renderHtml.includes('class="bf-single"')).length,1);
        const files=await fs.promises.readdir(path.join(output.outputFolder,"PASSED","HTML_FILES"));
        assert.equal(files.length,1,"local-only Single requires review because HTML cannot contain its PC path");
        assert.equal((await fs.promises.readdir(path.join(output.outputFolder,"ERRORS","HTML_FILES"))).length,1);
        const html=await fs.promises.readFile(path.join(output.outputFolder,"PASSED","HTML_FILES",files[0]),"utf8");
        assert.match(html,/class="eb-gallery-table"/);assert.match(html,/width:780px/);assert.doesNotMatch(html,/data:image\/jpeg;base64/);
        assert.equal((await fs.promises.readdir(path.join(output.outputFolder,"PASSED","JPEG_FILES"))).length,1);
        assert.equal((await fs.promises.readdir(path.join(output.outputFolder,"ERRORS","JPEG_FILES"))).length,1);
        assert.equal((await fs.promises.stat(output.resultsExcel)).isFile(),true);
        assert.equal(progress.at(-1).stage,"complete");
    }finally{await fs.promises.rm(temp,{recursive:true,force:true});}
});

test("remembers last Excel folder + lineup count across restarts",async()=>{
    const dir=await fs.promises.mkdtemp(path.join(os.tmpdir(),"standalone-prefs-test-"));
    try{
        let prefs=new Preferences(dir);
        assert.equal((await prefs.load()).defaultLineupCount,3);
        await prefs.save({lastExcelFolder:dir,lastOutputFolder:dir,lastResultsExcel:path.join(dir,"RESULT.xlsx"),defaultLineupCount:4});
        prefs=new Preferences(dir);
        assert.deepEqual(await prefs.load(),{lastExcelFolder:dir,lastOutputFolder:dir,lastResultsExcel:path.join(dir,"RESULT.xlsx"),defaultLineupCount:4});
    }finally{await fs.promises.rm(dir,{recursive:true,force:true});}
});

test("1,000-row bulk run preserves row order and one HTML/JPEG pair per product (mock network/renderer)",async()=>{
    const temp=await fs.promises.mkdtemp(path.join(os.tmpdir(),"standalone-1000-test-"));
    try{
        const input=path.join(temp,"THOUSAND.xlsx");await fs.promises.writeFile(input,"mock workbook");
        const rows=[["IFRAME","LINEUP COUNT"]];
        for(let i=0;i<1000;i++)rows.push([iframe(`SKU-${String(i).padStart(4,'0')}`),3]);
        const book=new Book([new Sheet("PRODUCTS",rows)]);
        const service=new StandaloneBatch({
            excelFactory:()=>book,
            fetcher:async(url)=>({buffer:Buffer.from(srcPage("sku-1000",9,3)),contentType:"text/html"}),
            rendererFactory:()=>({capture:async(_html,jpeg)=>{await fs.promises.writeFile(jpeg,"jpeg-stub");},close:async()=>{}})
        });
        const output=await service.generate(input,{});
        assert.equal(output.total,1000);assert.equal(output.ready,1000);assert.equal(output.jpegReady,1000);
        assert.equal((await fs.promises.readdir(path.join(output.outputFolder,"PASSED","HTML_FILES"))).length,1000);
        assert.equal((await fs.promises.readdir(path.join(output.outputFolder,"PASSED","JPEG_FILES"))).length,1000);
        assert.equal(book.worksheets[0].getRow(1001).getCell(1).value,iframe("SKU-0999"));
        assert.match(book.worksheets[0].getRow(1001).getCell(2).value,/class="eb-gallery-table"/);
    }finally{await fs.promises.rm(temp,{recursive:true,force:true});}
});

const yahooSingle="https://item-shopping.c.yimg.jp/i/n/glv_abu-90";

test("Yahoo image URL without .jpg suffix is treated as a Single image URL",async()=>{
    assert.equal(looksLikeSingleSource(yahooSingle),true);
    assert.equal(safeSingleImageUrl(yahooSingle),yahooSingle);
    assert.equal(looksLikeSingleSource("https://item-shopping.c.yimg.jp/i/n/glv_abu-90?foo=bar"),true);
    const result=await prepareSingleImage(yahooSingle,"/tmp/placeholder.xlsx");
    assert.deepEqual(result,{kind:"remote",sourcePath:yahooSingle,dataUri:yahooSingle,htmlUrl:yahooSingle});
    assert.throws(()=>safeSingleImageUrl("http://item-shopping.c.yimg.jp/i/n/glv_abu-90"),/HTTPS/i);
    assert.throws(()=>safeSingleImageUrl("https://example.com/single.jpg"),/image host/i);
    assert.throws(()=>safeSingleImageUrl("https://item-shopping.c.yimg.jp.evil.com/i/n/glv_abu-90"),/image host/i);
});

test("780px HTML injects a Yahoo Single before Line Up, preserving 3-column Details",()=>{
    const split={lineup:["https://image.rakuten.co.jp/glv/cabinet/test/one_1.jpg",
        "https://image.rakuten.co.jp/glv/cabinet/test/one_2.jpg"],
        details:["https://image.rakuten.co.jp/glv/cabinet/test/one_3.jpg"]};
    const code=generateSnippet(split,{singleUrl:yahooSingle});
    assert.match(code,/<img src="https:\/\/item-shopping.c.yimg.jp\/i\/n\/glv_abu-90" width="780" alt="Single">/);
    assert.ok(code.indexOf(yahooSingle) < code.indexOf("one_1.jpg"));
    assert.ok(code.indexOf("one_1.jpg") < code.indexOf("DETAILS"));
    assert.ok(code.indexOf("DETAILS") < code.indexOf("one_3.jpg"));
    assert.match(code,/height="15"/);
    assert.match(code,/width="380"/);
    assert.match(code,/width="250"/);
    assert.doesNotMatch(generateSnippet(split),/item-shopping/);
    assert.throws(()=>generateSnippet(split,{singleUrl:"https://evil.example/image.jpg"}),/image host/i);
    const jpeg=legacyCombineJpegHtml({...split,single:yahooSingle});
    assert.ok(jpeg.indexOf(yahooSingle)<jpeg.indexOf("one_1.jpg"));
    assert.match(jpeg,/class="bf-single"/);
});

test("Excel reads SINGLE IMAGE URL / PATH and hyperlink-only Single cells",()=>{
    const book=new Book([new Sheet("Products",[
        ["SINGLE IMAGE URL / PATH","IFRAME","LINEUP COUNT"],
        [yahooSingle,iframe("ABU-90"),3],
        [{text:"Open Single",hyperlink:yahooSingle},iframe("ABU-91"),2]
    ])]);
    const scan=readJobs(book);
    assert.equal(scan.jobs.length,2);
    assert.deepEqual(scan.jobs.map(j=>j.singlePath),[yahooSingle,yahooSingle]);
    assert.equal(scan.singleCount,2);
    const headerless=new Book([new Sheet("Products",[[yahooSingle,iframe("ABU-90")]])]);
    assert.equal(readJobs(headerless).jobs[0].singlePath,yahooSingle);
});

test("end-to-end remote Single appears in HTML cell, exported HTML, and JPEG render",async()=>{
    const temp=await fs.promises.mkdtemp(path.join(os.tmpdir(),"standalone-yahoo-single-"));
    try {
        const excel=path.join(temp,"YAHOO.xlsx");await fs.promises.writeFile(excel,"mock workbook");
        const book=new Book([new Sheet("Products",[
            ["SINGLE IMAGE URL / PATH","IFRAME","LINEUP COUNT"],
            [yahooSingle,iframe("ABU-90"),2]
        ])]);
        let renderHtml="",imageCount=null;
        const service=new StandaloneBatch({
            excelFactory:()=>book,
            fetcher:async()=>({buffer:Buffer.from(srcPage("abu-90",5,2)),contentType:"text/html"}),
            rendererFactory:()=>({capture:async(_html,jpeg,{renderHtml:html,expectedImages})=>{
                renderHtml=html;imageCount=expectedImages;
                await fs.promises.writeFile(jpeg,"mock jpg");
            },close:async()=>{}})
        });
        const result=await service.generate(excel,{});
        assert.equal(result.ready,1);
        assert.equal(result.htmlSingleIncluded,1);
        assert.equal(result.jpegReady,1);
        assert.equal(result.singleIncluded,1);
        assert.equal(imageCount,6);
        assert.match(renderHtml,/class="bf-single"/);
        assert.ok(renderHtml.indexOf(yahooSingle)<renderHtml.indexOf("abu-90_1.jpg"));
        const ws=book.worksheets[0];
        assert.equal(ws.getRow(2).getCell(1).value,yahooSingle);
        assert.equal(ws.getRow(2).getCell(2).value,iframe("ABU-90"));
        const code=ws.getRow(2).getCell(3).value;
        assert.ok(code.indexOf(yahooSingle)<code.indexOf("abu-90_1.jpg"));
        assert.equal(ws.getRow(2).getCell(4).value.text.endsWith(".html"),true);
        assert.equal(ws.getRow(2).getCell(5).value.text.endsWith(".jpg"),true);
        const files=await fs.promises.readdir(path.join(result.outputFolder,"PASSED","HTML_FILES"));
        const html=await fs.promises.readFile(path.join(result.outputFolder,"PASSED","HTML_FILES",files[0]),"utf8");
        assert.ok(html.indexOf(yahooSingle)<html.indexOf("abu-90_1.jpg"));
        assert.match(html,/<img src="https:\/\/item-shopping.c.yimg.jp/);
    }finally {await fs.promises.rm(temp,{recursive:true,force:true});}
});

test("invalid Single source is flagged REVIEW and valid details still generate a partial JPEG",async()=>{
    const temp=await fs.promises.mkdtemp(path.join(os.tmpdir(),"standalone-invalid-single-"));
    try {
        const excel=path.join(temp,"INVALID.xlsx");await fs.promises.writeFile(excel,"mock workbook");
        const book=new Book([new Sheet("Products",[
            ["SINGLE IMAGE URL","IFRAME"],
            ["https://example.com/malicious.jpg",iframe("ABU-90")]
        ])]);
        let captureCount=0;
        const service=new StandaloneBatch({
            excelFactory:()=>book,
            fetcher:async()=>({buffer:Buffer.from(srcPage("abu-90",5,2)),contentType:"text/html"}),
            rendererFactory:()=>({capture:async(_html,jpeg)=>{captureCount++;await fs.promises.writeFile(jpeg,"JPEG without Single");},close:async()=>{}})
        });
        const result=await service.generate(excel,{});
        assert.equal(result.failed,0);
        assert.equal(result.review,1);
        assert.equal(result.rows[0].jpegStatus,"READY");
        assert.equal(result.jpegReady,1);
        assert.equal(result.htmlSingleIncluded,0);
        assert.equal(captureCount,1);
        assert.equal((await fs.promises.readdir(path.join(result.outputFolder,"ERRORS","JPEG_FILES"))).length,1);
        assert.match(book.worksheets[0].getRow(2).getCell(2).value,/<iframe/);
        assert.match(JSON.stringify(result.rows),/Single source invalid/);
        assert.match(JSON.stringify(result.rows),/HTTPS/);
    }finally {await fs.promises.rm(temp,{recursive:true,force:true});}
});

test("real rak1-normal-item.xlsx layout: C iframe, D OUTPUT, E Yahoo Single; errors remain visible",()=>{
    const second="https://item-shopping.c.yimg.jp/i/n/glv_aby-70";
    const invalid="https://item-shopping.c.yimg.jp/i/n/glv_ara-0";
    const ws=new Sheet("rak1-normal-item",[
        ["商品管理番号（商品URL）","商品番号",null," ",null],
        ["abu-90","ABU-90",iframe("ABU-90")," ",yahooSingle],
        ["aby-70","ABY-70",iframe("ABY-70")," ",second],
        ["ara-0","ARA-0",{error:"#VALUE!"}," ",invalid]
    ]);
    const book=new Book([ws]);
    const scan=readJobs(book);
    assert.equal(scan.jobs.length,3);
    assert.equal(scan.singleCount,3);
    assert.equal(scan.invalidIframeCount,1);
    assert.equal(scan.sheets[0].iframeCol,3);
    assert.equal(scan.sheets[0].singleCol,5);
    assert.equal(scan.sheets[0].isRak1Format,true);
    assert.deepEqual(scan.jobs.map(x=>x.singlePath),[yahooSingle,second,invalid]);
    assert.match(scan.jobs[2].inputError,/C4: #VALUE!/);
    writeResults(book,scan.sheets,[
        {sheet:ws.name,row:2,status:"READY",code:`<table>${yahooSingle}</table>`,htmlFile:"/tmp/ABU-90.html",jpegFile:"/tmp/ABU-90.jpg",singleStatus:"INCLUDED HTML+JPEG",jpegStatus:"READY"},
        {sheet:ws.name,row:3,status:"READY",code:`<table>${second}</table>`,htmlFile:"/tmp/ABY-70.html",jpegFile:"/tmp/ABY-70.jpg",singleStatus:"INCLUDED HTML+JPEG",jpegStatus:"READY"},
        {sheet:ws.name,row:4,status:"FAILED",code:"",htmlFile:null,jpegFile:null,singleStatus:"NOT CHECKED",jpegStatus:"NOT GENERATED",warning:scan.jobs[2].inputError}
    ]);
    assert.equal(ws.getRow(1).getCell(4).value,"OUTPUT");
    assert.equal(ws.getRow(1).getCell(6).value,"HTML FILE LINK");
    assert.equal(ws.getRow(1).getCell(7).value,"JPEG FILE LINK");
    assert.equal(ws.getRow(2).getCell(3).value,iframe("ABU-90"));
    assert.equal(ws.getRow(2).getCell(5).value,yahooSingle); // E never moves
    assert.equal(ws.getRow(3).getCell(5).value,second);
    assert.equal(ws.getRow(4).getCell(5).value,invalid);
    assert.deepEqual(ws.getRow(4).getCell(3).value,{error:"#VALUE!"});
    assert.equal(ws.getRow(2).getCell(4).value,`<table>${yahooSingle}</table>`);
    assert.match(ws.getRow(2).getCell(6).value.hyperlink,/ABU-90.html$/);
    assert.match(ws.getRow(2).getCell(7).value.hyperlink,/ABU-90.jpg$/);
    assert.equal(ws.getRow(4).getCell(8).value,"FAILED");
    assert.equal(ws.getRow(4).getCell(7).value,null);
});

test("actual C/D/E input saves a partial Single-only JPEG/HTML when iframe is #VALUE!",async()=>{
    const dir=await fs.promises.mkdtemp(path.join(os.tmpdir(),"combine-actual-format-"));
    try{
        const input=path.join(dir,"rak1-normal-item.xlsx");await fs.promises.writeFile(input,"mock spreadsheet");
        const book=new Book([new Sheet("rak1-normal-item",[
            ["商品管理番号（商品URL）","商品番号",null," ",null],
            ["abu-90","ABU-90",iframe("ABU-90")," ",yahooSingle],
            ["ara-0","ARA-0",{error:"#VALUE!"}," ","https://item-shopping.c.yimg.jp/i/n/glv_ara-0"]
        ])]);
        const captures=[];
        const app=new StandaloneBatch({
            excelFactory:()=>book,
            fetcher:async()=>({buffer:Buffer.from(srcPage("abu-90",6,2)),contentType:"text/html"}),
            rendererFactory:()=>({capture:async(_html,jpeg,opts)=>{
                captures.push(opts);
                await fs.promises.writeFile(jpeg,"mock JPG");
            },close:async()=>{}})
        });
        const out=await app.generate(input,{defaultLineupCount:2});
        assert.equal(out.total,2);
        assert.equal(out.invalidIframeCount,1);
        assert.equal(out.ready,1);
        assert.equal(out.failed,0);
        assert.equal(out.review,1);
        assert.equal(out.htmlSingleIncluded,2);
        assert.equal(out.jpegReady,2);
        assert.equal(captures.length,2);
        const full=captures.find(x=>x.expectedImages===7);
        assert.ok(full);
        assert.ok(full.renderHtml.indexOf(yahooSingle)<full.renderHtml.indexOf("abu-90_1.jpg"));
        const ws=book.worksheets[0];
        assert.ok(ws.getRow(2).getCell(4).value.indexOf(yahooSingle)<ws.getRow(2).getCell(4).value.indexOf("abu-90_1.jpg"));
        assert.equal(ws.getRow(2).getCell(5).value,yahooSingle);
        assert.match(ws.getRow(3).getCell(8).value,/REVIEW/);
        assert.equal(ws.getRow(3).getCell(5).value,"https://item-shopping.c.yimg.jp/i/n/glv_ara-0");
        assert.equal((await fs.promises.readdir(path.join(out.outputFolder,"PASSED","HTML_FILES"))).length,1);
        assert.equal((await fs.promises.readdir(path.join(out.outputFolder,"PASSED","JPEG_FILES"))).length,1);
        assert.equal((await fs.promises.readdir(path.join(out.outputFolder,"ERRORS","HTML_FILES"))).length,1);
        assert.equal((await fs.promises.readdir(path.join(out.outputFolder,"ERRORS","JPEG_FILES"))).length,1);
    } finally {await fs.promises.rm(dir,{recursive:true,force:true});}
});

test("cannot overwrite populated D or move E for actual C/D/E format",()=>{
    const source=new Sheet("rak1-normal-item",[
        ["商品管理番号（商品URL）","商品番号",null,"OTHER DATA",null],
        ["abu-90","ABU-90",iframe("ABU-90"),"Important value",yahooSingle]
    ]);
    const book=new Book([source]),scan=readJobs(book);
    assert.throws(()=>writeResults(book,scan.sheets,[]),/Refusing to overwrite data/);
    assert.equal(source.getRow(2).getCell(4).value,"Important value");
    assert.equal(source.getRow(2).getCell(5).value,yahooSingle);
});

test("rerun prefers original E Single over previously generated JPEG hyperlinks in G",()=>{
    const sheet=new Sheet("rak1-normal-item",[
        ["商品管理番号（商品URL）","商品番号",null,"OUTPUT",null,"HTML FILE LINK","JPEG FILE LINK"],
        ["abu-90","ABU-90",iframe("ABU-90"),"<table>old</table>",yahooSingle,
            {text:"ABU-90.html",hyperlink:"file:///tmp/ABU-90.html"},
            {text:"ABU-90.jpg",hyperlink:"file:///tmp/ABU-90.jpg"}]
    ]);
    const book=new Book([sheet]),info=readJobs(book);
    assert.equal(info.sheets[0].singleCol,5);
    assert.equal(info.jobs[0].singlePath,yahooSingle);
    writeResults(book,info.sheets,[{sheet:sheet.name,row:2,status:"READY",code:"<table>NEW</table>",
        htmlFile:"/tmp/NEW.html",jpegFile:"/tmp/NEW.jpg",singleStatus:"INCLUDED HTML+JPEG",jpegStatus:"READY"}]);
    assert.equal(sheet.getRow(2).getCell(5).value,yahooSingle);
    assert.equal(sheet.getRow(2).getCell(4).value,"<table>NEW</table>");
    assert.equal(sheet.getRow(2).getCell(6).value.text,"NEW.html");
    assert.equal(sheet.getRow(2).getCell(7).value.text,"NEW.jpg");
});

// User-reported failures: sandals / general product angles are DETAILS, a
// regular suitcase color grid is Line Up, and bottle promotional text/images
// cannot become Line Up merely because they are first in the source page.
function syntheticSignature(shape="suitcase",variant=0){
    const size=48,mask=new Uint8Array(size*size);
    for(let y=0;y<size;y++)for(let x=0;x<size;x++){
        let inside=false;
        if(shape==="suitcase") inside=x>=9 && x<=39 && y>=5 && y<=42 &&
            !(variant%3===1 && x>=24 && x<=25 && y>=8 && y<=40);
        if(shape==="bottle") inside=((x-24)**2)/70+((y-28)**2)/150<1;
        if(shape==="landscape") inside=x>=3 && x<=44 && y>=14 && y<=32;
        if(shape==="closeup") inside=x>=3 && x<=44 && y>=3 && y<=44 && x+y<65;
        if(inside)mask[y*size+x]=1;
    }
    let minX=size,minY=size,maxX=0,maxY=0;
    for(let y=0;y<size;y++)for(let x=0;x<size;x++)if(mask[y*size+x]){
        minX=Math.min(x,minX);minY=Math.min(y,minY);maxX=Math.max(x+1,maxX);maxY=Math.max(y+1,maxY);
    }
    return {mask,bbox:[minX,minY,maxX,maxY],aspect:0.8,lightBackground:true};
}
function pageWithoutLabels(stem,n,detailsAt=null){
    return `<html><body>${Array.from({length:n},(_,i)=>
        `${i===detailsAt?'<h2>DETAILS</h2>':''}<img src="https://image.rakuten.co.jp/glv/cabinet/test/${stem}_${i+1}.jpg">`).join("")}</body></html>`;
}

test("STRICT: ordinary sandals from multiple angles are all DETAILS, not first-three variations",async()=>{
    const html=pageWithoutLabels("sandal",7,3);
    const images=discoverImages(html,iframeUrl(iframe("SANDAL")));
    const shapes=["landscape","bottle","closeup","landscape","closeup","bottle","landscape"];
    const result=await smartSplitImages(images,{sourceHtml:html,inspector:async(url)=>{
        const idx=Number(/_(\d+)\.jpg$/.exec(url)[1])-1;
        return syntheticSignature(shapes[idx]);
    }});
    assert.equal(result.lineupCount,0);assert.equal(result.detailsCount,7);
    assert.equal(result.method,"details-first-review");
    assert.match(result.warnings.join(" "),/DETAILS/);
    const jpeg=legacyCombineJpegHtml({lineup:result.lineup,details:result.details});
    assert.doesNotMatch(jpeg,/class="bf-lineup"/);
    assert.ok(jpeg.indexOf('class="bf-details"')>=0);
});

test("SAFETY: 10 similar white-background photos without captions are NOT automatically Line Up",async()=>{
    const html=pageWithoutLabels("case",13,10);
    const parsed=discoverImages(html,iframeUrl(iframe("CASE")));
    let probes=0;
    const result=await smartSplitImages(parsed,{sourceHtml:html,inspector:async(url)=>{
        probes++;
        const index=Number(/_(\d+)\.jpg$/.exec(url)[1])-1;
        return index<10?syntheticSignature("suitcase",index):syntheticSignature("bottle");
    }});
    assert.equal(result.lineupCount,0);assert.equal(result.detailsCount,13);
    assert.equal(result.method,"details-first-review");
    assert.equal(probes,0); // shape matching alone no longer promotes Details
    assert.match(result.warnings.join(" "),/No verified color/);
});

test("STRICT: bottle promo text / lifestyle images before DETAILS are DETAILS, not variations",async()=>{
    const html=pageWithoutLabels("bottle",10,3).replace('<img src="https://image.rakuten.co.jp/glv/cabinet/test/bottle_1.jpg">',
        '<p>460ml bottle and available sizes</p><img src="https://image.rakuten.co.jp/glv/cabinet/test/bottle_1.jpg">');
    const parsed=discoverImages(html,iframeUrl(iframe("BOTTLE")));
    const result=await smartSplitImages(parsed,{sourceHtml:html,inspector:async(url)=>{
        const index=Number(/_(\d+)\.jpg$/.exec(url)[1])-1;
        return syntheticSignature(["closeup","landscape","bottle"][index%3]);
    }});
    assert.equal(result.lineupCount,0);assert.equal(result.detailsCount,10);
    assert.doesNotMatch(generateSnippet(result),/width="380"/);
    assert.equal((generateSnippet(result).match(/width="250"/g)||[]).length,10);
});

test("STRICT: explicit COLOR VARIATION heading + DETAILS is authoritative, including 2 variants",async()=>{
    const html=`<h2>COLOR VARIATION</h2>${Array.from({length:2},(_,i)=>`<img src="https://image.rakuten.co.jp/glv/cabinet/test/two_${i+1}.png">`).join("")}<h2>DETAILS</h2><img src="https://image.rakuten.co.jp/glv/cabinet/test/two_3.jpg">`;
    const parsed=discoverImages(html,iframeUrl(iframe("TWO")));
    const result=await smartSplitImages(parsed,{sourceHtml:html,inspector:async()=>{throw new Error("no visual probe should be required");}});
    assert.equal(result.lineupCount,2);assert.equal(result.detailsCount,1);
    assert.equal(result.method,"source-variation-and-details-heading");
});

test("STRICT: pure DETAILS section from first image skips empty Line Up and raises the details block",async()=>{
    const html=`<h2>DETAILS</h2><img src="https://image.rakuten.co.jp/glv/cabinet/test/a_1.png">`;
    const parsed=discoverImages(html,iframeUrl(iframe("DETAILS")));
    const result=await smartSplitImages(parsed,{sourceHtml:html,inspector:async()=>{throw new Error("no visual probe should be required");}});
    assert.equal(result.lineupCount,0);assert.equal(result.detailsCount,1);
    assert.equal(result.warnings.length,0);
    const rendered=legacyCombineJpegHtml({...result,single:yahooSingle});
    assert.match(rendered,/class="bf-single"/);
    assert.doesNotMatch(rendered,/class="bf-lineup"/);
    assert.ok(rendered.indexOf('class="bf-single"')<rendered.indexOf('class="bf-details"'));
});

test("STRICT: no color captions / only .png URLs and white backgrounds cannot prove variations",async()=>{
    const html=pageWithoutLabels("no_color",3,null).replace(/\.jpg/g,'.png');
    const parsed=discoverImages(html,iframeUrl(iframe("NO-COLOR")));
    const result=await smartSplitImages(parsed,{sourceHtml:html,inspector:async(url)=>{
        const index=Number(/_(\d+)\.png$/.exec(url)[1])-1;
        return syntheticSignature(["landscape","bottle","closeup"][index]);
    }});
    assert.equal(result.lineupCount,0);assert.equal(result.detailsCount,3);
    assert.match(result.warnings.join(" "),/No verified/);
});

test("STRICT: repeated markup color labels are recognized without changing image text",async()=>{
    const html=`${Array.from({length:3},(_,i)=>`<img src="https://image.rakuten.co.jp/glv/cabinet/test/shade_${i+1}.png"><span>${["BLACK","RED","WHITE"][i]}</span>`).join("")}`+
        `<h2>DETAILS</h2><img src="https://image.rakuten.co.jp/glv/cabinet/test/shade_4.jpg">`;
    const parsed=discoverImages(html,iframeUrl(iframe("SHADE")));
    const result=await smartSplitImages(parsed,{sourceHtml:html,inspector:async()=>{throw new Error("should not probe");}});
    assert.equal(result.lineupCount,3);assert.equal(result.detailsCount,1);
    assert.equal(result.method,"repeated-color-captions");
});

test("STRICT: manual LINEUP COUNT=0 overrides even an explicit variation heading",async()=>{
    const html=srcPage("manual",5,3);
    const parsed=discoverImages(html,iframeUrl(iframe("MANUAL")));
    const result=await smartSplitImages(parsed,{sourceHtml:html,lineupCount:0,inspector:async()=>{throw new Error("should not probe");}});
    assert.equal(result.lineupCount,0);assert.equal(result.detailsCount,5);
    assert.equal(result.method,"manual-excel-override");
});

test("CLEAR removes last result shortcuts but remembers the last Excel input folder",async()=>{
    const dir=await fs.promises.mkdtemp(path.join(os.tmpdir(),"standalone-clear-"));
    try{
        const prefs=new Preferences(dir);
        await prefs.save({lastExcelFolder:dir,lastOutputFolder:dir,lastResultsExcel:path.join(dir,"OLD.xlsx")});
        const next=await prefs.clearRecentResults();
        assert.equal(next.lastExcelFolder,dir);
        assert.equal(next.lastOutputFolder,"");
        assert.equal(next.lastResultsExcel,"");
        assert.deepEqual(await prefs.load(),next);
    }finally{await fs.promises.rm(dir,{recursive:true,force:true});}
});

test("EXISTING end to end: all iframe images stay in original order, Single remains first",async()=>{
    const dir=await fs.promises.mkdtemp(path.join(os.tmpdir(),"standalone-details-only-"));
    try{
        const input=path.join(dir,"ITEMS.xlsx");await fs.promises.writeFile(input,"test");
        const book=new Book([new Sheet("rak1-normal-item",[
            ["商品管理番号（商品URL）","商品番号",null," ",null],
            ["bottle","BOTTLE",iframe("BOTTLE")," ",yahooSingle]
        ])]);
        let jpegDoc="";
        const service=new StandaloneBatch({
            excelFactory:()=>book,
            fetcher:async()=>({buffer:Buffer.from(pageWithoutLabels("bottle",6,3)),contentType:"text/html"}),
            visualInspector:async(url)=>syntheticSignature(["landscape","closeup","bottle"][Number(/_(\d+)\.jpg$/.exec(url)[1])%3]),
            rendererFactory:()=>({capture:async(_html,jpeg,{renderHtml})=>{jpegDoc=renderHtml;await fs.promises.writeFile(jpeg,"fake jpeg");},close:async()=>{}})
        });
        const result=await service.generate(input);
        assert.equal(result.review,0);assert.equal(result.ready,1);
        assert.equal(result.htmlSingleIncluded,1);assert.equal(result.singleIncluded,1);
        assert.equal(result.rows[0].lineupCount,null);
        assert.equal(result.rows[0].galleryCount,6);
        assert.doesNotMatch(jpegDoc,/class="bf-lineup"/);
        assert.doesNotMatch(jpegDoc,/class="bf-details"/);
        assert.ok(jpegDoc.indexOf(yahooSingle)<jpegDoc.indexOf('class="eb-gallery"'));
        const row=book.worksheets[0].getRow(2);
        assert.equal(row.getCell(5).value,yahooSingle);
        assert.ok(row.getCell(4).value.indexOf(yahooSingle)<row.getCell(4).value.indexOf("alt=\"Product 1\""));
        assert.match(row.getCell(4).value,/<table class="eb-gallery-table" width="780"/);
        assert.equal((row.getCell(4).value.match(/class="eb-gallery-row"/g)||[]).length,3);
        assert.doesNotMatch(row.getCell(4).value,/>DETAILS</);
    }finally{await fs.promises.rm(dir,{recursive:true,force:true});}
});

test("SAFETY: a weak silhouette, even with a DETAILS heading, needs color-caption proof",async()=>{
    const html=pageWithoutLabels("luggage",13,10);
    const parsed=discoverImages(html,iframeUrl(iframe("LUGGAGE")));
    const result=await smartSplitImages(parsed,{sourceHtml:html,inspector:async(url)=>{
        const idx=Number(/_(\d+)\.jpg$/.exec(url)[1]);
        if(idx===5)return syntheticSignature("landscape"); // low-contrast outlier
        return idx<=10?syntheticSignature("suitcase",idx):syntheticSignature("bottle");
    }});
    assert.equal(result.lineupCount,0);
    assert.equal(result.detailsCount,13);
    assert.equal(result.method,"details-first-review");
    assert.match(result.warnings.join(" "),/No verified color/);
});

test("JPEG height measures the generated content, not a reused browser viewport",async()=>{
    const {ElectronJpegRenderer}=require("../src/core/iframeJpegRenderer");
    const renderer=new ElectronJpegRenderer();
    let measuredExpression="";
    const dims=await renderer.measure({executeJavaScript:async(script)=>{
        measuredExpression=script;
        return {width:600,height:814};
    }});
    assert.deepEqual(dims,{width:600,height:814});
    assert.match(measuredExpression,/main\.bf-page/);
    assert.match(measuredExpression,/getBoundingClientRect/);
    assert.doesNotMatch(measuredExpression,/document\.body\.scrollHeight/);
});

test("STRICT actual screenshot-like RGB shapes: same product silhouettes in different colors support variations",async()=>{
    const sharp=require("sharp");
    const {signatureFromBuffer}=require("../src/core/variationClassifier");
    const png=async(color)=>sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400"><rect width="300" height="400" fill="white"/><rect x="40" y="40" width="220" height="320" rx="28" fill="${color}" stroke="#555" stroke-width="3"/></svg>`)).png().toBuffer();
    const green=await signatureFromBuffer(await png("#39865b"));
    const blue=await signatureFromBuffer(await png("#478cda"));
    const brown=await signatureFromBuffer(await png("#8e7465"));
    assert.equal(green.lightBackground,true);
    assert.equal(blue.lightBackground,true);
    assert.equal(compareShapes(green,blue).match,true);
    assert.equal(compareShapes(green,brown).match,true);
});

test("Result Excel supplies a blank LINEUP COUNT reviewer override for next run",()=>{
    const ws=new Sheet("rak1-normal-item",[
        ["商品管理番号（商品URL）","商品番号",null," ",null],
        ["abu-90","ABU-90",iframe("ABU-90")," ",yahooSingle]
    ]);
    const book=new Book([ws]),scan=readJobs(book);
    writeResults(book,scan.sheets,[{sheet:ws.name,row:2,status:"REVIEW",code:"<table>demo</table>",
        htmlFile:"/tmp/demo.html",jpegFile:"/tmp/demo.jpg",lineupCount:0,detailsCount:4,
        method:"details-first-review",singleStatus:"INCLUDED HTML+JPEG",jpegStatus:"READY"}]);
    let col=null;
    for(let c=1;c<=ws.columnCount;c++)if(ws.getRow(1).getCell(c).value==="LINEUP COUNT")col=c;
    assert.ok(col>7);
    assert.equal(ws.getRow(2).getCell(col).value,null);
    ws.getRow(2).getCell(col).value=2;
    const secondScan=readJobs(book);
    assert.equal(secondScan.jobs[0].lineupCount,"2");
    assert.equal(secondScan.jobs[0].singlePath,yahooSingle);
});
