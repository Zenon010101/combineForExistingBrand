"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const fs=require("fs"),path=require("path");
const base=path.resolve(__dirname,"..");
const read=p=>fs.readFileSync(path.join(base,p),"utf8");
test("v2.0.5: only the Existing Brand screen, Excel controls and one renderer script are shipped",()=>{
 const html=read("src/renderer/index.html");
 for(const id of ["browse","dropZone","testThree","runFull","stop","openExcel","openFolder"])
  assert.match(html,new RegExp('id="'+id+'"'));
 assert.doesNotMatch(html,/tabNewBrand|newBrandMode|newAddSingle|newAddLineup|newAddDetails|newbrand\.js/i);
 assert.match(html,/Existing Brand Batch/);
 assert.equal((html.match(/<script /g)||[]).length,1);
});
test("v2.0.5: New Brand backend and IPC are deleted, not only hidden",()=>{
 const main=read("src/main.js"),preload=read("src/preload.js");
 assert.doesNotMatch(main,/NewBrandService|NewBrandFolderMemory|new:|manual\.busy/);
 assert.doesNotMatch(preload,/pickNewImages|addNewPaths|planNew|generateNew|clearNew|onNewProgress|new:/);
 assert.equal(fs.existsSync(path.join(base,"src/manual")),false);
 assert.equal(fs.existsSync(path.join(base,"src/core/newBrandFolders.js")),false);
 assert.equal(fs.existsSync(path.join(base,"src/renderer/newbrand.js")),false);
 assert.equal(fs.existsSync(path.join(base,"test/newbrand-v204.test.js")),false);
});
test("v2.0.5: Existing Brand batch events and direct JPEG are preserved",()=>{
 const main=read("src/main.js"),preload=read("src/preload.js"),batch=read("src/core/batch.js");
 for(const channel of ["file:pick","batch:start","batch:stop","result:open-folder","result:open-excel"])
  assert.ok(main.includes('"'+channel+'"'),channel);
 assert.ok(preload.includes('startBatch:'));
 assert.match(batch,/DirectJpegRenderer/);
 assert.match(batch,/maxConsecutiveJpegFailures=5/);
 assert.match(batch,/maxProducts=null/);
});
