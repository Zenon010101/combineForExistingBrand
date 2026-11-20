"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const fs=require("fs"),path=require("path"),os=require("os");
const {productIdFromSources,outputFileNames,safeProductId}=require("../src/core/outputNaming");
const {existingBrandSnippet,existingBrandJpegHtml}=require("../src/core/existingBrand");
const {standaloneHtml}=require("../src/core/iframeHtml");
const {validateSingleFlushGeometry,validateTwoColumnGeometry}=require("../src/core/iframeJpegRenderer");
const {StandaloneBatch}=require("../src/core/batch");
const single="https://item-shopping.c.yimg.jp/i/n/glv_abu-90";
const iframe="https://www.rakuten.ne.jp/gold/glv/six/test/ABU-90.html";
const img=i=>`https://image.rakuten.co.jp/glv/cabinet/sku/abu-90_${i}.jpg`;

test("v2.0.2: filename ID is extracted from the Yahoo Single URL, not iframe, row, or shop prefix",()=>{
    assert.equal(productIdFromSources(single,iframe),"abu-90");
    assert.equal(productIdFromSources("https://item-shopping.c.yimg.jp/i/n/lucida-gulliver_ali-20",iframe),"ali-20");
    assert.equal(productIdFromSources("https://item-shopping.c.yimg.jp/i/n/glv_foo_2-14?foo=bar",iframe),"foo_2-14");
    assert.deepEqual(outputFileNames("abu-90"),{html:"abu-90.html",jpeg:"abu-90combine.jpg"});
    assert.equal(productIdFromSources("",iframe),"ABU-90");
    assert.equal(productIdFromSources("C:/product/single.jpg",iframe),"ABU-90");
    for(const unsafe of ["..","../evil","x?xx","x:evil", "-bad", "x."])
        assert.throws(()=>safeProductId(unsafe),/product ID/);
});

