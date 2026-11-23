'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('fs'),os=require('os'),path=require('path');
const sharp=require('sharp');
const {StandaloneBatch}=require('../src/core/batch');
const {DirectJpegRenderer}=require('../src/core/directJpegRenderer');
const {SinglePlaceholderInspector,singleAppearance,knownYahooPlaceholderSimilarity}=require('../src/core/singlePlaceholder');

class Cell{constructor(){this.value=null;this.font={};this.fill={};this.alignment={};}}
class Row{constructor(){this.cells=new Map();this.height=0;}getCell(i){if(!this.cells.has(i))this.cells.set(i,new Cell());return this.cells.get(i);}get cellCount(){return Math.max(0,...this.cells.keys());}}
class Sheet{
 constructor(name,rows){this.name=name;this.rows=new Map();this.columns=new Map();this.views=[];
  rows.forEach((data,i)=>data.forEach((v,j)=>{if(v!==undefined)this.getRow(i+1).getCell(j+1).value=v;}));}
 getRow(i){if(!this.rows.has(i))this.rows.set(i,new Row());return this.rows.get(i);}
 get rowCount(){return Math.max(0,...this.rows.keys());}
 get columnCount(){return Math.max(0,...[...this.rows.values()].map(r=>r.cellCount));}
 getColumn(i){if(!this.columns.has(i))this.columns.set(i,{width:10});return this.columns.get(i);}
 eachRow(callback){for(let i=1;i<=this.rowCount;i++)callback(this.getRow(i),i);}
 spliceColumns(col,remove,...insert){for(const row of this.rows.values()){
  const entries=[...row.cells];row.cells.clear();
  for(const [i,cell] of entries)row.cells.set(i<col?i:i+insert.length-remove,cell);
 }}
}
class Book{
 constructor(worksheets=[]){this.worksheets=worksheets;this.xlsx={readFile:async()=>{},
  writeFile:async(file)=>fs.promises.writeFile(file,JSON.stringify(this.worksheets.map(x=>x.name)))};}
}
const screenshotSample=fs.readFileSync(path.join(__dirname,'fixtures','yahoo-no-image-actual-compressed.jpg'));
const iframe=id=>`<iframe src="https://www.rakuten.ne.jp/gold/glv/six/acl/${id}.html"></iframe>`;
const single=id=>`https://item-shopping.c.yimg.jp/i/n/glv_${id.toLowerCase()}`;
const detail=id=>`https://image.rakuten.co.jp/glv/cabinet/acl/${id.toLowerCase()}_1.jpg`;
const bluePromise=sharp({create:{width:600,height:600,channels:3,background:'#143fa4'}}).png().toBuffer();
const greenPromise=sharp({create:{width:700,height:700,channels:3,background:'#11b23a'}}).png().toBuffer();

// This is a *cropped image from the actual user-provided screenshot*, not the
// synthetic icon from v2.0.10. The source was scaled to 600px and recompressed
// to approximate a real remote Yahoo Single JPEG.
test('v2.0.11 regression: actual Yahoo NO IMAGE graphic matches without OCR',async()=>{
 const rawScreenshotCrop=fs.readFileSync(path.join(__dirname,'..','src','core','assets','yahoo-no-image-reference.png'));
 const originalAppearance=await singleAppearance(rawScreenshotCrop);
 assert.ok(originalAppearance.light<.77,'Original screenshot has fewer light pixels than the v2.0.10 threshold');
 const appearance=await singleAppearance(screenshotSample);
 assert.ok(appearance.ink>.21,'Reproduces v2.0.10 upper ink-threshold failure');
 assert.equal(appearance.candidate,true);
 const score=await knownYahooPlaceholderSimilarity(screenshotSample);
 assert.ok(score>=.84,`actual screenshot-derived placeholder must match reference: ${score}`);
 const inspector=new SinglePlaceholderInspector({recognizeText:async()=>{throw new Error('English OCR intentionally offline');}});
 const result=await inspector.inspect(screenshotSample);
 assert.equal(result.noImage,true);
 assert.equal(result.review,false);
 assert.match(result.reason,/Yahoo NO IMAGE/);
 assert.ok(result.appearance.yahooPlaceholderSimilarity>=.84);
 assert.equal((await inspector.inspect(await bluePromise)).noImage,false);
 assert.equal((await inspector.inspect(await greenPromise)).noImage,false);
 await inspector.close();
});

