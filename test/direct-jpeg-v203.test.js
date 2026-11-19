"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const fs=require("fs"),path=require("path"),os=require("os");
const sharp=require("sharp");
const {DirectJpegRenderer,planExistingJpeg,inlineImageBytes}=require("../src/core/directJpegRenderer");
const {safeImageUrl}=require("../src/core/imageDownload");
const url=i=>`https://image.rakuten.co.jp/glv/cabinet/sku/sku_${i}.jpg`;
async function png(w,h,color){return sharp({create:{width:w,height:h,channels:3,background:color}}).png().toBuffer();}
async function pixel(source,x,y){const out=await sharp(source).extract({left:x,top:y,width:1,height:1}).raw().toBuffer();return [...out];}
function colored(pixel,kind){
    const [r,g,b]=pixel;
    if(kind==="red")return r>180&&g<80&&b<80;
    if(kind==="blue")return b>140&&r<100;
    if(kind==="green")return g>120&&r<110;
    if(kind==="white")return r>225&&g>225&&b>225;
    return false;
}

test("v2.0.3 DIRECT JPEG: actual 600px file has full-bleed Single, 293px columns, honest gaps and no forced upscaling",async()=>{
    const dir=await fs.promises.mkdtemp(path.join(os.tmpdir(),"rakuten-direct-"));
    try {
        const sources=await Promise.all([
            png(400,200,"#ee1111"), // Single: up/down to 600x300, flush
            png(400,200,"#0033dd"), // 293x147, left
            png(100,80,"#00bb00"), // 100x80, centered in right cell (not enlarged)
            png(200,100,"#eebb00"), // left of second row
            png(500,300,"#00caca"), // 293x176, right
            png(200,300,"#bb00cc")  // odd final left
        ]);
        const map=new Map(sources.slice(1).map((buffer,i)=>[url(i+1),buffer]));
        const renderer=new DirectJpegRenderer({imageFetcher:async u=>map.get(u)});
        const file=path.join(dir,"abu-90combine.jpg");
        const result=await renderer.capture("unused",file,{images:[...map.keys()],single:sources[0],expectedImages:6});
        assert.deepEqual([result.width,result.height,result.singleHeight],[600,955,300]);
        const metadata=await sharp(file).metadata();
        assert.equal(metadata.format,"jpeg");assert.equal(metadata.width,600);assert.equal(metadata.height,955);
        assert.ok(colored(await pixel(file,0,20),"red"),"Single must hug left edge");
        assert.ok(colored(await pixel(file,599,20),"red"),"Single must hug right edge");
        assert.ok(colored(await pixel(file,30,299),"red"),"Single must reach exactly its content height");
        assert.ok(colored(await pixel(file,30,306),"white"),"15px Single gap must remain white");
        assert.ok(colored(await pixel(file,100,320),"blue"),"First gallery image should be in left column");
        assert.ok(colored(await pixel(file,450,320),"green"),"Second gallery image should be centered and not enlarged");
        assert.ok(colored(await pixel(file,345,320),"white"),"Small gallery image must not stretch across cell");
        assert.ok(colored(await pixel(file,300,330),"white"),"8px horizontal gap must remain white");
        assert.ok(colored(await pixel(file,70,465),"white"),"7px row gap must remain white");
        assert.ok(colored(await pixel(file,70,480),"red")===false);
        assert.ok(colored(await pixel(file,400,710),"white"),"Odd final row must have no right-hand placeholder image");
        assert.deepEqual(planExistingJpeg([{width:120,height:90},{width:300,height:150}],0).tiles.map(p=>p.column),[0,1]);
    } finally {await fs.promises.rm(dir,{recursive:true,force:true});}
});

test("v2.0.3 DIRECT JPEG: no Single starts gallery at top but preserves 3px image margins",async()=>{
    const dir=await fs.promises.mkdtemp(path.join(os.tmpdir(),"rakuten-no-single-"));
    try {
        const sources=[await png(293,200,"#0033dd"),await png(293,200,"#00bb00")];
        const renderer=new DirectJpegRenderer({imageFetcher:async u=>sources[Number(/_(\d+)\.jpg/.exec(u)[1])-1]});
        const file=path.join(dir,"no-single.jpg");
        const result=await renderer.capture("unused",file,{images:[url(1),url(2)],expectedImages:2});
        assert.equal(result.height,203);
        assert.ok(colored(await pixel(file,2,50),"white"));
        assert.ok(colored(await pixel(file,4,50),"blue"));
        assert.ok(colored(await pixel(file,305,50),"green"));
    } finally {await fs.promises.rm(dir,{recursive:true,force:true});}
});

test("v2.0.3 DIRECT JPEG: broken source image gets an actionable error and no partial JPEG is published",async()=>{
    const dir=await fs.promises.mkdtemp(path.join(os.tmpdir(),"rakuten-direct-fail-"));
    try {
        const good=await png(400,200,"#0033dd");
        const renderer=new DirectJpegRenderer({imageFetcher:async u=>u===url(1)?good:Buffer.from("not-an-image")});
        const file=path.join(dir,"should-not-exist.jpg");
        await assert.rejects(renderer.capture("unused",file,{images:[url(1),url(2)]}),/Gallery image 2/);
        await assert.rejects(fs.promises.access(file),/ENOENT/);
        await assert.rejects(fs.promises.access(file+".partial"),/ENOENT/);
    } finally {await fs.promises.rm(dir,{recursive:true,force:true});}
});

test("v2.0.3 DIRECT JPEG: sources are HTTPS allowlisted; inline Single data URI is accepted",()=>{
    assert.equal(safeImageUrl("https://item-shopping.c.yimg.jp/i/n/glv_abu-90"),"https://item-shopping.c.yimg.jp/i/n/glv_abu-90");
    assert.match(safeImageUrl("https://image.rakuten.co.jp/glv/cabinet/a.jpg"),/rakuten/);
    for(const invalid of ["http://image.rakuten.co.jp/a.jpg","https://evil.com/a.jpg","https://127.0.0.1/a.jpg","ftp://shop.r10s.jp/a.jpg"])
        assert.throws(()=>safeImageUrl(invalid),/not approved/);
    assert.deepEqual(inlineImageBytes("data:image/jpeg;base64,"+Buffer.from("abc").toString("base64")),Buffer.from("abc"));
    assert.throws(()=>inlineImageBytes("data:text/html;base64,YWJj"),/valid JPEG/);
});
