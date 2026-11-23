"use strict";
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('fs'),os=require('os'),path=require('path');
const sharp=require('sharp');
const {StandaloneBatch}=require('../src/core/batch');
const {DirectJpegRenderer}=require('../src/core/directJpegRenderer');
const {existingBrandSnippet}=require('../src/core/existingBrand');
const {buildExistingCombineOutput}=require('../src/core/combineOutput');

class Cell {constructor(){this.value=null;this.font={};this.alignment={};this.fill={};}}
class Row {constructor(){this.cells=new Map();this.height=0;}getCell(n){if(!this.cells.has(n))this.cells.set(n,new Cell());return this.cells.get(n);}get cellCount(){return Math.max(0,...this.cells.keys());}}
class Sheet {constructor(name,rows){this.name=name;this.rows=new Map();this.columns=new Map();this.views=[];rows.forEach((values,i)=>values.forEach((value,j)=>{if(value!==undefined)this.getRow(i+1).getCell(j+1).value=value;}));}
    getRow(n){if(!this.rows.has(n))this.rows.set(n,new Row());return this.rows.get(n);}
    get rowCount(){return Math.max(0,...this.rows.keys());}
    get columnCount(){return Math.max(0,...[...this.rows.values()].map(r=>r.cellCount));}
    getColumn(n){if(!this.columns.has(n))this.columns.set(n,{width:10});return this.columns.get(n);}
    eachRow(callback){for(let i=1;i<=this.rowCount;i++)callback(this.getRow(i),i);}
    spliceColumns(col,remove,...insert){for(const row of this.rows.values()){const values=[...row.cells];row.cells.clear();for(const [i,cell] of values){if(i<col)row.cells.set(i,cell);else if(i>=col+remove)row.cells.set(i+insert.length-remove,cell);}}}
}
class Book {constructor(sheets){this.worksheets=sheets;this.xlsx={readFile:async()=>{},writeFile:async file=>fs.promises.writeFile(file,'mock excel test bytes')};}}
const iframe=id=>`<iframe src="https://www.rakuten.ne.jp/gold/glv/six/test/${id}.html"></iframe>`;
const single=id=>`https://item-shopping.c.yimg.jp/i/n/glv_${id.toLowerCase()}`;
const img=(id,n)=>`https://image.rakuten.co.jp/glv/cabinet/test/${id.toLowerCase()}_${n}.jpg`;
const colors={single:[252,202,33],left:[219,37,61],right:[20,81,225],third:[24,166,82]};
const png=async(rgb,w,h)=>sharp({create:{width:w,height:h,channels:3,background:{r:rgb[0],g:rgb[1],b:rgb[2]}}}).png().toBuffer();
const encoded={single:null,left:null,right:null,third:null};
async function initializeColors(){for(const [name,rgb] of Object.entries(colors))if(!encoded[name])encoded[name]=await png(rgb,name==='single'?600:293,name==='single'?600:200);}
async function pixel(file,x,y){const {data}=await sharp(file).extract({left:x,top:y,width:1,height:1}).raw().toBuffer({resolveWithObject:true});return [...data.slice(0,3)];}
function sameColor(actual,want){return actual.every((v,i)=>Math.abs(v-want[i])<18);}
async function withBatch(fn){const dir=await fs.promises.mkdtemp(path.join(os.tmpdir(),'rakuten-v207-layout-'));const input=path.join(dir,'products.xlsx');await fs.promises.writeFile(input,'original');try{await fn({dir,input});}finally{await fs.promises.rm(dir,{force:true,recursive:true});}}

