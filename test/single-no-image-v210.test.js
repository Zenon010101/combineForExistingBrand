'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('fs'),os=require('os'),path=require('path');
const sharp=require('sharp');
const {StandaloneBatch}=require('../src/core/batch');
const {DirectJpegRenderer}=require('../src/core/directJpegRenderer');
const {SinglePlaceholderInspector,singleAppearance,noImageText,isConfidentPlaceholderGeometry}=require('../src/core/singlePlaceholder');

class Cell{constructor(){this.value=null;this.font={};this.fill={};this.alignment={};}}
class Row{constructor(){this.cells=new Map();this.height=0;}getCell(i){if(!this.cells.has(i))this.cells.set(i,new Cell());return this.cells.get(i);}get cellCount(){return Math.max(0,...this.cells.keys());}}
class Sheet{constructor(name,rows){this.name=name;this.rows=new Map();this.columns=new Map();this.views=[];
 rows.forEach((data,i)=>data.forEach((v,j)=>{if(v!==undefined)this.getRow(i+1).getCell(j+1).value=v;}));}
 getRow(i){if(!this.rows.has(i))this.rows.set(i,new Row());return this.rows.get(i);}
 get rowCount(){return Math.max(0,...this.rows.keys());}get columnCount(){return Math.max(0,...[...this.rows.values()].map(r=>r.cellCount));}
 getColumn(i){if(!this.columns.has(i))this.columns.set(i,{width:10});return this.columns.get(i);}
 eachRow(callback){for(let i=1;i<=this.rowCount;i++)callback(this.getRow(i),i);}
 spliceColumns(col,remove,...insert){for(const row of this.rows.values()){const old=[...row.cells];row.cells.clear();for(const [i,cell] of old)row.cells.set(i<col?i:i+insert.length-remove,cell);}}
}
class Book{constructor(worksheets=[]){this.worksheets=worksheets;this.xlsx={readFile:async()=>{},writeFile:async(file)=>{
 await fs.promises.writeFile(file,JSON.stringify(this.worksheets.map(s=>({name:s.name,rows:[...s.rows].map(([i,r])=>({i,values:[...r.cells].map(([c,v])=>({c,value:v.value}))}))}))));
}};}}
const iframe=id=>`<iframe src="https://www.rakuten.ne.jp/gold/glv/six/qc/${id}.html"></iframe>`;
const single=id=>`https://item-shopping.c.yimg.jp/i/n/glv_${id.toLowerCase()}`;
const detail=id=>`https://image.rakuten.co.jp/glv/cabinet/qc/${id.toLowerCase()}_1.jpg`;
function placeholderSvg(){return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600"><rect width="600" height="600" fill="#f6f6f6"/><rect x="188" y="183" width="224" height="208" rx="7" fill="#ececec"/><rect x="229" y="216" width="142" height="109" rx="3" fill="none" stroke="#bdbdbd" stroke-width="9"/><circle cx="271" cy="249" r="13" fill="#c6c6c6"/><path d="M238 315 L278 278 L310 298 L339 261 L362 302 L362 315Z" fill="#bdbdbd"/><text x="300" y="370" font-family="DejaVu Sans" font-size="24" text-anchor="middle" font-weight="bold" fill="#bdbdbd">NO IMAGE</text></svg>`);}
function grayscaleProductSvg(){return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600"><rect width="600" height="600" fill="white"/><ellipse cx="300" cy="350" rx="170" ry="90" fill="#888"/><ellipse cx="300" cy="330" rx="170" ry="85" fill="#ddd"/><ellipse cx="300" cy="325" rx="120" ry="50" fill="#fafafa"/></svg>`);}
const placeholderPromise=sharp(placeholderSvg()).png().toBuffer();
const productPromise=sharp(grayscaleProductSvg()).png().toBuffer();
const validPromise=sharp({create:{width:600,height:600,channels:3,background:'#3456aa'}}).png().toBuffer();
const whitePromise=sharp({create:{width:600,height:600,channels:3,background:'#ffffff'}}).png().toBuffer();

// All OCR behavior is injectable: the release only needs bundled tesseract.js
// for genuinely gray candidate images, not for every product downloaded.
test('v2.0.10: pale gray NO IMAGE icon+text is detectable despite a valid PNG',async()=>{
 const image=await placeholderPromise;
 const appearance=await singleAppearance(image);
 assert.equal(appearance.candidate,true);
 assert.equal(isConfidentPlaceholderGeometry(appearance),true);
 assert.equal(noImageText('NO IMAGE'),true);
 assert.equal(noImageText('N0 1MAGE'),true);
 assert.equal(noImageText('PRODUCT 123'),false);
 const inspector=new SinglePlaceholderInspector({recognizeText:async()=> 'NO IMAGE'});
 const verdict=await inspector.inspect(image);
 assert.equal(verdict.noImage,true);
 assert.equal(verdict.review,false);
 await inspector.close();
});
test('v2.0.10: strong gray placeholder shape blocks when OCR is unavailable, ordinary products remain valid',async()=>{
 const missingOcr=new SinglePlaceholderInspector({recognizeText:async()=>{throw new Error('OCR worker missing');}});
 assert.equal((await missingOcr.inspect(await placeholderPromise)).noImage,true);
 assert.equal((await missingOcr.inspect(await validPromise)).noImage,false);
 assert.equal((await missingOcr.inspect(await productPromise)).noImage,false);
 await missingOcr.close();
});

test('v2.0.10: error Singles are omitted from both Combine JPG and HTML; genuine Single-only iframe errors remain',async()=>{
 const root=await fs.promises.mkdtemp(path.join(os.tmpdir(),'rakuten-v210-no-image-'));
 const input=path.join(root,'source.xlsx');await fs.promises.writeFile(input,'ORIGINAL XLSX UNCHANGED');
 try {
  const ids=['A-1','B-1','C-1','D-1','E-1','F-1','G-1'];
  const book=new Book([new Sheet('rak1-normal-item',[
    ['ID','SKU','IFRAME','OUTPUT','SINGLE'],
    ...ids.map(id=>[id,id,['C-1','D-1'].includes(id)?{error:'#VALUE!'}:iframe(id),'',id==='F-1'?null:single(id)])
  ])]);
  const imageFetcher=async url=>{
    if(/glv_[bc]-1/.test(url))return await placeholderPromise;
    if(/glv_e-1/.test(url))return await whitePromise;
    if(/glv_g-1/.test(url))return await productPromise;
    return await validPromise;
  };
  const runner=new StandaloneBatch({excelFactory:()=>book,
    fetcher:async url=>({contentType:'text/html',buffer:Buffer.from(`<img src="${detail(path.posix.basename(new URL(url).pathname,'.html'))}">`)}),
    singlePreparer:async url=>({dataUri:url,htmlUrl:url}),
    rendererFactory:()=>new DirectJpegRenderer({imageFetcher,singleInspector:
        new SinglePlaceholderInspector({recognizeText:async()=> 'NO IMAGE'})})});
  const report=await runner.generate(input);
  assert.equal(report.version,'2.0.12');
  assert.equal(report.ready,3);
  assert.equal(report.review,4);
  assert.equal(report.failed,0);
  assert.equal(report.jpegReady,7);
  assert.equal(report.singleNoImageRetainedCount,2);
  assert.equal(report.singleNoImageCount,2);
  const rows=Object.fromEntries(report.rows.map(row=>[row.productId.toLowerCase(),row]));
  for(const id of ['b-1','c-1']){
    assert.ok(rows[id].issueCodes.includes('SINGLE_NO_IMAGE'));
    assert.equal(rows[id].singleStatus,'ERROR / NO IMAGE (RETAINED)');
  }
  assert.equal(rows['b-1'].combineLayout,'SINGLE_TOP_THEN_TWO_COLUMNS');
  assert.equal(rows['b-1'].htmlSingleIncluded,true);
  assert.equal(rows['b-1'].htmlPreviewOnly,true);
  assert.equal(book.worksheets[0].getRow(3).getCell(4).value,'','known-bad Single HTML must not be exported as publishable Excel code');
  assert.ok(rows['b-1'].jpegFile.includes(`${path.sep}ERRORS${path.sep}`));
  const bHtml=await fs.promises.readFile(rows['b-1'].htmlFile,'utf8');
  assert.match(bHtml,/glv_b-1/i);
  assert.match(bHtml,/alt="Single"/i);
  assert.ok(bHtml.includes(detail('B-1')));
  const firstPixel=await sharp(rows['b-1'].jpegFile).extract({left:100,top:100,width:1,height:1}).removeAlpha().raw().toBuffer();
  assert.ok(Math.abs(firstPixel[2]-firstPixel[0])<15,'top of error JPEG must keep the NO IMAGE gray bitmap');
  assert.ok(rows['c-1'].jpegFile&&rows['c-1'].htmlFile);
  assert.ok(rows['c-1'].issueCodes.includes('SINGLE_ONLY_IFRAME_ERROR'));
  assert.equal(rows['c-1'].htmlPreviewOnly,true);
  assert.equal(book.worksheets[0].getRow(4).getCell(4).value,'');
  assert.equal(rows['d-1'].combineLayout,'SINGLE_ONLY_IFRAME_ERROR');
  assert.ok(rows['d-1'].jpegFile&&rows['d-1'].htmlFile);
  assert.ok(rows['d-1'].issueCodes.includes('IFRAME_ERROR'));
  assert.ok((await fs.promises.readFile(rows['d-1'].htmlFile,'utf8')).includes(single('D-1')));
  assert.equal(rows['e-1'].singleStatus,'ERROR / BLANK SINGLE');
  assert.equal(rows['e-1'].htmlSingleIncluded,false);
  assert.ok(rows['e-1'].issueCodes.includes('SINGLE_BLANK_REVIEW'));
  assert.doesNotMatch(await fs.promises.readFile(rows['e-1'].htmlFile,'utf8'),/glv_e-1/);
  assert.equal(rows['a-1'].status,'READY');
  assert.equal(rows['f-1'].status,'READY');
  assert.equal(rows['g-1'].status,'READY');
  assert.equal((await fs.promises.readdir(path.join(report.passedFolder,'JPEG_FILES'))).length,3);
  assert.equal((await fs.promises.readdir(path.join(report.errorsFolder,'JPEG_FILES'))).length,4);
  const errors=JSON.parse(await fs.promises.readFile(report.errorsExcel,'utf8'));
  assert.ok(JSON.stringify(errors).includes('SINGLE_NO_IMAGE'));
  assert.equal(report.errorsByType.SINGLE_ERRORS,3);
  assert.equal(await fs.promises.readFile(input,'utf8'),'ORIGINAL XLSX UNCHANGED');
 }finally {await fs.promises.rm(root,{recursive:true,force:true});}
});
