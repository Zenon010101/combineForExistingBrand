'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('fs'),os=require('os'),path=require('path');
const sharp=require('sharp');
const {StandaloneBatch}=require('../src/core/batch');
const {DirectJpegRenderer}=require('../src/core/directJpegRenderer');
const {readJobs}=require('../src/core/excel');
const {cellSkuInfo,excelSerial,resolveSkuIdentity}=require('../src/core/skuRecovery');

class Cell {constructor(){this.value=null;this.numFmt='General';this.font={};this.fill={};this.alignment={};}}
class Row {constructor(){this.cells=new Map();this.height=0;}getCell(i){if(!this.cells.has(i))this.cells.set(i,new Cell());return this.cells.get(i);}get cellCount(){return Math.max(0,...this.cells.keys());}}
class Sheet {constructor(name,data){this.name=name;this.rows=new Map();this.columns=new Map();this.views=[];
 data.forEach((values,i)=>values.forEach((v,j)=>{if(v!==undefined)this.getRow(i+1).getCell(j+1).value=v;}));}
 getRow(i){if(!this.rows.has(i))this.rows.set(i,new Row());return this.rows.get(i);}
 get rowCount(){return Math.max(0,...this.rows.keys());}get columnCount(){return Math.max(0,...[...this.rows.values()].map(r=>r.cellCount));}
 getColumn(i){if(!this.columns.has(i))this.columns.set(i,{width:10});return this.columns.get(i);}
 eachRow(fn){for(let i=1;i<=this.rowCount;i++)fn(this.getRow(i),i);}
 spliceColumns(col,remove,...insert){for(const row of this.rows.values()){const previous=[...row.cells];row.cells.clear();for(const [i,cell] of previous)row.cells.set(i<col?i:i+insert.length-remove,cell);}}
}
class Book {constructor(worksheets=[]){this.worksheets=worksheets;this.properties={date1904:false};this.xlsx={readFile:async()=>{},writeFile:async file=>{
 const json=this.worksheets.map(ws=>({name:ws.name,rows:[...ws.rows].map(([n,row])=>({n,values:[...row.cells].map(([c,v])=>({c,value:v.value}))}))}));
 await fs.promises.writeFile(file,JSON.stringify(json));
 }};}}
const iframe=id=>`<iframe src="https://www.rakuten.ne.jp/gold/glv/six/mar/${id}.html"></iframe>`;
const yahoo=id=>`https://item-shopping.c.yimg.jp/i/n/glv_${id}`;
const detail=id=>`https://image.rakuten.co.jp/glv/cabinet/mar/${id.toLowerCase()}_1.jpg`;
function dateRow(sheet,row,year){
 for(const col of [1,2]){const cell=sheet.getRow(row).getCell(col);cell.value=new Date(Date.UTC(year,2,1));cell.numFmt='mmm-yy';}
}
const png=sharp({create:{width:600,height:600,channels:3,background:'#334477'}}).png().toBuffer();
async function run(book,fetcher){
 const root=await fs.promises.mkdtemp(path.join(os.tmpdir(),'rakuten-v209-date-'));
 const input=path.join(root,'rak1-normal-item.xlsx');await fs.promises.writeFile(input,'ORIGINAL');
 const downloads=[];
 const service=new StandaloneBatch({excelFactory:()=>book,fetcher,
  singlePreparer:async url=>({dataUri:url,htmlUrl:url}),
  rendererFactory:()=>new DirectJpegRenderer({imageFetcher:async url=>{
      downloads.push(url);
      if(/glv_\d+$/.test(url))throw new Error('Original Excel serial-number URL is broken');
      return png;
  }})});
 try{
  const report=await service.generate(input);
  const originals=await fs.promises.readFile(input,'utf8');
  const outputs=[];for(const row of report.rows){
   outputs.push({name:row.productId,html:row.htmlFile?await fs.promises.readFile(row.htmlFile,'utf8'):null,
    jpeg:row.jpegFile?await sharp(row.jpegFile).metadata():null});
  }
  const errors=JSON.parse(await fs.promises.readFile(report.errorsExcel,'utf8'));
  return {report,outputs,downloads,originals,errors,book};
 }finally{await fs.promises.rm(root,{recursive:true,force:true});}
}

