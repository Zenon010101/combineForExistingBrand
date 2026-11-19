"use strict";
const fs=require("fs"),path=require("path"),os=require("os");
const sharp=require("sharp");
const {inspectBatch,PHOTOSHOP,visibleBounds}=require("./assets");
const {buildCombineLayout}=require("./planner");
const {prepareCombineLayers,createPhotoshopFromPrepared}=require("./photoshop");
const {renderNewBrandJPEG}=require("./directOutput");
const {chooseStem,publishWeb,publishPSD}=require("./webPublish");
const {familyRegex}=require("./publish");

class NewBrandService{
    constructor({inspector=inspectBatch,preparer=prepareCombineLayers,renderer=renderNewBrandJPEG,
        webPublisher=publishWeb,photoshopBuilder=createPhotoshopFromPrepared,psdPublisher=publishPSD,stemChooser=chooseStem}={}){
        this.images=new Map();this.outputFolder=null;this.lastOutput=null;
        this.busy=false;this.inspector=inspector;this.preparer=preparer;this.renderer=renderer;
        this.webPublisher=webPublisher;this.photoshopBuilder=photoshopBuilder;
        this.psdPublisher=psdPublisher;this.stemChooser=stemChooser;
    }
    status(){return {busy:this.busy,outputFolder:this.outputFolder,lastOutput:this.lastOutput,
        count:this.images.size};}
    async importPaths(paths){
        if(this.busy)throw new Error("Generation is running.");
        const report=await this.inspector(paths);
        const images=[];
        for(const img of report.images){
            const key=img.path.toLowerCase();this.images.set(key,img);
            let thumbnail="",thumbnailFull="";
            if(!PHOTOSHOP.has(path.extname(img.path).toLowerCase())){
                try{
                    const full=await sharp(img.path,{animated:false,limitInputPixels:400000000}).rotate()
                        .resize({width:210,height:210,fit:"inside",withoutEnlargement:true})
                        .jpeg({quality:73}).toBuffer();
                    thumbnailFull="data:image/jpeg;base64,"+full.toString("base64");
                    thumbnail=thumbnailFull;
                    if(img.visibleMode!=="full"){
                        const region=await visibleBounds(img.path);
                        const trimmed=await sharp(img.path,{animated:false,limitInputPixels:400000000}).rotate()
                            .extract({left:region.left,top:region.top,width:region.width,height:region.height})
                            .resize({width:210,height:210,fit:"inside",withoutEnlargement:true})
                            .jpeg({quality:73}).toBuffer();
                        thumbnail="data:image/jpeg;base64,"+trimmed.toString("base64");
                    }
                }catch{ /* Unusual codecs may not preview; original remains usable */ }
            }
            images.push({...img,thumbnail,thumbnailFull});
        }
        return {images,failed:report.failed};
    }
    getImage(file){
        const found=this.images.get(String(file||"").toLowerCase());
        if(!found)throw new Error("Image is not in the current session. Upload it first.");
        return found;
    }
    setOutputFolder(folder){
        if(this.busy)throw new Error("Generation is running.");
        if(typeof folder!=="string"||!path.isAbsolute(folder))throw new Error("Select a real local folder.");
        this.outputFolder=folder;return this.status();
    }
    clearOutputFolder(){
        if(this.busy)throw new Error("Generation is running.");
        this.outputFolder=null;return this.status();
    }
    reset(){
        if(this.busy)throw new Error("Generation is running.");
        this.images.clear();this.lastOutput=null;return this.status();
    }
    plan(payload){
        if(!payload||typeof payload!=="object")throw new Error("Invalid New Brand request.");
        const single=payload.singlePath?this.getImage(payload.singlePath):null;
        const lineup=(payload.lineup||[]).map(item=>{
            if(!item||typeof item!=="object")throw new Error("Invalid Line Up image.");
            const src=this.getImage(item.path);
            const mode=item.rowMode||"single";
            return {...src,rowMode:mode, preserveCanvas:mode==="vertical",
                colorName:String(item.colorName||"").trim(),
                colorNameRight:String(item.colorNameRight||"").trim(),
                captionTopY:item.captionTopY,captionBottomY:item.captionBottomY};
        });
        const details=(payload.details||[]).map(item=>this.getImage(typeof item==="string"?item:item.path));
        if(lineup.length+details.length>250)throw new Error("Maximum 250 Line Up and Detail images.");
        for(const group of [lineup,details]){
            const seen=new Set();
            for(const entry of group){
                if(seen.has(entry.path.toLowerCase()))throw new Error(`Duplicate image in one section: ${entry.name}`);
                seen.add(entry.path.toLowerCase());
            }
        }
        return buildCombineLayout({single,lineup,details,outputName:payload.outputName||"COMBINE"});
    }
    async generate(payload,progress=()=>{}){
        if(this.busy)throw new Error("New Brand generation is running.");
        const layout=this.plan(payload);
        if(!layout.sourceCount)throw new Error("Upload a Single, Line Up, or Details image before generating.");
        if(!this.outputFolder)throw new Error("Choose an output folder.");
        const resolved=await fs.promises.realpath(this.outputFolder);
        if(!(await fs.promises.stat(resolved)).isDirectory())throw new Error("Output path must be a directory.");
        const files=[...(layout.single?[layout.single]:[]),...layout.lineup,...layout.details];
        for(const entry of files){
            const stat=await fs.promises.lstat(entry.path);
            if(!stat.isFile()||stat.isSymbolicLink()||stat.size!==entry.bytes||stat.mtimeMs!==entry.mtimeMs)
                throw new Error(`Source image changed since upload: ${entry.name}. Upload it again.`);
            if(path.dirname(entry.path).toLowerCase()===resolved.toLowerCase()&&familyRegex(layout.name).test(entry.name))
                throw new Error(`Output would overwrite a source image: ${entry.name}. Change output name.`);
        }
        this.busy=true;
        let stage=null;
        try{
            stage=await fs.promises.mkdtemp(path.join(os.tmpdir(),"rakuten-new-brand-"));
            progress({stage:"planning",message:`New Brand: 600 x ${layout.height}px; ${files.length} image(s). Preparing JPEG + HTML...`});
            const prepared=await this.preparer(layout,stage,progress);
            const jpegParts=await this.renderer(prepared,stage,progress);
            const expected=jpegParts.reduce((sum,part)=>sum+part.height,0);
            if(expected!==layout.height)throw new Error("JPEG parts do not cover the whole layout.");
            const stem=await this.stemChooser(resolved,layout.name);
            const web=await this.webPublisher(jpegParts,resolved,stem,progress);
            this.lastOutput=web.htmlPath;
            progress({stage:"done",message:`JPEG and HTML saved successfully: ${stem}.html`});
            let psdPath=null,psdWarning=null;
            if(payload.exportPsd===true){
                try{
                    const built=await this.photoshopBuilder(prepared,stage,progress);
                    psdPath=await this.psdPublisher(built.psdPath,resolved,stem,layout.format);
                    progress({stage:"photoshop",message:`Layered Photoshop document saved: ${path.basename(psdPath)}`});
                }catch(error){
                    psdWarning=`PSD/PSB export failed: ${error.message}. JPEG and HTML have already been saved.`;
                    progress({stage:"warning",message:psdWarning});
                }
            }
            progress({stage:"complete",message:`DONE: ${path.basename(web.htmlPath)} + ${web.jpegPaths.length} JPEG(s)${psdPath?" + layered Photoshop file":""}.`});
            return {...web,outputPath:web.htmlPath,psdPath,psdWarning,
                width:layout.width,height:layout.height,sourceCount:files.length,
                singleIncluded:Boolean(layout.single),lineupCount:layout.lineup.length,
                detailCount:layout.details.length,format:layout.format};
        }catch(error){
            progress({stage:"failed",message:`GENERATION FAILED: ${error.message}`});
            throw error;
        }finally{
            if(stage)await fs.promises.rm(stage,{recursive:true,force:true}).catch(()=>{});
            this.busy=false;
        }
    }

}
module.exports={NewBrandService};
