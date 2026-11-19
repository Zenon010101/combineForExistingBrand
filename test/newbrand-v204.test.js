"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const fs=require("fs"),path=require("path"),os=require("os"),sharp=require("sharp");
const {NewBrandService}=require("../src/manual/service");
const {NewBrandFolderMemory}=require("../src/core/newBrandFolders");
const {newBrandHtml,CAPTION_FONT,CAPTION_FONT_SIZE}=require("../src/manual/directOutput");
const {inspectOne}=require("../src/manual/assets");
async function make(w,h,color,file){await sharp({create:{width:w,height:h,channels:4,background:color}}).png().toFile(file);return file;}
async function pixel(file,x,y){return [...await sharp(file).extract({left:x,top:y,width:1,height:1}).raw().toBuffer()];}
const rgb=(p,c)=>{if(c==="red")return p[0]>150&&p[1]<120&&p[2]<120;if(c==="green")return p[1]>130&&p[0]<120; if(c==="blue")return p[2]>150&&p[0]<120; if(c==="white")return p[0]>235&&p[1]>235&&p[2]>235;return false;};

async function fixture(t){
 const root=await fs.promises.mkdtemp(path.join(os.tmpdir(),"newbrand-v204-"));
 const output=path.join(root,"output");await fs.promises.mkdir(output);
 t.after(()=>fs.promises.rm(root,{recursive:true,force:true}));
 return {root,output};
}

test("v2.0.4 New Brand generates real JPEG and matching HTML without Photoshop",async t=>{
 const {root,output}=await fixture(t);
 const a=await make(600,600,"#e32626",path.join(root,"single.png"));
 const b=await make(280,220,"#0000db",path.join(root,"one.png"));
 const c=await make(260,210,"#00c800",path.join(root,"two.png"));
 const d=await make(240,240,"#8c8c8c",path.join(root,"detail.png"));
 const service=new NewBrandService();
 assert.equal((await service.importPaths([a,b,c,d])).failed.length,0);
 service.setOutputFolder(output);
 const messages=[];
 const result=await service.generate({outputName:"NEW-20",singlePath:a,
   lineup:[{path:b,colorName:"NAVY"},{path:c,colorName:"ライム × WHITE"}],details:[d]},p=>messages.push(p.message));
 assert.equal(result.psdPath,null);
 assert.ok(result.htmlPath.endsWith("NEW-20.html"));
 assert.equal(result.jpegPaths.length,1);
 const jpg=result.jpegPaths[0];
 const meta=await sharp(jpg).metadata();
 assert.equal(meta.format,"jpeg");assert.equal(meta.width,600);assert.equal(meta.height,result.height);
 const html=await fs.promises.readFile(result.htmlPath,"utf8");
 assert.match(html,/NEW-20\.jpg/);assert.match(html,/<table width="600"/);assert.match(html,/<img src="NEW-20\.jpg"/);
 assert.ok(rgb(await pixel(jpg,100,100),"red"),"Single must be at top");
 assert.ok(rgb(await pixel(jpg,80,710),"blue"),"First lineup image must remain in left column");
 assert.ok(rgb(await pixel(jpg,400,700),"green"),"Second lineup image must remain in right column");
 assert.ok(messages.some(m=>m.includes("Fitted 4/4")));
 assert.ok(messages.some(m=>m.includes("Saved JPEG")));
 assert.ok(messages.some(m=>m.includes("Saved HTML")));
 assert.equal(CAPTION_FONT,"Hiragino Kaku Gothic Pro");assert.equal(CAPTION_FONT_SIZE,28);
});

