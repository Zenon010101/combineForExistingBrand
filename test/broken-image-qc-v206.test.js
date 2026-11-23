"use strict";
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('fs'),os=require('os'),path=require('path');
const sharp=require('sharp');
const {StandaloneBatch}=require('../src/core/batch');
const {DirectJpegRenderer,isNearlyBlankSingle}=require('../src/core/directJpegRenderer');

// Self-contained mock for input/output workbook navigation. Production uses
// the real ExcelJS dependency to write genuine XLSX with clickable hyperlinks.
class Cell{constructor(){this.value=null;this.font={};this.alignment={};this.fill={};}}
class Row{constructor(){this.cells=new Map();this.height=0;}getCell(i){if(!this.cells.has(i))this.cells.set(i,new Cell());return this.cells.get(i);}get cellCount(){return Math.max(0,...this.cells.keys());}}
class Sheet{
    constructor(name,data=[]){this.name=name;this.rows=new Map();this.columns=new Map();this.views=[];
        data.forEach((cells,i)=>cells.forEach((v,j)=>{if(v!==undefined)this.getRow(i+1).getCell(j+1).value=v;}));}
    getRow(i){if(!this.rows.has(i))this.rows.set(i,new Row());return this.rows.get(i);}
    get rowCount(){return Math.max(0,...this.rows.keys());}
    get columnCount(){return Math.max(0,...[...this.rows.values()].map(r=>r.cellCount));}
    getColumn(i){if(!this.columns.has(i))this.columns.set(i,{width:10});return this.columns.get(i);}
    eachRow(fn){for(let i=1;i<=this.rowCount;i++)fn(this.getRow(i),i);}
    spliceColumns(start,remove,...insert){
        for(const row of this.rows.values()){
            const old=[...row.cells];row.cells.clear();
            for(const [col,cell] of old){if(col<start)row.cells.set(col,cell);else if(col>=start+remove)row.cells.set(col+insert.length-remove,cell);}
        }
    }
}
class Book{
    constructor(sheets=[]){this.worksheets=sheets;this.xlsx={readFile:async()=>{},writeFile:async file=>{
        const obj={};for(const sh of this.worksheets){
            obj[sh.name]=[...sh.rows].map(([index,row])=>[index,...[...row.cells].map(([c,cell])=>[c,cell.value])]);
        }
        await fs.promises.writeFile(file,JSON.stringify(obj,null,2));
    }};}
}
const iframe=id=>`<iframe src="https://www.rakuten.ne.jp/gold/glv/six/test/${id}.html"></iframe>`;
const single=id=>`https://item-shopping.c.yimg.jp/i/n/glv_${id.toLowerCase()}`;
const detail=(id,i)=>`https://image.rakuten.co.jp/glv/cabinet/test/${id.toLowerCase()}_${i}.jpg`;
const brokenDetail=(id,i)=>`https://image.rakuten.co.jp/glv/cabinet/test/${id.toLowerCase()}_bad${i}.jpg`;
const imgTag=url=>`<img src="${url}">`;
const black=(async()=>sharp({create:{width:600,height:600,channels:3,background:'#485aa2'}}).png().toBuffer())();
const white=(async()=>sharp({create:{width:600,height:600,channels:3,background:'#ffffff'}}).png().toBuffer())();
const tall=(async()=>sharp({create:{width:293,height:800,channels:3,background:'#556699'}}).png().toBuffer())();

async function withInput(fn){
    const temp=await fs.promises.mkdtemp(path.join(os.tmpdir(),'rakuten-qc-v206-'));
    const input=path.join(temp,'products.xlsx');await fs.promises.writeFile(input,'input is never modified');
    try{await fn({temp,input});}finally{await fs.promises.rm(temp,{recursive:true,force:true});}
}

test('v2.0.6: white Single is a review signal, not a discarded image',async()=>{
    assert.equal(await isNearlyBlankSingle(await white),true);
    assert.equal(await isNearlyBlankSingle(await black),false);
});