test('v2.0.9: all six MAR SKU examples match Excel date serials exactly',()=>{
 const dates=[[1990,32933],[1993,34029],[1994,34394],[1996,35125],[1997,35490],[1999,36220]];
 for(const [year,serial] of dates){
  const info=cellSkuInfo({value:new Date(Date.UTC(year,2,1)),numFmt:'mmm-yy'});
  assert.equal(excelSerial(new Date(Date.UTC(year,2,1))),serial);
  assert.equal(info.serial,serial);
  assert.equal(info.display,`MAR-${String(year).slice(2)}`);
  const result=resolveSkuIdentity({singlePath:yahoo(serial),url:`https://www.rakuten.ne.jp/gold/glv/six/mar/MAR-${String(year).slice(2)}.html`,skuCells:[info,info]});
  assert.equal(result.outputId,`MAR-${String(year).slice(2)}`);
  assert.equal(result.effectiveSinglePath,yahoo(`mar-${String(year).slice(2)}`));
  assert.ok(result.skuIssues.some(x=>x.code==='SINGLE_DATE_SERIAL_REPAIRED'));
 }
});

test('v2.0.9: a corrupt Yahoo date serial cannot silently rename an unrelated product',()=>{
 const info=cellSkuInfo({value:new Date(Date.UTC(1990,2,1)),numFmt:'mmm-yy'});
 const result=resolveSkuIdentity({singlePath:yahoo('32933'),url:'https://www.rakuten.ne.jp/gold/glv/six/mar/UNRELATED-9.html',skuCells:[info]});
 assert.equal(result.effectiveSinglePath,'');
 assert.ok(result.skuIssues.some(x=>x.code==='SKU_DATE_UNRESOLVED'));
 assert.ok(result.skuIssues.some(x=>x.code==='SINGLE_DATE_SERIAL_SUSPECT'));
 assert.ok(!result.skuIssues.some(x=>x.code==='SINGLE_DATE_SERIAL_REPAIRED'));
 const ordinary=resolveSkuIdentity({singlePath:yahoo('32933'),url:'https://www.rakuten.ne.jp/gold/glv/six/mar/OTHER-2.html',skuCells:[{date:false,sku:'OTHER-2',label:'OTHER-2'}]});
 assert.equal(ordinary.effectiveSinglePath,yahoo('32933'),'Legitimate numeric Yahoo aliases must not be rewritten without date evidence');
});

test('v2.0.9: explicitly typed MAR-90 text plus a matching Excel serial can recover a Single even with #VALUE! iframe',()=>{
 const result=resolveSkuIdentity({singlePath:yahoo('32933'),skuCells:[{date:false,sku:'Mar-90',label:'Mar-90'}]});
 assert.equal(result.outputId,'mar-90');
 assert.equal(result.effectiveSinglePath,yahoo('mar-90'));
});