test("v2.0.4 24 sources finish JPEG and HTML after 'Fitted 24/24' and do not require Photoshop",async t=>{
 const {root,output}=await fixture(t);
 const images=[];
 for(let i=0;i<24;i++)images.push(await make(120,80,{r:35+(i*3)%150,g:70,b:150},path.join(root,`image_${i}.png`)));
 const service=new NewBrandService();await service.importPaths(images);service.setOutputFolder(output);
 const steps=[];
 const result=await service.generate({outputName:"TWENTY-FOUR",lineup:images.slice(0,12).map(p=>({path:p,colorName:""})),details:images.slice(12)},p=>steps.push(p.message));
 assert.ok(steps.some(s=>s.includes("Fitted 24/24")));
 assert.ok(steps.some(s=>s.includes("Saved JPEG")));
 assert.ok(steps.some(s=>s.includes("Saved HTML")));
 assert.ok(steps.some(s=>s.includes("DONE:")));
 assert.equal(result.sourceCount,24);
 assert.ok((await sharp(result.jpegPath).metadata()).height>0);
});

test("v2.0.4 Photoshop failure is isolated; JPEG and HTML remain available",async t=>{
 const {root,output}=await fixture(t);
 const img=await make(200,190,"#d8ae88",path.join(root,"shoe.png"));
 const service=new NewBrandService({photoshopBuilder:async()=>{throw new Error("Photoshop COM unavailable");}});
 await service.importPaths([img]);service.setOutputFolder(output);
 const result=await service.generate({outputName:"SKU-PSD",singlePath:img,exportPsd:true});
 assert.match(result.psdWarning,/COM unavailable/);
 assert.equal(result.psdPath,null);
 assert.ok(fs.existsSync(result.htmlPath));assert.ok(fs.existsSync(result.jpegPath));
});

test("v2.0.4 version-safe names never overwrite existing HTML or JPEG",async t=>{
 const {root,output}=await fixture(t);const img=await make(120,120,"#7777dd",path.join(root,"bag.png"));
 const service=new NewBrandService();await service.importPaths([img]);service.setOutputFolder(output);
 const one=await service.generate({outputName:"ABC",details:[img]});
 const buffer=await fs.promises.readFile(one.jpegPath);
 const two=await service.generate({outputName:"ABC",details:[img]});
 assert.match(path.basename(two.htmlPath),/^ABC_v2\.html$/);
 assert.match(await fs.promises.readFile(two.htmlPath,"utf8"),/ABC_v2\.jpg/);
 assert.deepEqual(await fs.promises.readFile(one.jpegPath),buffer);
});

test("v2.0.4 remembers all four New Brand folders and supports explicit clear",async t=>{
 const {root,output}=await fixture(t);
 const folder=path.join(root,"single");await fs.promises.mkdir(folder);
 const another=path.join(root,"lineup");await fs.promises.mkdir(another);
 const d=path.join(root,"details");await fs.promises.mkdir(d);
 const mem=new NewBrandFolderMemory(root);
 await mem.set("single",folder);await mem.set("lineup",another);await mem.set("details",d);await mem.set("output",output);
 const reopened=new NewBrandFolderMemory(root);
 assert.deepEqual(await reopened.load(),{single:folder,lineup:another,details:d,output});
 await reopened.clear();assert.deepEqual(await mem.load(),{single:"",lineup:"",details:"",output:""});
});

test("v2.0.4 accepts any Sharp-readable image suffix, but skips non-images",async t=>{
 const {root}=await fixture(t);
 const source=await make(100,80,"#8cc8aa",path.join(root,"bitmap.png"));
 const odd=path.join(root,"custom.data");await fs.promises.copyFile(source,odd);
 const result=await inspectOne(odd);assert.equal(result.width,100);
 const bad=path.join(root,"random.pdf");await fs.promises.writeFile(bad,"not a PDF image");
 await assert.rejects(inspectOne(bad),/Not a readable image/);
});

test("v2.0.4 HTML safe escapes and multi-part JPEG filenames",()=>{
 const html=newBrandHtml('SKU & <test>',[{height:60000},{height:25}]);
 assert.match(html,/SKU &amp; &lt;test&gt;_01\.jpg/);
 assert.match(html,/SKU &amp; &lt;test&gt;_02\.jpg/);
 assert.equal((html.match(/<tr>/g)||[]).length,2);
});
