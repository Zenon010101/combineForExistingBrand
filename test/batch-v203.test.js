"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const fs=require("fs"),path=require("path"),os=require("os");
const {StandaloneBatch}=require("../src/core/batch");
// Minimal ExcelJS-like workbook. Verify core batch output and worksheet input preservation.
class Cell{constructor(){this.value=null;this.text="";this.font={};this.alignment={};this.fill={};}}
class Row{constructor(){this.cells=new Map();this.height=0;}getCell(n){if(!this.cells.has(n))this.cells.set(n,new Cell());return this.cells.get(n);}get cellCount(){return this.cells.size?Math.max(...this.cells.keys()):0;}}
class Sheet{
    constructor(name,data){this.name=name;this.rows=new Map();this.columns=new Map();this.views=[];
        data.forEach((cols,i)=>cols.forEach((v,j)=>{if(v!==undefined)this.getRow(i+1).getCell(j+1).value=v;}));}
    getRow(n){if(!this.rows.has(n))this.rows.set(n,new Row());return this.rows.get(n);}
    get rowCount(){return this.rows.size?Math.max(...this.rows.keys()):0;}
    get columnCount(){return Math.max(0,...[...this.rows.values()].map(r=>r.cellCount));}
    getColumn(n){if(!this.columns.has(n))this.columns.set(n,{width:10});return this.columns.get(n);}
    eachRow(fn){for(let n=1;n<=this.rowCount;n++)if(this.rows.has(n))fn(this.rows.get(n),n);}
    spliceColumns(start,remove,...insert){const delta=insert.length-remove;
        for(const row of this.rows.values()){
            const entries=[...row.cells.entries()];row.cells.clear();
            for(const [key,cell] of entries)if(key<start)row.cells.set(key,cell);else if(key>=start+remove)row.cells.set(key+delta,cell);
            for(let n=0;n<insert.length;n++)if(insert[n]!==undefined)row.getCell(start+n).value=insert[n];
        }
    }
}
class Book{constructor(sheets){this.worksheets=sheets;this.xlsx={readFile:async()=>{},writeFile:async out=>fs.promises.writeFile(out,"mock workbook")};}}
const iframe=id=>`<iframe src="https://www.rakuten.ne.jp/gold/glv/six/test/${id}.html"></iframe>`;
const single=id=>`https://item-shopping.c.yimg.jp/i/n/glv_${id.toLowerCase()}`;
const image=i=>`https://image.rakuten.co.jp/glv/cabinet/test/part_${i}.jpg`;
function fixture(n,{invalidAt=[]}={}){
    const rows=[["商品管理番号（商品URL）","商品番号","IFRAME","OUTPUT","SINGLE"]];
    for(let i=1;i<=n;i++){
        const id=`ITEM-${String(i).padStart(3,"0")}`;
        rows.push([id,id,invalidAt.includes(i)?{error:"#VALUE!"}:iframe(id),"",single(id)]);
    }
    return new Book([new Sheet("rak1-normal-item",rows)]);
}
const fetcher=async()=>({contentType:"text/html",buffer:Buffer.from(`<html><img src="${image(1)}"><img src="${image(2)}"><img src="${image(3)}"></html>`)});
const singlePreparer=async raw=>({dataUri:raw,htmlUrl:raw});
async function withWorkbook(fn){
    const folder=await fs.promises.mkdtemp(path.join(os.tmpdir(),"rakuten-v203-batch-"));
    const excel=path.join(folder,"rak1-normal-item.xlsx");
    await fs.promises.writeFile(excel,"mock input");
    try{await fn({folder,excel});}finally{await fs.promises.rm(folder,{recursive:true,force:true});}
}
test("v2.0.3: Test 3 processes only first three valid iframe rows, preserves Excel C/E, and writes HTML then JPEG",async()=>{
    await withWorkbook(async({excel})=>{
        const book=fixture(6,{invalidAt:[2]});let captures=0;
        const rendererFactory=()=>({capture:async(_html,output,{images,single,expectedImages})=>{
            assert.equal(expectedImages,4);assert.equal(images.length,3);assert.match(single,/item-shopping/);
            captures++;await fs.promises.writeFile(output,"fake-jpeg");
        },close:async()=>{}});
        const service=new StandaloneBatch({excelFactory:()=>book,rendererFactory,fetcher,singlePreparer});
        const report=await service.generate(excel,{maxProducts:3});
        assert.equal(report.testMode,true);assert.equal(report.total,3);assert.equal(report.sourceTotal,6);
        assert.equal(report.ready,3);assert.equal(report.jpegReady,3);assert.equal(captures,3);
        assert.equal(report.invalidIframeCount,1);
        assert.deepEqual(report.rows.map(r=>r.productId),["item-001","item-003","item-004"]);
        assert.match(report.outputFolder,/COMBINE_TEST3_/);
        assert.deepEqual((await fs.promises.readdir(path.join(report.outputFolder,"PASSED","JPEG_FILES"))).sort(),
            ["item-001combine.jpg","item-003combine.jpg","item-004combine.jpg"]);
        assert.equal(book.worksheets[0].getRow(2).getCell(3).value,iframe("ITEM-001"));
        assert.equal(book.worksheets[0].getRow(2).getCell(5).value,single("ITEM-001"));
        assert.equal(book.worksheets[0].getRow(3).getCell(6).value,null,"not selected #VALUE! row remains untouched");
    });
});