test('v2.0.7: PASSED and ERRORS use the identical Single + two-column Combine geometry, verified at pixels',async()=>{
 await initializeColors();
 await withBatch(async({input})=>{
    const book=new Book([new Sheet('rak1-normal-item',[
       ['ID','SKU','IFRAME','OUTPUT','SINGLE'],
       ['good-1','good-1',iframe('GOOD-1'),'',single('GOOD-1')],
       ['bad-detail','bad-detail',iframe('BAD-DETAIL'),'',single('BAD-DETAIL')],
       ['bad-single','bad-single',iframe('BAD-SINGLE'),'',single('BAD-SINGLE')]
    ])]);
    const imageFetcher=async url=>{
       if(url.includes('glv_bad-single'))throw new Error('Single broken');
       if(url.endsWith('_2.jpg')&&url.includes('bad-detail'))throw new Error('Detail 2 broken');
       if(url.includes('item-shopping'))return encoded.single;
       if(url.endsWith('_1.jpg'))return encoded.left;
       if(url.endsWith('_2.jpg'))return encoded.right;
       if(url.endsWith('_3.jpg'))return encoded.third;
       throw new Error('Unexpected URL '+url);
    };
    const fetcher=async url=>{
       const id=path.posix.basename(new URL(url).pathname,'.html');
       return {buffer:Buffer.from(`<html>${[1,2,3].map(i=>`<img src="${img(id,i)}">`).join('')}</html>`),contentType:'text/html'};
    };
    const service=new StandaloneBatch({excelFactory:()=>book,fetcher,
        singlePreparer:async url=>({dataUri:url,htmlUrl:url}),
        rendererFactory:()=>new DirectJpegRenderer({imageFetcher})});
    const report=await service.generate(input);
    assert.equal(report.version,'2.0.12');
    assert.equal(report.ready,1);assert.equal(report.review,2);
    const rows=Object.fromEntries(report.rows.map(r=>[r.productId,r]));
    const good=rows['good-1'],detail=rows['bad-detail'],broken=rows['bad-single'];
    assert.equal(good.status,'READY');assert.equal(detail.status,'REVIEW');assert.equal(broken.status,'REVIEW');
    assert.ok(detail.issueCodes.includes('DETAIL_IMAGE_BROKEN'));
    assert.ok(broken.issueCodes.includes('SINGLE_BROKEN'));
    for(const item of [good,detail,broken]){
      assert.equal(item.combineLayout,'SINGLE_TOP_THEN_TWO_COLUMNS');
      assert.equal(item.combineGalleryRows,item.productId==='bad-detail'?1:2);
      assert.ok(item.jpegFile&&item.htmlFile);
      assert.equal((await sharp(item.jpegFile).metadata()).width,600);
      const html=await fs.promises.readFile(item.htmlFile,'utf8');
      assert.match(html,/class="eb-gallery-table" width="780"/);
      assert.match(html,/class="eb-cell eb-left"/);assert.match(html,/class="eb-cell eb-right"/);
      assert.doesNotMatch(html,/DETAILS|display:grid/);
      assert.equal((html.match(/class="eb-gallery-row"/g)||[]).length,item.combineGalleryRows);
      const observed=await pixel(item.jpegFile,50,item.productId==='bad-single'?50:660);
      assert.ok(sameColor(observed,colors.left),`${item.productId}: observed ${observed}, expected ${colors.left}`);
    }
    assert.ok(sameColor(await pixel(good.jpegFile,0,0),colors.single),'Single full bleed at top-left');
    assert.ok(sameColor(await pixel(detail.jpegFile,0,0),colors.single),'error JPEG keeps Single full bleed');
    assert.ok(sameColor(await pixel(good.jpegFile,350,660),colors.right));
    assert.ok(sameColor(await pixel(detail.jpegFile,350,660),colors.third),'third detail reflows into freed right column');
    assert.ok(sameColor(await pixel(broken.jpegFile,350,50),colors.right),'broken Single puts gallery at top, two columns');
    assert.ok(sameColor(await pixel(broken.jpegFile,50,250),colors.third),'odd third detail stays left on second row');
    assert.ok(sameColor(await pixel(detail.jpegFile,302,606),[255,255,255]),'15px Single-to-gallery gap remains white');
    assert.equal(await fs.promises.readFile(input,'utf8'),'original');
 });
});

test('v2.0.9: local Single-only sources are saved as review-only JPEG/HTML under ERRORS',async()=>{
 await initializeColors();
 await withBatch(async({input})=>{
  const localSingle=await png(colors.single,600,600);
  const localData='data:image/jpeg;base64,'+(await sharp(localSingle).jpeg().toBuffer()).toString('base64');
  const localPath='C:\\products\\local.jpg';
  const book=new Book([new Sheet('rak1-normal-item',[
     ['ID','SKU','IFRAME','OUTPUT','SINGLE'],['local-1','local-1',iframe('LOCAL-1'),'',localPath]
  ])]);
  const service=new StandaloneBatch({excelFactory:()=>book,
      fetcher:async()=>{throw new Error('Broken iframe');},
      singlePreparer:async()=>({dataUri:localData,htmlUrl:null}),
      rendererFactory:()=>new DirectJpegRenderer({imageFetcher:async()=>{throw new Error('Should not download local Single');}})});
  const report=await service.generate(input);
  assert.equal(report.failed,0);
  assert.equal(report.review,1);
  const product=report.rows[0];
  assert.equal(product.status,'REVIEW');
  assert.ok(product.issueCodes.includes('IFRAME_ERROR'));
  assert.ok(product.issueCodes.includes('NO_VALID_DETAILS'));
  assert.ok(product.issueCodes.includes('SINGLE_HTML_MISSING'),'Local Single HTML remains preview-only');
  assert.equal(product.htmlPreviewOnly,true);
  assert.equal(product.combineGalleryRows,0);
  assert.ok(product.jpegFile&&product.htmlFile);
  assert.equal(product.combineLayout,'SINGLE_ONLY_IFRAME_ERROR');
  assert.equal(product.singleStatus,'INCLUDED JPEG + PREVIEW HTML');
  assert.deepEqual(await fs.promises.readdir(path.join(report.errorsFolder,'JPEG_FILES')),['LOCAL-1combine.jpg']);
  assert.deepEqual(await fs.promises.readdir(path.join(report.errorsFolder,'HTML_FILES')),['LOCAL-1.html']);
  assert.equal(book.worksheets[0].getRow(2).getCell(4).value,'','Nothing to copy into Rakuten OUTPUT column');
 });
});

test('v2.0.7: cannot publish a local inline Single or accidentally mix two Single sources',async()=>{
 await initializeColors();
 const jpegData='data:image/jpeg;base64,'+(await sharp(encoded.single).jpeg().toBuffer()).toString('base64');
 const snippet=existingBrandSnippet([],{previewSingle:jpegData});
 assert.match(snippet,/class="eb-single-row"/);
 assert.doesNotMatch(snippet,/eb-single-gap/);
 assert.throws(()=>existingBrandSnippet([],{previewSingle:jpegData,singleUrl:single('A-1')}),/both public and local preview/);
 assert.throws(()=>existingBrandSnippet([],{previewSingle:'data:image/jpeg;base64,nonsense#'}),/valid bounded JPEG/);
 assert.equal(buildExistingCombineOutput({images:[],single:jpegData}).layout,'SINGLE_ONLY_IFRAME_ERROR');
 assert.equal(buildExistingCombineOutput({images:[],single:jpegData}).htmlPublishable,false);
 assert.throws(()=>buildExistingCombineOutput({images:[]}),/no valid Single or Detail images/);
 assert.equal(buildExistingCombineOutput({images:[img('A-1',1)],single:single('A-1'),singleUrl:single('A-1')}).htmlPublishable,true);
});
