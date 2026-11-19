"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const fs=require("fs"),path=require("path"),os=require("os");
const sharp=require("sharp");
const {galleryRows,calculateFlow,existingBrandSnippet,existingBrandJpegHtml}=require("../src/core/existingBrand");
const {discoverImages}=require("../src/core/iframeHtml");
const {buildCombineLayout}=require("../src/manual/planner");
const {NewBrandService}=require("../src/manual/service");
const url=i=>`https://image.rakuten.co.jp/glv/cabinet/x/sku_${i}.jpg`;
const item=(name,w=350,h=480)=>({path:`/tmp/${name}.png`,name,width:w,height:h,visibleWidth:w,visibleHeight:h,
    bytes:100,mtimeMs:1});

test("Existing Brand uses real two-column HTML table and fixed two-column JPEG grid",()=>{
    const html=`<img src="${url(1)}"><h2>DETAILS</h2><img src="${url(2)}"><img src="https://image.rakuten.co.jp/glv/cabinet/another/item.jpg">`;
    const parsed=discoverImages(html,"https://www.rakuten.ne.jp/gold/glv/test/product.html",{keepAll:true});
    assert.equal(parsed.images.length,3);
    const images=parsed.images.map(i=>i.url),src=existingBrandSnippet(images),jpg=existingBrandJpegHtml({images});
    assert.deepEqual(galleryRows(images).flat(),images);
    assert.equal(galleryRows(images).length,2);
    assert.match(src,/<table class="eb-gallery-table" width="780"/);
    assert.equal((src.match(/class="eb-gallery-row"/g)||[]).length,2);
    assert.equal((src.match(/class="eb-cell eb-left"/g)||[]).length,2);
    assert.equal((src.match(/class="eb-cell eb-right"/g)||[]).length,2);
    assert.match(src,/max-width:386px/);
    assert.match(jpg,/grid-template-columns:293px 293px/);
    assert.equal((jpg.match(/class="eb-image"/g)||[]).length,3);
    assert.ok(src.indexOf(url(1))<src.indexOf(url(2)));
    assert.doesNotMatch(src,/flex-wrap|>DETAILS</);
    assert.doesNotMatch(jpg,/flex-wrap|class="bf-details"/);
});

test("Existing Brand always places two sequential images per row regardless of their intrinsic widths",()=>{
    const planned=calculateFlow([{width:280,height:400},{width:280,height:300},
        {width:310,height:200},{width:290,height:220},{width:800,height:300}]);
    assert.deepEqual(planned.rows.map(r=>r.length),[2,2,1]);
    assert.equal(planned.columnWidth,293);
    assert.deepEqual(planned.rows.flat().map(p=>p.index),[0,1,2,3,4]);
    assert.deepEqual(planned.rows.flat().map(p=>p.column),[0,1,0,1,0]);
    assert.equal(planned.rows[0][0].width,280); // no upscaling
    assert.equal(planned.rows[0][1].width,280);
    assert.equal(planned.rows[1][0].width,293); // cell-bound proportional fit only
    assert.equal(planned.rows[1][1].width,290); // no arbitrary shrink of neighbor
    assert.equal(planned.rows[2][0].width,293);
    assert.equal(planned.rows[2][0].scale,293/800);
    assert.equal(planned.rows[1][0].y,407); // tallest first-row image 400 + 7 gap
    assert.equal(planned.rows[2][0].y,634); // tallest second-row image 220 + 7 gap
    assert.equal(planned.rows[0][0].scale,1);
});

