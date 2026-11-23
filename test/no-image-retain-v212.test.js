'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('fs'),os=require('os'),path=require('path');
const sharp=require('sharp');
const {StandaloneBatch}=require('../src/core/batch');
const {DirectJpegRenderer}=require('../src/core/directJpegRenderer');
const {SinglePlaceholderInspector}=require('../src/core/singlePlaceholder');

class Cell{constructor(){this.value=null;this.font={};this.fill={};this.alignment={};}}
class Row{constructor(){this.cells=new Map();this.height=0;}getCell(n){if(!this.cells.has(n))this.cells.set(n,new Cell());return this.cells.get(n);}get cellCount(){return Math.max(0,...this.cells.keys());}}
class Sheet{
 constructor(name,rows){this.name=name;this.rows=new Map();this.columns=new Map();this.views=[];rows.forEach((data,i)=>data.forEach((v,j)=>{if(v!==undefined)this.getRow(i+1).getCell(j+1).value=v;}));}
 getRow(n){if(!this.rows.has(n))this.rows.set(n,new Row());return this.rows.get(n);}
 get rowCount(){return Math.max(0,...this.rows.keys());}
 get columnCount(){return Math.max(0,...[...this.rows.values()].map(r=>r.cellCount));}
 getColumn(n){if(!this.columns.has(n))this.columns.set(n,{width:10});return this.columns.get(n);}
 eachRow(fn){for(let i=1;i<=this.rowCount;i++)fn(this.getRow(i),i);}
 spliceColumns(col,remove,...insert){for(const row of this.rows.values()){const old=[...row.cells];row.cells.clear();for(const [i,cell] of old)row.cells.set(i<col?i:i+insert.length-remove,cell);}}
}
class Book{constructor(worksheets=[]){this.worksheets=worksheets;this.xlsx={readFile:async()=>{},writeFile:async filename=>fs.promises.writeFile(filename,JSON.stringify(this.worksheets.map(x=>x.name)))}};}
const sourceNoImage=fs.readFileSync(path.join(__dirname,'fixtures','yahoo-no-image-actual-compressed.jpg'));
const expectedSingle=url=>`https://item-shopping.c.yimg.jp/i/n/glv_${url.toLowerCase()}`;
const iframe=id=>`<iframe src="https://www.rakuten.ne.jp/gold/glv/six/acl/${id}.html"></iframe>`;
const detail=id=>`https://image.rakuten.co.jp/glv/cabinet/acl/${id.toLowerCase()}_1.jpg`;
const green=sharp({create:{width:700,height:700,channels:3,background:'#11b23a'}}).png().toBuffer();
const blue=sharp({create:{width:600,height:600,channels:3,background:'#143fa4'}}).png().toBuffer();
async function rgb(buffer,x,y,width=600){const pix=await sharp(buffer).extract({left:x,top:y,width:1,height:1}).removeAlpha().raw().toBuffer();return [...pix];}