test("v2.0.2: output is full-bleed Single then exactly two columns, without DETAILS anywhere",()=>{
    const urls=[img(1),img(2),img(3),img(4),img(5)];
    const html=standaloneHtml(existingBrandSnippet(urls,{singleUrl:single}));
    const jpeg=existingBrandJpegHtml({images:urls,single});
    assert.doesNotMatch(html,/DETAILS/i);
    assert.doesNotMatch(jpeg,/DETAILS/i);
    assert.match(html,/class="eb-single-row"/);
    assert.match(html,/<img src="https:\/\/item-shopping\.c\.yimg\.jp\/i\/n\/glv_abu-90" alt="Single" width="780" style="display:block;width:780px;max-width:100%;height:auto;/);
    assert.doesNotMatch(html,/alt="Single"[^>]*max-height/);
    assert.match(jpeg,/\.bf-page\{[^}]*padding:0;margin:0/);
    assert.match(jpeg,/\.bf-single\{width:600px;margin:0 0 15px 0;padding:0/);
    assert.match(jpeg,/\.bf-single img\{display:block;width:600px;height:auto;/);
    assert.match(jpeg,/\.eb-gallery\{[^}]*grid-template-columns:293px 293px/);
    assert.equal((html.match(/class="eb-gallery-row"/g)||[]).length,3);
    assert.equal((jpeg.match(/class="eb-image"/g)||[]).length,5);
    assert.ok(jpeg.indexOf('alt="Single"')<jpeg.indexOf(img(1)));
    urls.forEach((u,i)=>assert.ok(jpeg.indexOf(u)< (i<urls.length-1?jpeg.indexOf(urls[i+1]):Infinity)));
});

test("v2.0.2: JPEG flush-Single geometry rejects margin on top/sides, but accepts non-square Single",()=>{
    const good={galleryX:3,galleryY:315,galleryWidth:594,columns:2,tiles:[
        {x:3,y:315,w:293,h:270},{x:304,y:315,w:293,h:270}
    ],single:{container:{x:0,y:0,w:600,h:300},image:{x:0,y:0,w:600,h:300}}};
    assert.equal(validateSingleFlushGeometry(good),true);
    assert.equal(validateTwoColumnGeometry(good,2),true);
    assert.throws(()=>validateSingleFlushGeometry({...good,single:{...good.single,image:{...good.single.image,x:3,w:594}}}),/flush/);
    assert.throws(()=>validateSingleFlushGeometry({...good,galleryY:305}),/15px/);
});

// Minimal workbook sufficient for the unchanged Excel scanning, C/D/E output,
// and exact filename wiring. The production app uses ExcelJS.
class Cell {constructor(){this.value=null;this.text="";this.font={};this.alignment={};this.fill={};}}
class Row {constructor(){this.cells=new Map();this.height=0;}getCell(n){if(!this.cells.has(n))this.cells.set(n,new Cell());return this.cells.get(n);}get cellCount(){return this.cells.size?Math.max(...this.cells.keys()):0;}}
class Sheet {
    constructor(name,rows){this.name=name;this.rows=new Map();this.columns=new Map();this.views=[];
        rows.forEach((cells,i)=>cells.forEach((val,j)=>{this.getRow(i+1).getCell(j+1).value=val;}));}
    getRow(n){if(!this.rows.has(n))this.rows.set(n,new Row());return this.rows.get(n);}
    get rowCount(){return this.rows.size?Math.max(...this.rows.keys()):0;}
    get columnCount(){return this.rowCount?Math.max(0,...[...this.rows.values()].map(r=>r.cellCount)):0;}
    getColumn(n){if(!this.columns.has(n))this.columns.set(n,{width:10});return this.columns.get(n);}
    eachRow(callback){for(let r=1;r<=this.rowCount;r++)if(this.rows.has(r))callback(this.getRow(r),r);}
    spliceColumns(col,remove,...insert){const delta=insert.length-remove;
        for(const row of this.rows.values()){
            const old=[...row.cells.entries()];row.cells.clear();
            for(const [key,cell] of old){if(key<col)row.cells.set(key,cell);else if(key>=col+remove)row.cells.set(key+delta,cell);}
            for(let i=0;i<insert.length;i++)if(insert[i]!==undefined)row.getCell(col+i).value=insert[i];
        }
    }
}
class Book {constructor(sheets){this.worksheets=sheets;this.xlsx={readFile:async()=>{},writeFile:async file=>fs.promises.writeFile(file,"mock result workbook")};}}
const iFrameFor=code=>`<iframe src="https://www.rakuten.ne.jp/gold/glv/six/test/${code}.html"></iframe>`;
const fetcher=async()=>({contentType:"text/html",buffer:Buffer.from(`<html><h2>DETAILS</h2><img src="${img(1)}"><img src="${img(2)}"><img src="${img(3)}"></html>`)});
const singlePreparer=async url=>({kind:"remote",dataUri:url,htmlUrl:url});
const rendererFactory=()=>({capture:async(_f,file,{renderHtml,expectedImages})=>{
    assert.equal(expectedImages,4);
    assert.doesNotMatch(renderHtml,/DETAILS/);
    await fs.promises.writeFile(file,"fake-jpeg");
},close:async()=>{}});

test("v2.0.2: existing Excel C iframe / D output / E Single yields ID-named HTML and JPEG",async()=>{
    const dir=await fs.promises.mkdtemp(path.join(os.tmpdir(),"rakuten-v202-"));
    try{
        const excel=path.join(dir,"rak1-normal-item.xlsx");await fs.promises.writeFile(excel,"test");
        const ws=new Sheet("rak1-normal-item",[["商品管理番号（商品URL）","商品番号",null,"OUTPUT",null],
            ["abu-90","ABU-90",iFrameFor("ABU-90"),"",single]]);
        const book=new Book([ws]);
        const batch=new StandaloneBatch({excelFactory:()=>book,rendererFactory,singlePreparer,fetcher});
        const report=await batch.generate(excel);
        assert.equal(report.ready,1);
        assert.equal(report.rows[0].productId,"abu-90");
        const htmlName="abu-90.html",jpegName="abu-90combine.jpg";
        assert.deepEqual(await fs.promises.readdir(path.join(report.outputFolder,"PASSED","HTML_FILES")),[htmlName]);
        assert.deepEqual(await fs.promises.readdir(path.join(report.outputFolder,"PASSED","JPEG_FILES")),[jpegName]);
        const html=await fs.promises.readFile(path.join(report.outputFolder,"PASSED","HTML_FILES",htmlName),"utf8");
        assert.doesNotMatch(html,/DETAILS/);
        assert.ok(html.indexOf(single)<html.indexOf(img(1)));
        assert.equal(ws.getRow(2).getCell(3).value,iFrameFor("ABU-90"));
        assert.equal(ws.getRow(2).getCell(5).value,single);
        assert.match(ws.getRow(2).getCell(6).value.hyperlink,/abu-90\.html$/);
        assert.match(ws.getRow(2).getCell(7).value.hyperlink,/abu-90combine\.jpg$/);
    }finally{await fs.promises.rm(dir,{recursive:true,force:true});}
});

test("v2.0.2: duplicate source IDs are reported, never overwritten in a bulk batch",async()=>{
    const dir=await fs.promises.mkdtemp(path.join(os.tmpdir(),"rakuten-v202-dup-"));
    try{
        const excel=path.join(dir,"input.xlsx");await fs.promises.writeFile(excel,"test");
        const book=new Book([new Sheet("rak1-normal-item",[["ID","PRODUCT",null,"OUTPUT",null],
            ["abu-90","ABU-90",iFrameFor("ABU-90"),"",single],
            ["abu-90","ABU-90",iFrameFor("ABU-91"),"","https://item-shopping.c.yimg.jp/i/n/lucida_abu-90"]])]);
        const batch=new StandaloneBatch({excelFactory:()=>book,rendererFactory,singlePreparer,fetcher});
        const report=await batch.generate(excel);
        assert.equal(report.total,2);assert.equal(report.ready,1);assert.equal(report.failed,1);
        assert.match(report.rows[1].warning,/Duplicate output ID/);
        assert.deepEqual(await fs.promises.readdir(path.join(report.outputFolder,"PASSED","HTML_FILES")),["abu-90.html"]);
    }finally{await fs.promises.rm(dir,{recursive:true,force:true});}
});