test('v2.0.11 regression: screenshot NO IMAGE and broken Single URLs never export to PASSED',async()=>{
 const root=await fs.promises.mkdtemp(path.join(os.tmpdir(),'rakuten-yahoo-no-image-v211-'));
 const input=path.join(root,'source.xlsx');await fs.promises.writeFile(input,'UNMODIFIED USER EXCEL');
 const ids=['ACL-92','ACL-93','ACL-94','ACL-95'];
 const book=new Book([new Sheet('rak1-normal-item',[
  ['ID','SKU','IFRAME','OUTPUT','SINGLE'],
  ...ids.map(id=>[id,id,id==='ACL-93'?{error:'#VALUE!'}:iframe(id),'',single(id)])
 ])]);
 const imageFetcher=async url=>{
  if(/glv_acl-9[23]/.test(url))return screenshotSample;
  if(/glv_acl-95/.test(url))throw new Error('HTTP 404 from Yahoo Single source');
  if(/glv_acl-94/.test(url))return await bluePromise;
  if(url.startsWith('https://image.rakuten.co.jp/'))return await greenPromise;
  throw new Error(`Unexpected fixture URL ${url}`);
 };
 const app=new StandaloneBatch({excelFactory:()=>book,
  fetcher:async url=>({contentType:'text/html',buffer:Buffer.from(`<img src="${detail(path.posix.basename(new URL(url).pathname,'.html'))}">`)}),
  singlePreparer:async url=>({dataUri:url,htmlUrl:url}),
  rendererFactory:()=>new DirectJpegRenderer({imageFetcher,singleInspector:
   new SinglePlaceholderInspector({recognizeText:async()=>{throw new Error('OCR missing');}})})});
 try {
  const report=await app.generate(input);
  assert.equal(report.version,'2.0.12');
  assert.equal(report.ready,1);
  assert.equal(report.review,3);
  assert.equal(report.failed,0);
  assert.equal(report.jpegReady,4);
  assert.equal(report.singleNoImageRetainedCount,2);
  assert.equal(report.singleNoImageCount,2);
  const rows=Object.fromEntries(report.rows.map(r=>[r.productId.toUpperCase(),r]));
  for(const id of ['ACL-92','ACL-93']){
   const row=rows[id];
   assert.equal(row.singleStatus,'ERROR / NO IMAGE (RETAINED)');
   assert.ok(row.issueCodes.includes('SINGLE_NO_IMAGE'));
   assert.ok(row.singlePlaceholderMatch>=.84);
   assert.equal(row.htmlSingleIncluded,true);
   assert.equal(row.htmlPreviewOnly,true);
   assert.equal(row.jpegStatus,'READY');
   const excelRow=id==='ACL-92'?2:3;
   assert.equal(book.worksheets[0].getRow(excelRow).getCell(4).value,'');
  }
  assert.equal(rows['ACL-92'].status,'REVIEW');
  assert.ok(rows['ACL-92'].jpegFile.includes(`${path.sep}ERRORS${path.sep}`));
  assert.ok(rows['ACL-92'].htmlFile.includes(`${path.sep}ERRORS${path.sep}`));
  assert.equal(rows['ACL-92'].galleryCount,1);
  assert.match(await fs.promises.readFile(rows['ACL-92'].htmlFile,'utf8'),/glv_acl-92/i);
  const pixel=await sharp(rows['ACL-92'].jpegFile).extract({left:100,top:100,width:1,height:1})
   .removeAlpha().raw().toBuffer();
  assert.ok(Math.abs(pixel[1]-pixel[0])<12,'first pixels are retained NO IMAGE Single gray');
  assert.ok(rows['ACL-93'].jpegFile,'NO IMAGE + broken iframe retains real decoded placeholder as an error preview');
  assert.ok(rows['ACL-93'].htmlFile);
  assert.equal(rows['ACL-93'].combineLayout,'SINGLE_ONLY_IFRAME_ERROR');
  assert.ok(rows['ACL-93'].issueCodes.includes('IFRAME_ERROR'));
  assert.equal(rows['ACL-94'].status,'READY');
  assert.ok(rows['ACL-94'].jpegFile.includes(`${path.sep}PASSED${path.sep}`));
  assert.equal(rows['ACL-95'].status,'REVIEW');
  assert.ok(rows['ACL-95'].issueCodes.includes('SINGLE_BROKEN'));
  assert.equal(rows['ACL-95'].htmlSingleIncluded,false);
  assert.doesNotMatch(await fs.promises.readFile(rows['ACL-95'].htmlFile,'utf8'),/glv_acl-95/i);
  assert.equal((await fs.promises.readdir(path.join(report.passedFolder,'JPEG_FILES'))).length,1);
  assert.equal((await fs.promises.readdir(path.join(report.errorsFolder,'JPEG_FILES'))).length,3);
  const errorWorkbook=await fs.promises.readFile(report.errorsExcel,'utf8');
  assert.ok(errorWorkbook.includes('SINGLE_ERRORS'));
  assert.equal(await fs.promises.readFile(input,'utf8'),'UNMODIFIED USER EXCEL');
 }finally{await fs.promises.rm(root,{recursive:true,force:true});}
});