test('v2.0.12: keep NO IMAGE at top of ERRORS Combine JPEG and HTML, without publishing invalid HTML',async()=>{
 const root=await fs.promises.mkdtemp(path.join(os.tmpdir(),'rakuten-v212-retain-no-image-'));
 const excelFile=path.join(root,'source.xlsx');await fs.promises.writeFile(excelFile,'UNCHANGED ORIGINAL EXCEL');
 const ids=['ACL-92','ACL-93','ACL-94','ACL-95'];
 const book=new Book([new Sheet('rak1-normal-item',[
  ['ID','SKU','IFRAME','OUTPUT','SINGLE'],
  ...ids.map(id=>[id,id,id==='ACL-93'?{error:'#VALUE!'}:iframe(id),'',expectedSingle(id)])
 ])]);
 const runner=new StandaloneBatch({excelFactory:()=>book,
  fetcher:async url=>({contentType:'text/html',buffer:Buffer.from(`<img src="${detail(path.posix.basename(new URL(url).pathname,'.html'))}">`)}),
  singlePreparer:async url=>({dataUri:url,htmlUrl:url}),
  rendererFactory:()=>new DirectJpegRenderer({imageFetcher:async url=>{
   if(/glv_acl-9[23]/.test(url))return sourceNoImage;
   if(/glv_acl-94/.test(url))throw new Error('HTTP 404');
   if(/glv_acl-95/.test(url))return await blue;
   if(url.startsWith('https://image.rakuten.co.jp/'))return await green;
   throw new Error(`Unexpected URL ${url}`);
  },singleInspector:new SinglePlaceholderInspector({recognizeText:async()=>{throw new Error('OCR unavailable');}})})});
 try{
  const report=await runner.generate(excelFile);
  assert.equal(report.version,'2.0.12');
  assert.equal(report.singleNoImageCount,2);
  assert.equal(report.singleNoImageRetainedCount,2);
  assert.equal(report.ready,1);
  assert.equal(report.review,3);
  assert.equal(report.jpegReady,4);
  const rows=Object.fromEntries(report.rows.map(r=>[r.productId,r]));
  const withDetails=rows['acl-92'];
  assert.equal(withDetails.status,'REVIEW');
  assert.ok(withDetails.issueCodes.includes('SINGLE_NO_IMAGE'));
  assert.equal(withDetails.singleStatus,'ERROR / NO IMAGE (RETAINED)');
  assert.equal(withDetails.htmlPreviewOnly,true);
  assert.equal(withDetails.htmlSingleIncluded,true);
  assert.equal(withDetails.jpegHeight,911);
  assert.ok(withDetails.jpegFile.includes(`${path.sep}ERRORS${path.sep}`));
  assert.ok(withDetails.htmlFile.includes(`${path.sep}ERRORS${path.sep}`));
  const html=await fs.promises.readFile(withDetails.htmlFile,'utf8');
  assert.ok(html.includes(expectedSingle('ACL-92')));
  assert.ok(html.includes(detail('ACL-92')));
  assert.equal(book.worksheets[0].getRow(2).getCell(4).value,'', 'known-bad HTML must not be published to Excel OUTPUT');
  const actualTop=await sharp(withDetails.jpegFile).extract({left:0,top:0,width:600,height:600}).raw().toBuffer();
  const sourceTop=await sharp(sourceNoImage).raw().toBuffer();
  let sum=0,n=0;
  for(let i=0;i<sourceTop.length;i+=17){sum+=Math.abs(sourceTop[i]-actualTop[i]);n++;}
  assert.ok(sum/n<15,`First 600px should contain the original NO IMAGE Single, mean abs difference=${sum/n}`);
  const detailPixel=await rgb(await fs.promises.readFile(withDetails.jpegFile),30,640);
  assert.ok(detailPixel[1]>detailPixel[0]+50,`Gallery below NO IMAGE Single must remain green: ${detailPixel}`);

  const singleOnly=rows['acl-93'];
  assert.equal(singleOnly.status,'REVIEW');
  assert.equal(singleOnly.combineLayout,'SINGLE_ONLY_IFRAME_ERROR');
  assert.ok(singleOnly.issueCodes.includes('SINGLE_NO_IMAGE'));
  assert.ok(singleOnly.issueCodes.includes('IFRAME_ERROR'));
  assert.equal(singleOnly.jpegHeight,600);
  assert.ok((await fs.promises.readFile(singleOnly.htmlFile,'utf8')).includes(expectedSingle('ACL-93')));
  assert.equal(book.worksheets[0].getRow(3).getCell(4).value,'');
  assert.ok(singleOnly.jpegFile.includes(`${path.sep}ERRORS${path.sep}`));

  const broken=rows['acl-94'];
  assert.equal(broken.status,'REVIEW');
  assert.ok(broken.issueCodes.includes('SINGLE_BROKEN'));
  assert.equal(broken.htmlSingleIncluded,false,'Unavailable bytes cannot be kept');
  assert.ok(broken.jpegFile.includes(`${path.sep}ERRORS${path.sep}`));
  assert.equal(broken.galleryCount,1);

  const valid=rows['acl-95'];
  assert.equal(valid.status,'READY');
  assert.ok(valid.jpegFile.includes(`${path.sep}PASSED${path.sep}`));
  assert.equal(valid.htmlPreviewOnly,false);
  assert.ok(String(book.worksheets[0].getRow(5).getCell(4).value).includes(expectedSingle('ACL-95')));
  assert.equal(await fs.promises.readFile(excelFile,'utf8'),'UNCHANGED ORIGINAL EXCEL');
  const errors=await fs.promises.readFile(report.errorsExcel,'utf8');
  assert.ok(errors.includes('SINGLE_ERRORS'));
  assert.equal((await fs.promises.readdir(path.join(report.errorsFolder,'JPEG_FILES'))).length,3);
 }finally {await fs.promises.rm(root,{recursive:true,force:true});}
});