test('v2.0.9: real JPEGs use recovered MAR-90 iframe SKU, and Mar-93 #VALUE! retains Single-only ERRORS output',async()=>{
 const book=new Book([new Sheet('rak1-normal-item',[
  ['PRODUCT ID','SKU','IFRAME','OUTPUT','SINGLE'],
  [new Date(Date.UTC(1990,2,1)),new Date(Date.UTC(1990,2,1)),iframe('MAR-90'),'',yahoo('32933')],
  [new Date(Date.UTC(1993,2,1)),new Date(Date.UTC(1993,2,1)),{error:'#VALUE!'},'',yahoo('34029')],
 ])]);
 dateRow(book.worksheets[0],2,1990);dateRow(book.worksheets[0],3,1993);
 const result=await run(book,async url=>({contentType:'text/html',buffer:Buffer.from(`<html><img src="${detail('MAR-90')}"></html>`)}));
 assert.equal(result.report.version,'2.0.12');
 assert.equal(result.report.ready,0);
 assert.equal(result.report.review,2);
 assert.equal(result.report.failed,0);
 assert.equal(result.report.jpegReady,2);
 const first=result.report.rows[0],second=result.report.rows[1];
 assert.equal(first.productId,'MAR-90');
 assert.equal(second.productId,'mar-93');
 assert.ok(first.jpegFile.includes('/ERRORS/')&&second.jpegFile.includes('/ERRORS/'));
 assert.equal(first.combineLayout,'SINGLE_TOP_THEN_TWO_COLUMNS');
 assert.equal(second.combineLayout,'SINGLE_ONLY_IFRAME_ERROR');
 assert.equal(second.combineGalleryRows,0);
 assert.ok(first.issueCodes.includes('SINGLE_DATE_SERIAL_REPAIRED'));
 assert.ok(second.issueCodes.includes('IFRAME_ERROR'));
 assert.ok(second.issueCodes.includes('SINGLE_ONLY_IFRAME_ERROR'));
 assert.ok(result.downloads.includes(yahoo('mar-90'))&&result.downloads.includes(yahoo('mar-93')));
 assert.ok(!result.downloads.includes(yahoo('32933'))&&!result.downloads.includes(yahoo('34029')));
 assert.ok(result.outputs[0].html.includes(yahoo('mar-90')));
 assert.ok(result.outputs[1].html.includes(yahoo('mar-93')));
 assert.equal(result.outputs[0].jpeg.width,600);
 assert.equal(result.outputs[1].jpeg.height,600);
 assert.equal(first.singleUrl,yahoo('32933'));
 assert.equal(first.effectiveSingleUrl,yahoo('mar-90'));
 assert.equal(second.singleUrl,yahoo('34029'));
 assert.equal(second.effectiveSingleUrl,yahoo('mar-93'));
 assert.equal(result.book.worksheets[0].getRow(2).getCell(5).value,yahoo('32933'));
 assert.equal(result.book.worksheets[0].getRow(3).getCell(5).value,yahoo('34029'));
 assert.deepEqual(result.book.worksheets[0].getRow(2).getCell(1).value,new Date(Date.UTC(1990,2,1)));
 assert.equal(result.originals,'ORIGINAL');
 const report=JSON.stringify(result.errors);
 assert.match(report,/glv_32933/);
 assert.match(report,/glv_mar-90/);
 assert.match(report,/glv_34029/);
 assert.match(report,/glv_mar-93/);
 assert.ok(result.errors.find(x=>x.name==='IFRAME_ERRORS')?.rows?.length>=2);
 assert.equal(result.book.worksheets[0].getRow(3).getCell(4).value,'','Single-only HTML is review-only, not written to Rakuten OUTPUT');
});

test('v2.0.9: excel date in SKU columns with unconfirmed iframe is flagged for review; usable Details still export',async()=>{
 const book=new Book([new Sheet('rak1-normal-item',[
  ['PRODUCT ID','SKU','IFRAME','OUTPUT','SINGLE'],
  [new Date(Date.UTC(1990,2,1)),new Date(Date.UTC(1990,2,1)),iframe('OTHER-9'),'',yahoo('32933')]
 ])]);dateRow(book.worksheets[0],2,1990);
 const result=await run(book,async()=>({contentType:'text/html',buffer:Buffer.from(`<img src="${detail('OTHER-9')}">`)}));
 const row=result.report.rows[0];
 assert.equal(row.status,'REVIEW');
 assert.ok(row.issueCodes.includes('SKU_DATE_UNRESOLVED'));
 assert.ok(row.issueCodes.includes('SINGLE_DATE_SERIAL_SUSPECT'));
 assert.equal(row.singleStatus,'ERROR / SKU DATE SERIAL');
 assert.equal(row.galleryCount,1);
 assert.ok(row.jpegFile&&row.htmlFile);
 assert.ok(!result.downloads.some(x=>x.includes('glv_32933')));
 assert.equal(result.book.worksheets[0].getRow(2).getCell(5).value,yahoo('32933'));
});
