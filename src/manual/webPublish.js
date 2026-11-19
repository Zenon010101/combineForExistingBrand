"use strict";
const fs=require("fs");
const path=require("path");
const sharp=require("sharp");
const {newBrandHtml}=require("./directOutput");

// Save a matching JPEG/HTML set as a new, collision-free version. Never
// overwrite or delete previously generated customer content.
async function chooseStem(folder,stem) {
    const existing=new Set((await fs.promises.readdir(folder)).map(name=>name.toLowerCase()));
    for(let n=1;n<=999;n++) {
        const candidate=n===1?stem:`${stem}_v${n}`;
        if(![".jpg",".html",".psd",".psb","_01.jpg"].some(ext=>existing.has(`${candidate}${ext}`.toLowerCase())))
            return candidate;
    }
    throw new Error("Too many output versions in the chosen folder.");
}
function jpegFileName(stem,count,index) {
    return count===1?`${stem}.jpg`:`${stem}_${String(index+1).padStart(2,"0")}.jpg`;
}
async function verifiedCopy(src,target){
    await fs.promises.copyFile(src,target,fs.constants.COPYFILE_EXCL);
    const [input,output]=await Promise.all([fs.promises.stat(src),fs.promises.stat(target)]);
    if(!output.isFile()||!output.size||input.size!==output.size) throw new Error(`Incomplete output: ${path.basename(target)}`);
}
async function publishWeb(preparedParts,folder,stem,progress=()=>{}){
    if(!preparedParts?.length)throw new Error("No staged JPEG files were generated.");
    const created=[];
    try {
        const files=[];
        let totalHeight=0;
        for(let i=0;i<preparedParts.length;i++){
            const meta=await sharp(preparedParts[i].path).metadata();
            if(meta.format!=="jpeg"||meta.width!==600||meta.height!==preparedParts[i].height)
                throw new Error(`Invalid JPEG part ${i+1}; HTML was not published.`);
            totalHeight+=meta.height;
            const target=path.join(folder,jpegFileName(stem,preparedParts.length,i));
            await verifiedCopy(preparedParts[i].path,target);
            created.push(target);files.push(target);
            progress({stage:"publishing",message:`Saved JPEG: ${path.basename(target)}`});
        }
        const htmlPath=path.join(folder,`${stem}.html`);
        const html=newBrandHtml(stem,preparedParts);
        const handle=await fs.promises.open(htmlPath,"wx");
        created.push(htmlPath);
        try{await handle.writeFile(html,"utf8");}finally{await handle.close();}
        const verify=await fs.promises.readFile(htmlPath,"utf8");
        for(const f of files)if(!verify.includes(`src="${path.basename(f)}"`))throw new Error("HTML does not reference all generated JPEG parts.");
        progress({stage:"publishing",message:`Saved HTML: ${path.basename(htmlPath)}`});
        return {jpegPath:files[0],jpegPaths:files,htmlPath,outputPaths:[...files,htmlPath],height:totalHeight};
    }catch(error){
        for(const f of created.reverse())await fs.promises.rm(f,{force:true}).catch(()=>{});
        throw new Error(`JPEG/HTML publish failed: ${error.message}`);
    }
}
async function publishPSD(psdPath,folder,stem,format){
    if(!["psd","psb"].includes(format))throw new Error("Invalid Photoshop format.");
    const target=path.join(folder,`${stem}.${format}`);
    const stat=await fs.promises.stat(psdPath);
    if(stat.size<1000)throw new Error("Photoshop document is too small.");
    try{await verifiedCopy(psdPath,target);}
    catch(e){await fs.promises.rm(target,{force:true}).catch(()=>{});throw e;}
    return target;
}
module.exports={chooseStem,jpegFileName,publishWeb,publishPSD};
