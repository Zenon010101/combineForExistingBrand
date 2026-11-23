"use strict";
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('fs'),os=require('os'),path=require('path');
const sharp=require('sharp');
const {StandaloneBatch}=require('../src/core/batch');
const {DirectJpegRenderer}=require('../src/core/directJpegRenderer');
const {readJobs}=require('../src/core/excel');
class Cell {constructor(){this.value=null;this.font={};this.fill={};this.alignment={};}}
class Row {constructor(){this.cells=new Map();this.height=0;}getCell(n){if(!this.cells.has(n))this.cells.set(n,new Cell());return this.cells.get(n);}get cellCount(){return Math.max(0,...this.cells.keys());}}
class Sheet {constructor(name,values){this.name=name;this.rows=new Map();this.columns=new Map();this.views=[];values.forEach((line,r)=>line.forEach((v,c)=>{if(v!==undefined)this.getRow(r+1).getCell(c+1).value=v;}));}
 getRow(n){if(!this.rows.has(n))this.rows.set(n,new Row());return this.rows.get(n);}get rowCount(){return Math.max(0,...this.rows.keys());}get columnCount(){return Math.max(0,...[...this.rows.values()].map(r=>r.cellCount));}
 getColumn(n){if(!this.columns.has(n))this.columns.set(n,{width:10});return this.columns.get(n);}eachRow(callback){for(let r=1;r<=this.rowCount;r++)callback(this.getRow(r),r);}spliceColumns(start,count,...ins){for(const row of this.rows.values()){const old=[...row.cells];row.cells.clear();for(const [n,cell] of old)row.cells.set(n<start?n:n+ins.length-count,cell);}}}
class Book {constructor(sheets=[]){this.worksheets=sheets;this.xlsx={readFile:async()=>{},writeFile:async filename=>{const values=this.worksheets.map(sh=>({sheet:sh.name,rows:[...sh.rows].map(([n,row])=>({n,fields:[...row.cells].map(([c,cell])=>[c,cell.value])}))}));await fs.promises.writeFile(filename,JSON.stringify(values));}};}}
const iframe=id=>`<iframe src="https://www.rakuten.ne.jp/gold/glv/six/demo/${id}.html"></iframe>`;
const single=id=>`https://item-shopping.c.yimg.jp/i/n/glv_${id.toLowerCase()}`;
const detail=(id,i)=>`https://image.rakuten.co.jp/glv/cabinet/demo/${id.toLowerCase()}_${i}.jpg`;
const image=sharp({create:{width:600,height:600,channels:3,background:'#4466aa'}}).png().toBuffer();
async function run(data,{fetcher,download}={}){
 const tmp=await fs.promises.mkdtemp(path.join(os.tmpdir(),'rc-v208-'));
 try{
  const input=path.join(tmp,'products.xlsx');await fs.promises.writeFile(input,'original');
  const book=new Book([new Sheet('rak1-normal-item',data)]);
  const service=new StandaloneBatch({excelFactory:()=>book,
   fetcher:fetcher||(async()=>({contentType:'text/html',buffer:Buffer.from('')})),
   singlePreparer:async url=>({dataUri:url,htmlUrl:url}),
   rendererFactory:()=>new DirectJpegRenderer({imageFetcher:download||(async()=>await image)})});
  const result=await service.generate(input);
  return await (async()=>{ // Read and assert files while temp folder exists.
   const output=result;
   return {output,book,read:async file=>JSON.parse(await fs.promises.readFile(file,'utf8')),
    passedJpegs:await fs.promises.readdir(path.join(output.passedFolder,'JPEG_FILES')),
    errorJpegs:await fs.promises.readdir(path.join(output.errorsFolder,'JPEG_FILES')),
    errorHtml:await fs.promises.readdir(path.join(output.errorsFolder,'HTML_FILES'))};
  })();
 }finally{await fs.promises.rm(tmp,{force:true,recursive:true});}
}
test('v2.0.9: #VALUE! iframe and blank iframe keep valid Single-only files in ERRORS',async()=>{
 const result=await run([
  ['ID','SKU','IFRAME','OUTPUT','SINGLE'],
  ['A-1','A-1',{error:'#VALUE!'},'',single('A-1')],
  ['B-1','B-1','', '', single('B-1')],
  ['C-1','C-1',iframe('C-1'),'',single('C-1')]
 ],{fetcher:async()=>({contentType:'text/html',buffer:Buffer.from(`<img src="${detail('C-1',1)}">`)})});
 assert.equal(result.output.total,3);
 assert.equal(result.output.invalidIframeCount,2);
 assert.equal(result.output.ready,1);
 assert.equal(result.output.failed,0);
 assert.equal(result.output.review,2);
 assert.equal(result.output.jpegReady,3);
 assert.deepEqual(result.passedJpegs,['c-1combine.jpg']);
 assert.deepEqual(result.errorJpegs,['a-1combine.jpg','b-1combine.jpg']);
 assert.deepEqual(result.errorHtml,['a-1.html','b-1.html']);
 for(const row of result.output.rows.slice(0,2)){
  assert.ok(row.jpegFile&&row.htmlFile);
  assert.ok(row.issueCodes.includes('IFRAME_ERROR'));
  assert.ok(row.issueCodes.includes('NO_VALID_DETAILS'));
  assert.equal(row.singleStatus,'INCLUDED HTML+JPEG');
  assert.ok(row.issueCodes.includes('SINGLE_ONLY_IFRAME_ERROR'));
 }
 assert.ok(result.output.errorsByType.IFRAME_ERRORS>=2);
});
test('v2.0.9: valid Single plus all broken detail URLs generates error-only Single preview',async()=>{
 const result=await run([
  ['ID','SKU','IFRAME','OUTPUT','SINGLE'],
  ['B-2','B-2',iframe('B-2'),'',single('B-2')]
 ],{fetcher:async()=>({contentType:'text/html',buffer:Buffer.from(`<img src="${detail('B-2',1)}"><img src="${detail('B-2',2)}">`)}),
   download:async url=>{if(url.includes('cabinet/demo/'))throw new Error('HTTP 404 detail');return await image;}});
 assert.equal(result.output.total,1);
 assert.equal(result.output.failed,0);
 assert.equal(result.output.review,1);
 assert.equal(result.output.jpegReady,1);
 assert.deepEqual(result.errorJpegs,['b-2combine.jpg']);
 assert.deepEqual(result.errorHtml,['b-2.html']);
 assert.ok(result.output.rows[0].issueCodes.includes('NO_VALID_DETAILS'));
 assert.ok(result.output.rows[0].issueCodes.includes('DETAIL_IMAGE_BROKEN'));
 assert.equal(result.output.rows[0].singleStatus,'INCLUDED HTML+JPEG');
 assert.ok(result.output.rows[0].issueCodes.includes('SINGLE_ONLY_IFRAME_ERROR'));
});
test('v2.0.8: an error-only workbook with blank iframe column and Single URLs remains reportable',()=>{
 const sheet=new Sheet('rak1-normal-item',[
  ['ID','SKU',null,'OUTPUT','SINGLE'],
  ['A-1','A-1','', '', single('A-1')]
 ]);
 const result=readJobs(new Book([sheet]));
 assert.equal(result.jobs.length,1);
 assert.match(result.jobs[0].inputError,/Iframe source missing/);
});