test('v2.0.6: real JPEGs and HTML go into PASSED or ERRORS; errors Excel preserves original links',async()=>{
    await withInput(async({temp,input})=>{
        const ids=['A-1','B-1','C-1','D-1','E-1','F-1','G-1'];
        const book=new Book([new Sheet('rak1-normal-item',[
            ['Product ID','SKU','IFRAME','OUTPUT','SINGLE'],
            ...ids.map(id=>[id,id,iframe(id),'',single(id)])
        ])]);
        let fetched=0;
        const imageFetcher=async url=>{
            fetched++;
            if(/glv_b-1|glv_f-1|c-1_bad|f-1_bad/.test(url))throw new Error('HTTP 404 from image host');
            if(/glv_g-1/.test(url))return await white;
            if(/d-1_/.test(url))return await tall;
            return await black;
        };
        const fetcher=async url=>{
            const id=path.posix.basename(new URL(url).pathname,'.html').toLowerCase();
            if(id==='e-1')throw new Error('HTTP 404 from iframe');
            let src=[];
            if(id==='d-1')src=Array.from({length:12},(_,i)=>detail(id,i+1));
            else if(id==='c-1')src=[detail(id,1),brokenDetail(id,2),detail(id,3)];
            else if(id==='f-1')src=[brokenDetail(id,1),brokenDetail(id,2)];
            else src=[detail(id,1),detail(id,2)];
            return {contentType:'text/html',buffer:Buffer.from(`<html>${src.map(imgTag).join('')}</html>`)};
        };
        const service=new StandaloneBatch({excelFactory:()=>book,fetcher,
            singlePreparer:async url=>({dataUri:url,htmlUrl:url}),
            rendererFactory:()=>new DirectJpegRenderer({imageFetcher})});
        const report=await service.generate(input);
        assert.equal(report.version,'2.0.12');
        assert.equal(report.ready,1);
        assert.equal(report.review,5);
        assert.equal(report.failed,1);
        assert.equal(report.jpegReady,6);
        assert.equal(report.errorsCount,6);
        assert.equal(report.processed,7);
        assert.equal(report.maxJpegHeight,3800);
        assert.equal(fetched,30,'validated images must be reused without downloading again during JPEG composition');
        const rows=Object.fromEntries(report.rows.map(r=>[r.productId,r]));
        assert.deepEqual(rows['a-1'].issueCodes,[]);
        assert.ok(rows['b-1'].issueCodes.includes('SINGLE_BROKEN'));
        assert.ok(rows['c-1'].issueCodes.includes('DETAIL_IMAGE_BROKEN'));
        assert.ok(rows['d-1'].issueCodes.includes('HEIGHT_OVER_3800'));
        assert.ok(rows['d-1'].jpegHeight>3800);
        assert.ok(rows['e-1'].issueCodes.includes('IFRAME_ERROR'));
        assert.equal(rows['e-1'].jpegStatus,'READY','A broken iframe with a valid Single produces an error-only Single preview');
        assert.ok(rows['e-1'].issueCodes.includes('NO_VALID_DETAILS'));
        assert.ok(rows['e-1'].jpegFile&&rows['e-1'].htmlFile);
        assert.equal(rows['e-1'].combineLayout,'SINGLE_ONLY_IFRAME_ERROR');
        assert.ok(rows['e-1'].issueCodes.includes('SINGLE_ONLY_IFRAME_ERROR'));
        assert.ok(rows['f-1'].issueCodes.includes('NO_USABLE_IMAGES'));
        assert.equal(rows['f-1'].jpegFile,null);
        assert.ok(rows['g-1'].issueCodes.includes('SINGLE_BLANK_REVIEW'));
        assert.deepEqual(await fs.promises.readdir(path.join(report.passedFolder,'JPEG_FILES')),['a-1combine.jpg']);
        assert.deepEqual(await fs.promises.readdir(path.join(report.passedFolder,'HTML_FILES')),['a-1.html']);
        assert.equal((await fs.promises.readdir(path.join(report.errorsFolder,'JPEG_FILES'))).length,5);
        assert.equal((await fs.promises.readdir(path.join(report.errorsFolder,'HTML_FILES'))).length,5);
        const html=await fs.promises.readFile(rows['c-1'].htmlFile,'utf8');
        assert.ok(html.includes(detail('C-1',1))&&html.includes(detail('C-1',3)));
        assert.doesNotMatch(html,/c-1_bad2/);
        assert.equal(rows['e-1'].singleStatus,'INCLUDED HTML+JPEG');
        const jpegMeta=await sharp(rows['d-1'].jpegFile).metadata();
        assert.equal(jpegMeta.width,600);
        assert.equal(jpegMeta.height,rows['d-1'].jpegHeight);
        assert.ok(jpegMeta.height>3800);
        const errorXlsx=JSON.parse(await fs.promises.readFile(report.errorsExcel,'utf8'));
        assert.ok(errorXlsx.ALL_ISSUES);
        assert.equal(errorXlsx.ALL_ISSUES.length,7,'header + 6 errors');
        assert.equal(errorXlsx.SINGLE_ERRORS.length,4,'header + 3 broken/blank Singles');
        assert.ok(errorXlsx.HEIGHT_REVIEW.length>=2);
        const rendered=JSON.stringify(errorXlsx);
        assert.match(rendered,/https:\/\/www\.rakuten\.ne\.jp\/gold/);
        assert.match(rendered,/https:\/\/item-shopping\.c\.yimg\.jp\/i\/n\/glv_b-1/);
        assert.match(rendered,/c-1_bad2\.jpg/);
        assert.match(rendered,/file:\/\//);
        assert.equal(await fs.promises.readFile(input,'utf8'),'input is never modified');
        const ws=book.worksheets[0];
        assert.equal(ws.getRow(3).getCell(3).value,iframe('B-1'));
        assert.equal(ws.getRow(3).getCell(5).value,single('B-1'));
        const json=JSON.parse(await fs.promises.readFile(path.join(report.outputFolder,'BATCH_REPORT.json')));
        assert.equal(json.errorsCount,6);
    });
});

test('v2.0.6: entirely broken Rakuten iframe formula column remains reportable',async()=>{
    await withInput(async({input})=>{
        const book=new Book([new Sheet('rak1-normal-item',[
            ['ID','SKU',null,'OUTPUT',null],
            ['A-1','A-1',{error:'#VALUE!'},'',single('A-1')],
            ['B-1','B-1',{error:'#REF!'},'',single('B-1')]
        ])]);
        const service=new StandaloneBatch({excelFactory:()=>book,
            singlePreparer:async url=>({dataUri:url,htmlUrl:url}),
            rendererFactory:()=>new DirectJpegRenderer({imageFetcher:async()=>await black})});
        const result=await service.generate(input);
        assert.equal(result.total,2);
        assert.equal(result.invalidIframeCount,2);
        assert.equal(result.review,2,'Valid Singles are kept as error-only previews');
        assert.equal(result.failed,0);
        assert.equal(result.jpegReady,2);
        assert.ok(result.rows.every(x=>x.issueCodes.includes('IFRAME_ERROR')&&x.issueCodes.includes('NO_VALID_DETAILS')));
        assert.ok(result.rows.every(x=>x.jpegFile&&x.htmlFile&&x.issueCodes.includes('SINGLE_ONLY_IFRAME_ERROR')));
    });
});

test('v2.0.6: headerless Rak1 column E with an unsupported Single host is reported BROKEN',async()=>{
    await withInput(async({input})=>{
        const source='https://unknown.example.com/not-a-single.jpg';
        const book=new Book([new Sheet('rak1-normal-item',[
            ['ID','SKU',null,'OUTPUT',null],
            ['A-1','A-1',iframe('A-1'),'',source]
        ])]);
        const service=new StandaloneBatch({excelFactory:()=>book,
            fetcher:async()=>({contentType:'text/html',buffer:Buffer.from(imgTag(detail('A-1',1)))}),
            rendererFactory:()=>new DirectJpegRenderer({imageFetcher:async()=>await black})});
        const result=await service.generate(input);
        assert.equal(result.review,1);
        assert.equal(result.rows[0].singleUrl,source);
        assert.ok(result.rows[0].issueCodes.includes('SINGLE_BROKEN'));
        assert.equal(result.rows[0].jpegStatus,'READY');
    });
});

test('v2.0.6: height exactly equal to threshold is allowed',async()=>{
    await withInput(async({input})=>{
        const book=new Book([new Sheet('Products',[['IFRAME'],[iframe('A-1')]])]);
        const mockRenderer={capture:async(_html,jpeg)=>{
            await fs.promises.writeFile(jpeg,'fake jpeg');return {width:600,height:3800};
        },close:async()=>{}};
        const service=new StandaloneBatch({excelFactory:()=>book,
            fetcher:async()=>({contentType:'text/html',buffer:Buffer.from(imgTag(detail('A-1',1)))}),
            rendererFactory:()=>mockRenderer});
        const report=await service.generate(input);
        assert.equal(report.ready,1);
        assert.equal(report.errorsCount,0);
        assert.equal(report.rows[0].jpegHeight,3800);
    });
});