test("v2.0.3: a JPEG failure becomes FAILED (not REVIEW) but preserves HTML for inspection",async()=>{
    await withWorkbook(async({excel})=>{
        const service=new StandaloneBatch({excelFactory:()=>fixture(1),fetcher,singlePreparer,
            rendererFactory:()=>({capture:async()=>{throw new Error("Image URL returned HTTP 403");},close:async()=>{}})});
        const report=await service.generate(excel);
        assert.equal(report.failed,1);assert.equal(report.review,0);assert.equal(report.jpegReady,0);
        assert.equal(report.htmlFiles,1);assert.equal(report.rows[0].jpegStatus,"FAILED");
        assert.match(report.rows[0].warning,/JPEG unavailable: Image URL returned HTTP 403/);
        assert.deepEqual(await fs.promises.readdir(path.join(report.outputFolder,"ERRORS","JPEG_FILES")),[]);
        assert.deepEqual(await fs.promises.readdir(path.join(report.outputFolder,"ERRORS","HTML_FILES")),["item-001.html"]);
    });
});

test("v2.0.3: automatically halts a full batch after five consecutive JPEG failures",async()=>{
    await withWorkbook(async({excel})=>{
        const events=[];let attempts=0;
        const service=new StandaloneBatch({excelFactory:()=>fixture(20),fetcher,singlePreparer,
            rendererFactory:()=>({capture:async()=>{attempts++;throw new Error("Image download timed out");},close:async()=>{}})});
        const report=await service.generate(excel,{progress:p=>events.push(p)});
        assert.equal(report.autoStopped,true);assert.equal(report.cancelled,false);
        assert.match(report.stoppedReason,/5 consecutive JPEG failures/);
        assert.ok(report.skipped>0,"products beyond the failure threshold must be skipped");
        assert.ok(attempts>=5&&attempts<=8,`in-flight count should remain bounded, got ${attempts}`);
        assert.ok(events.some(e=>e.stage==="halted"));
        assert.equal(report.rows.length,20);
        assert.equal(report.failed+report.skipped,20);
        const persisted=JSON.parse(await fs.promises.readFile(path.join(report.outputFolder,"BATCH_REPORT.json")));
        assert.equal(persisted.jpegRenderer,"DIRECT_SHARP_TWO_COLUMN");
        assert.equal(persisted.autoStopped,true);
    });
});

test("v2.0.3: a successful JPEG resets the consecutive failure counter",async()=>{
    await withWorkbook(async({excel})=>{
        const service=new StandaloneBatch({excelFactory:()=>fixture(5),fetcher,singlePreparer,
            rendererFactory:()=>({capture:async(_html,dest)=>{
                if(/item-003combine\.jpg$/.test(dest))await fs.promises.writeFile(dest,"JPEG");
                else throw new Error("broken JPEG");
            },close:async()=>{}})});
        const report=await service.generate(excel,{maxConsecutiveJpegFailures:5});
        assert.equal(report.autoStopped,false);assert.equal(report.processed,5);
        assert.equal(report.jpegReady,1);assert.equal(report.failed,4);
    });
});