test("Existing Brand puts Single before exactly two JPEG columns and one 780px HTML table",()=>{
    const images=Array.from({length:5},(_,i)=>url(i+1));
    const single="https://item-shopping.c.yimg.jp/i/n/glv_abu-90";
    const src=existingBrandSnippet(images,{singleUrl:single});
    const jpg=existingBrandJpegHtml({images,single});
    assert.equal((src.match(/class="eb-single-row"/g)||[]).length,1);
    assert.equal((src.match(/colspan="2"/g)||[]).length,4); // Single, Single gap and two row gaps
    assert.equal((src.match(/class="eb-gallery-row"/g)||[]).length,3);
    assert.equal((src.match(/alt="Product /g)||[]).length,5);
    assert.ok(src.indexOf('alt="Single"')<src.indexOf('alt="Product 1"'));
    assert.ok(jpg.indexOf('alt="Single"')<jpg.indexOf('data-order="1"'));
    assert.match(jpg,/grid-template-columns:293px 293px/);
    assert.doesNotMatch(jpg,/grid-template-columns:1fr|flex-wrap/);
    assert.match(jpg,/row-gap:7px/);
    assert.match(jpg,/column-gap:8px/);
    assert.match(src,/eb-single-gap/);
    assert.doesNotMatch(src,/DETAILS/);
});

test("JPEG exporter rejects any one-column result instead of silently saving it",()=>{
    const {validateTwoColumnGeometry}=require("../src/core/iframeJpegRenderer");
    const good={galleryX:3,galleryWidth:594,columns:2,tiles:[
        {x:3,y:618,w:293,h:280},{x:304,y:618,w:293,h:300},
        {x:3,y:925,w:293,h:240},{x:304,y:925,w:293,h:240},
        {x:3,y:1172,w:293,h:280}
    ]};
    assert.equal(validateTwoColumnGeometry(good,5),true);
    assert.throws(()=>validateTwoColumnGeometry({...good,columns:1},5),/two-column gallery/);
    const oneColumn={...good,tiles:good.tiles.map((r,i)=>({...r,x:3,y:618+i*300}))};
    assert.throws(()=>validateTwoColumnGeometry(oneColumn,5),/outside its fixed column/);
    assert.throws(()=>validateTwoColumnGeometry(good,4),/expected 4/);
    assert.throws(()=>validateTwoColumnGeometry({...good,tiles:good.tiles.map((r,i)=>i===2?{...r,y:900}:r)},5),/vertical gap/);
});

test("Original BrandForge geometry is retained for New Brand with optional captions",()=>{
    const single=item("single",600,600);
    const normal=item("red",400,500),next=item("blue",420,500),detail=item("detail",700,350);
    const layout=buildCombineLayout({single,lineup:[{...normal,colorName:"Red"},{...next,colorName:"Blue"}],details:[detail],outputName:"SKU-10"});
    assert.equal(layout.width,600);
    assert.equal(layout.single.placedWidth,600);
    assert.equal(layout.lineupRows[0].kind,"regular");
    assert.equal(layout.lineup[0].labels[0].text,"Red");
    assert.equal(layout.lineup[0].labels[0].height,36);
    assert.equal(layout.geometry.columnGap,8);assert.equal(layout.geometry.rowGap,7);
    assert.equal(layout.geometry.labelSize,28);assert.equal(layout.geometry.singleGap,15);
    assert.equal(layout.detailsHeader.text,"DETAILS");
    const noCaptions=buildCombineLayout({single:null,lineup:[{...normal,colorName:""},{...next,colorName:""}],details:[],outputName:"SKU-11"});
    assert.equal(noCaptions.lineupRows[0].labelHeight,0);
    assert.equal(noCaptions.lineup[0].labels.length,0);
    assert.equal(noCaptions.detailsHeader,null);
});

test("Two-variant horizontal and vertical photos remain a single intact row",()=>{
    const double=item("pair",600,520);
    for(const mode of ["dual","vertical"]){
        const layout=buildCombineLayout({single:null,lineup:[{...double,rowMode:mode,colorName:"Ivory",colorNameRight:"Black"}],details:[],outputName:`PAIR-${mode}`});
        assert.equal(layout.lineup.length,1);
        assert.equal(layout.lineupRows.length,1);
        assert.equal(layout.lineupRows[0].kind,mode);
        assert.equal(layout.lineup[0].labels.length,2);
        assert.equal(layout.lineup[0].placedWidth,594);
    }
});

test("New Brand service accepts manual source images without changing original bytes",async()=>{
    const dir=await fs.promises.mkdtemp(path.join(os.tmpdir(),"rakuten-two-modes-"));
    try{
        const source=path.join(dir,"photo.png");
        await sharp({create:{width:120,height:90,channels:3,background:{r:180,g:90,b:80}}}).png().toFile(source);
        const original=await fs.promises.readFile(source);
        const service=new NewBrandService();
        const imported=await service.importPaths([source]);
        assert.equal(imported.images.length,1);
        assert.match(imported.images[0].thumbnail,/^data:image\/jpeg;base64,/);
        service.setOutputFolder(dir);
        const preview=service.plan({outputName:"SKU-NEW",lineup:[{path:source,colorName:""}],details:[]});
        assert.equal(preview.lineup[0].labels.length,0);
        const output=await service.generate({outputName:"SKU-NEW",lineup:[{path:source,colorName:""}],details:[]});
        assert.ok(fs.existsSync(output.outputPath));
        assert.equal(output.lineupCount,1);
        assert.ok(fs.existsSync(output.htmlPath));
        assert.ok(fs.existsSync(output.jpegPath));
        assert.deepEqual(await fs.promises.readFile(source),original);
    }finally{await fs.promises.rm(dir,{recursive:true,force:true});}
});
