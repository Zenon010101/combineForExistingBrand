"use strict";
const fs=require("fs");
const path=require("path");
const {getUrlBuffer}=require("./fetch");
const {iframeUrl,discoverImages,standaloneHtml,decodePage}=require("./iframeHtml");
const {fetchSignature}=require("./variationClassifier");
const {existingBrandSnippet,existingBrandJpegHtml,galleryImages}=require("./existingBrand");
const {productIdFromSources,outputFileNames}=require("./outputNaming");

const {prepareSingleImage}=require("./iframeSingle");
const {readJobs,writeResults,MAX_EXCEL_CELL}=require("./excel");

function stamp(date=new Date()){
    const z=n=>String(n).padStart(2,"0");
    return `${date.getFullYear()}${z(date.getMonth()+1)}${z(date.getDate())}_${z(date.getHours())}${z(date.getMinutes())}${z(date.getSeconds())}`;
}
async function newBatchDirectory(excelFile,{testMode=false}={}){
    const parent=path.dirname(excelFile), prefix=`${testMode?"COMBINE_TEST3":"COMBINE_BATCH"}_${stamp()}`;
    for(let i=0;i<200;i++){
        const name=prefix+(i?`_${i+1}`:"");
        const final=path.join(parent,name), staging=final+".partial";
        try{
            try{await fs.promises.access(final);continue;}catch(e){if(e?.code!=="ENOENT")throw e;}
            await fs.promises.mkdir(staging);
            return {staging,final};
        }catch(e){if(e?.code!=="EEXIST")throw new Error(`Cannot save beside Excel file: ${e.message}`);}
    }
    throw new Error("Could not find an available output folder name.");
}
function cleanError(e){return String(e?.message||e||"Unknown error").slice(0,1000);}
function countSummary(results){
    return results.reduce((acc,r)=>{if(!r)return acc;
        acc[r.status.toLowerCase()]=(acc[r.status.toLowerCase()]||0)+1;
        if(r.jpegStatus==="READY")acc.jpegReady++;
        if(r.jpegStatus==="READY" && r.singleStatus?.startsWith("INCLUDED"))acc.singleIncluded++;
        if(r.htmlSingleIncluded)acc.htmlSingleIncluded++;
        return acc;
    },{ready:0,review:0,failed:0,skipped:0,jpegReady:0,singleIncluded:0,htmlSingleIncluded:0});
}
class StandaloneBatch {
    constructor({fetcher=getUrlBuffer,excelFactory=null,rendererFactory=null,
        singlePreparer=prepareSingleImage,visualInspector=fetchSignature,ocrReader=undefined}={}){
        this.fetcher=fetcher;
        this.excelFactory=excelFactory||(()=>new (require("exceljs")).Workbook());
        this.rendererFactory=rendererFactory||(()=>new (require("./directJpegRenderer").DirectJpegRenderer)());
        this.singlePreparer=singlePreparer;
        this.visualInspector=visualInspector;
        // OCR and classifier no longer control Existing Brand output.
        // Retain constructor arguments for API compatibility with tests.
        this.ocr=null;
        this.ocrReader=ocrReader===undefined?null:ocrReader;
        this.busy=false;this.cancelRequested=false;
    }
    stop(){this.cancelRequested=true;return {requested:true};}
    async generate(inputPath,{defaultLineupCount=3,maxProducts=null,maxConsecutiveJpegFailures=5,progress=()=>{}}={}){
        if(this.busy)throw new Error("A batch is already processing. Stop it or wait for completion.");
        // Kept only for compatibility with older app settings. The former
        // count-based fallback is intentionally no longer used.
        void defaultLineupCount;
        if(maxProducts!==null && (!Number.isInteger(maxProducts)||maxProducts<1||maxProducts>1000))
            throw new Error("Product test limit must be a whole number between 1 and 1000.");
        if(!Number.isInteger(maxConsecutiveJpegFailures)||maxConsecutiveJpegFailures<1||maxConsecutiveJpegFailures>100)
            throw new Error("Consecutive JPEG failure limit must be 1 to 100.");
        this.busy=true;this.cancelRequested=false;
        let renderer=null,rendererPromise=null,allocated=null;
        const emit=(data)=>{try{progress(data);}catch{ /* UI shutdown must not interrupt batch */ }};
        const renderJpeg=async(htmlFile,jpegFile,expectedImages,renderHtml,images,single)=>{
            // Direct image compositions are independent. Never reuse an Electron
            // screenshot window or depend on browser CSS geometry for JPEGs.
            if(!rendererPromise)rendererPromise=Promise.resolve().then(()=>this.rendererFactory());
            renderer=await rendererPromise;
            return renderer.capture(htmlFile,jpegFile,{expectedImages,renderHtml,images,single});
        };
        try{
            if(typeof inputPath!=="string"||!path.isAbsolute(inputPath)||path.extname(inputPath).toLowerCase()!==".xlsx")
                throw new Error("Select an existing .xlsx Excel workbook (not .xls or .xlsm).");
            const src=await fs.promises.realpath(inputPath);
            if(!(await fs.promises.stat(src)).isFile())throw new Error("Selected Excel path is not a file.");
            const workbook=await this.excelFactory();
            await workbook.xlsx.readFile(src);
            const {jobs:workbookJobs,sheets,singleCount,invalidIframeCount}=readJobs(workbook);
            // Test 3 chooses the first three valid iframe jobs. It never quietly
            // starts processing a 7,000-row workbook on file selection.
            const testMode=maxProducts!==null;
            const jobs=testMode?workbookJobs.filter(job=>!job.inputError).slice(0,maxProducts):workbookJobs;
            if(!jobs.length)throw new Error("No valid iframe rows available for a test batch.");
            // All output names are derived before the concurrent workers begin.
            // Never overwrite another product if two rows resolve to the same SKU.
            const usedIds=new Map();
            for(const job of jobs){
                if(job.inputError)continue;
                try {
                    job.outputId=productIdFromSources(job.singlePath,job.url);
                    const normalized=job.outputId.toLowerCase();
                    const first=usedIds.get(normalized);
                    if(first)throw new Error(`Duplicate output ID ${job.outputId}: already used by ${first.sheet} row ${first.row}. Unique HTML/JPEG filenames are required.`);
                    usedIds.set(normalized,{sheet:job.sheet,row:job.row});
                } catch(error) {job.inputError=cleanError(error);}
            }
            allocated=await newBatchDirectory(src,{testMode});
            const {staging,final}=allocated;
            const htmlDir=path.join(staging,"HTML_FILES"),jpegDir=path.join(staging,"JPEG_FILES");
            await fs.promises.mkdir(htmlDir);await fs.promises.mkdir(jpegDir);
            const finalHtml=path.join(final,"HTML_FILES"),finalJpeg=path.join(final,"JPEG_FILES");
            const results=new Array(jobs.length);
            let cursor=0,done=0,consecutiveJpegFailures=0,autoStopped=false;
            let stoppedReason="";
            const stats={ready:0,review:0,failed:0,skipped:0,jpegReady:0,singleIncluded:0,htmlSingleIncluded:0};
            emit({stage:"started",total:jobs.length,sourceTotal:workbookJobs.length,testMode,
                sheets:sheets.map(x=>x.name),singleCount,invalidIframeCount,done:0,folder:final});
            const worker=async()=>{
                while(true){
                    if(this.cancelRequested||autoStopped)return;
                    const i=cursor++;
                    if(i>=jobs.length)return;
                    const job=jobs[i];
                    let result={...job,status:"FAILED",jpegStatus:"NOT GENERATED",singleStatus:job.singlePath?"NOT CHECKED":"OPTIONAL / NONE",
                        code:"",warning:"",introCount:0,lineupCount:job.lineupCount??null,detailsCount:null,method:"",htmlFile:null,jpegFile:null,
                        htmlSingleIncluded:false,classificationEvidence:null};
                    try{
                        if(job.inputError)throw new Error(job.inputError);
                        const url=iframeUrl(job.raw);
                        const data=await this.fetcher(url,{maxBytes:12*1024*1024,timeoutMs:16000});
                        if(!/^(?:text\/html|text\/plain|application\/xhtml|\s*$)/i.test(data.contentType||""))
                            throw new Error("Iframe did not return an HTML page.");
                        const pageHtml=decodePage(data.buffer,data.contentType);
                        // Existing Brand is source-order only: do not OCR, classify,
                        // split, resize to 2-up, or suppress legitimate image families.
                        const parsed=discoverImages(pageHtml,url,{keepAll:true});
                        const images=galleryImages(parsed);
                        const split={images, intro:[],lineup:[],details:[],
                            introCount:0,lineupCount:null,detailsCount:null,
                            method:"EXISTING_SOURCE_ORDER_NO_SPLIT",warnings:[...parsed.warnings],
                            classificationEvidence:null};
                        // Resolve Single before creating HTML: a public HTTPS image URL is
                        // displayed at the top of BOTH outputs. A local disk path can only
                        // be displayed in the JPEG: it cannot work on a public Rakuten page.
                        let preparedSingle=null,singleProblem="";
                        let singleStatus=job.singlePath?"NOT CHECKED":"OPTIONAL / NONE";
                        if(job.singlePath){
                            try{
                                preparedSingle=await this.singlePreparer(job.singlePath,src);
                                if(!preparedSingle?.dataUri)throw new Error("Single image could not be read.");
                                singleStatus=preparedSingle.htmlUrl?"INCLUDED HTML+JPEG":"INCLUDED JPEG ONLY";
                            }catch(e){
                                singleProblem="Single source invalid: "+cleanError(e);
                                singleStatus="ERROR";
                            }
                        }
                        const htmlSingleUrl=preparedSingle?.htmlUrl||null;
                        const code=existingBrandSnippet(images,{singleUrl:htmlSingleUrl});
                        const document=standaloneHtml(code);
                        const {html:filename,jpeg:jpegname}=outputFileNames(job.outputId);
                        const htmlFile=path.join(htmlDir,filename);
                        await fs.promises.writeFile(htmlFile,document,{encoding:"utf8",flag:"wx"});
                        let jpegFile=null,jpegStatus="FAILED",jpegProblem="";
                        try{
                            // A supplied Single must not be silently omitted from JPEG.
                            if(singleProblem)throw new Error(singleProblem);
                            const single=preparedSingle?.dataUri||null;
                            const jpegDoc=existingBrandJpegHtml({images,single});
                            await renderJpeg(htmlFile,path.join(jpegDir,jpegname),
                                images.length+(single?1:0),jpegDoc,images,single);
                            jpegFile=path.join(finalJpeg,jpegname);
                            jpegStatus="READY";
                        }catch(e){
                            jpegProblem="JPEG unavailable: "+cleanError(e);
                            if(job.singlePath && !singleProblem && singleStatus==="INCLUDED HTML+JPEG")
                                singleStatus="INCLUDED HTML (JPEG FAILED)";
                        }
                        const tooLong=code.length>MAX_EXCEL_CELL;
                        const warnings=[...split.warnings];
                        if(singleProblem)warnings.push(singleProblem);
                        if(preparedSingle && !htmlSingleUrl)
                            warnings.push("Single is a local file. JPEG includes it, but public HTML cannot use a PC path. Provide a public HTTPS Single image URL to include it in HTML.");
                        if(tooLong)warnings.push(`HTML length ${code.length} exceeds Excel's ${MAX_EXCEL_CELL} character limit; complete HTML remains available from the file link.`);
                        if(jpegProblem)warnings.push(jpegProblem);
                        result={...result,code:tooLong?"":code,htmlFile:path.join(finalHtml,filename),jpegFile,
                            jpegStatus,singleStatus,htmlSingleIncluded:Boolean(htmlSingleUrl),
                            introCount:0,lineupCount:null,detailsCount:null,galleryCount:images.length,
                            method:split.method,classificationEvidence:split.classificationEvidence,
                            warning:warnings.join(" | "),
                            status:jpegStatus==="FAILED"?"FAILED":warnings.length?"REVIEW":"READY"};
                    }catch(e){result.warning=cleanError(e);}
                    results[i]=result;done++;
                    // Count only actual JPEG attempts. Invalid Excel cells do
                    // not count toward the renderer circuit breaker.
                    if(result.jpegStatus==="FAILED")consecutiveJpegFailures++;
                    else if(result.jpegStatus==="READY")consecutiveJpegFailures=0;
                    stats[result.status.toLowerCase()]++;
                    if(result.jpegStatus==="READY")stats.jpegReady++;
                    if(result.jpegStatus==="READY" && result.singleStatus?.startsWith("INCLUDED"))stats.singleIncluded++;
                    if(result.htmlSingleIncluded)stats.htmlSingleIncluded++;
                    if(!autoStopped && consecutiveJpegFailures>=maxConsecutiveJpegFailures){
                        autoStopped=true;
                        stoppedReason=`Stopped after ${consecutiveJpegFailures} consecutive JPEG failures. Run Test 3 Products and inspect BATCH_REPORT.json before another full batch.`;
                        emit({stage:"halted",message:stoppedReason,done,total:jobs.length,...stats});
                    }
                    // Expose decisions in the visible batch log, especially
                    // cut-layout/creative-prefix REVIEW cases, not only errors.
                    const route=result.method?
                        `${result.status}: Gallery ${result.galleryCount||0} image(s), original source order (${result.method})`:"";
                    const issue=result.warning?` - ${result.warning.slice(0,280)}`:"";
                    emit({stage:"row",sheet:job.sheet,row:job.row,total:jobs.length,done,...stats,
                        message:result.status!=="READY"?`${route||result.status}${issue}`.slice(0,420):
                            (done===1||done%25===0||done===jobs.length?route:"")});
                }
            };
            await Promise.all(Array.from({length:Math.min(3,jobs.length)},worker));
            for(let i=0;i<jobs.length;i++)if(!results[i])results[i]={...jobs[i],status:"SKIPPED",code:"",
                jpegStatus:"NOT GENERATED",singleStatus:"NOT CHECKED",
                warning:autoStopped?stoppedReason:"Stopped before processing this row."};
            writeResults(workbook,sheets,results);
            const excelName=path.basename(src).replace(/\.xlsx$/i,"")+"_COMBINE_RESULTS.xlsx";
            const resultWorkbook=path.join(staging,excelName);
            await workbook.xlsx.writeFile(resultWorkbook);
            const counts=countSummary(results);
            const report={generatedAt:new Date().toISOString(),version:"2.0.3",sourceExcel:src,
                resultsExcel:path.join(final,excelName),outputFolder:final,total:jobs.length,
                sourceTotal:workbookJobs.length,testMode,processed:done,sheets:sheets.map(s=>s.name),
                cancelled:this.cancelRequested,autoStopped,stoppedReason,
                jpegRenderer:"DIRECT_SHARP_TWO_COLUMN",...counts,htmlFiles:results.filter(r=>r.htmlFile).length,
                htmlLayout:"780px: full-bleed Single at top, 15px gap, then two fixed 386px gallery columns",
                jpegLayout:"600px: full-bleed Single at top, 15px gap, then two fixed 293px gallery columns; images never stretched or upscaled",
                classificationPolicy:"Existing Brand: no automatic classification, no DETAILS heading, fixed two-column gallery and no full-width image fallback",
                ocrMode:"Disabled for Existing Brand",
                excelRowsWithSingleSource:singleCount,invalidIframeCount,photoshopRequired:false,
                sourceImageFilesDownloaded:true,sourceImageFilesRetained:false,
                rows:results.map(r=>({sheet:r.sheet,row:r.row,status:r.status,jpegStatus:r.jpegStatus,
                    singleStatus:r.singleStatus,htmlSingleIncluded:Boolean(r.htmlSingleIncluded),
                    productId:r.outputId||null,introCount:0,lineupCount:null,detailsCount:null,galleryCount:r.galleryCount||0,
                    method:r.method,classificationEvidence:r.classificationEvidence,
                    warning:r.warning}))};
            await fs.promises.writeFile(path.join(staging,"BATCH_REPORT.json"),JSON.stringify(report,null,2),"utf8");
            await fs.promises.rename(staging,final);
            allocated=null;
            emit({stage:"complete",...report,done});
            return report;
        }finally{
            try{await this.ocr?.close?.();}catch{}
            try{await renderer?.close?.();}catch{}
            this.busy=false;
            // On catastrophic failures leave the .partial folder for inspection/recovery.
        }
    }
}
module.exports={StandaloneBatch,stamp,newBatchDirectory};
