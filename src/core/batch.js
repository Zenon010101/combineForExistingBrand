"use strict";
const fs=require('fs');
const path=require('path');
const {getUrlBuffer}=require('./fetch');
const {iframeUrl,discoverImages,decodePage}=require('./iframeHtml');
const {fetchSignature}=require('./variationClassifier');
const {galleryImages}=require('./existingBrand');
const {buildExistingCombineOutput}=require('./combineOutput');
const {productIdFromSources,outputFileNames}=require('./outputNaming');
const {prepareSingleImage}=require('./iframeSingle');
const {readJobs,writeResults,MAX_EXCEL_CELL}=require('./excel');
const {writeErrorWorkbook}=require('./errorWorkbook');

const JPEG_HEIGHT_REVIEW_PX=3800;
function stamp(date=new Date()){
    const z=n=>String(n).padStart(2,'0');
    return `${date.getFullYear()}${z(date.getMonth()+1)}${z(date.getDate())}_${z(date.getHours())}${z(date.getMinutes())}${z(date.getSeconds())}`;
}
async function newBatchDirectory(excelFile,{testMode=false}={}){
    const parent=path.dirname(excelFile),prefix=`${testMode?'COMBINE_TEST3':'COMBINE_BATCH'}_${stamp()}`;
    for(let i=0;i<200;i++){
        const final=path.join(parent,prefix+(i?`_${i+1}`:'')),staging=final+'.partial';
        try{
            try{await fs.promises.access(final);continue;}catch(e){if(e?.code!=='ENOENT')throw e;}
            await fs.promises.mkdir(staging);
            return {staging,final};
        }catch(e){if(e?.code!=='EEXIST')throw new Error(`Cannot save beside Excel file: ${e.message}`);}
    }
    throw new Error('Could not find an available output folder name.');
}
function cleanError(e){return String(e?.message||e||'Unknown error').slice(0,1000);}
function addIssue(result,code,detail='',url=''){
    if(!Array.isArray(result.issues))result.issues=[];
    result.issues.push({code,detail:String(detail||'').slice(0,500),url:String(url||'').slice(0,2000)});
}
function countSummary(results){
    return results.reduce((acc,r)=>{
        if(!r)return acc;
        acc[r.status.toLowerCase()]=(acc[r.status.toLowerCase()]||0)+1;
        if(r.jpegStatus==='READY')acc.jpegReady++;
        if(r.jpegStatus==='READY' && r.singleStatus?.startsWith('INCLUDED'))acc.singleIncluded++;
        if(r.htmlSingleIncluded)acc.htmlSingleIncluded++;
        return acc;
    },{ready:0,review:0,failed:0,skipped:0,jpegReady:0,singleIncluded:0,htmlSingleIncluded:0});
}
class StandaloneBatch {
    constructor({fetcher=getUrlBuffer,excelFactory=null,rendererFactory=null,
        singlePreparer=prepareSingleImage,visualInspector=fetchSignature,ocrReader=undefined}={}){
        this.fetcher=fetcher;
        this.excelFactory=excelFactory||(()=>new (require('exceljs')).Workbook());
        this.rendererFactory=rendererFactory||(()=>new (require('./directJpegRenderer').DirectJpegRenderer)());
        this.singlePreparer=singlePreparer;
        this.visualInspector=visualInspector;
        this.ocr=null;
        this.ocrReader=ocrReader===undefined?null:ocrReader;
        this.busy=false;this.cancelRequested=false;
    }
    stop(){this.cancelRequested=true;return {requested:true};}
    async generate(inputPath,{defaultLineupCount=3,maxProducts=null,maxConsecutiveJpegFailures=5,
        maxJpegHeight=JPEG_HEIGHT_REVIEW_PX,progress=()=>{}}={}){
        if(this.busy)throw new Error('A batch is already processing. Stop it or wait for completion.');
        void defaultLineupCount;
        if(maxProducts!==null&&(!Number.isInteger(maxProducts)||maxProducts<1||maxProducts>1000))
            throw new Error('Product test limit must be a whole number between 1 and 1000.');
        if(!Number.isInteger(maxConsecutiveJpegFailures)||maxConsecutiveJpegFailures<1||maxConsecutiveJpegFailures>100)
            throw new Error('Consecutive JPEG failure limit must be 1 to 100.');
        if(!Number.isInteger(maxJpegHeight)||maxJpegHeight<500||maxJpegHeight>52000)
            throw new Error('JPEG review height must be between 500 and 52000 pixels.');
        this.busy=true;this.cancelRequested=false;
        let renderer=null,rendererPromise=null,allocated=null;
        const emit=data=>{try{progress(data);}catch{ /* UI shutdown must not interrupt a batch */ }};
        const getRenderer=async()=>{
            if(!rendererPromise)rendererPromise=Promise.resolve().then(()=>this.rendererFactory());
            renderer=await rendererPromise;
            return renderer;
        };
        try{
            if(typeof inputPath!=='string'||!path.isAbsolute(inputPath)||path.extname(inputPath).toLowerCase()!=='.xlsx')
                throw new Error('Select an existing .xlsx Excel workbook (not .xls or .xlsm).');
            const src=await fs.promises.realpath(inputPath);
            if(!(await fs.promises.stat(src)).isFile())throw new Error('Selected Excel path is not a file.');
            const workbook=await this.excelFactory();
            await workbook.xlsx.readFile(src);
            const {jobs:workbookJobs,sheets,singleCount,invalidIframeCount}=readJobs(workbook);
            const testMode=maxProducts!==null;
            const jobs=testMode?workbookJobs.filter(job=>!job.inputError).slice(0,maxProducts):workbookJobs;
            if(!jobs.length)throw new Error('No valid iframe rows available for a test batch.');
            // Derive all output names before concurrent processing so different
            // sheets and products cannot overwrite each other's JPEG/HTML.
            const usedIds=new Map();
            for(const job of jobs){
                try{
                    job.outputId=productIdFromSources(job.singlePath,job.url||'');
                    const normalized=job.outputId.toLowerCase(),first=usedIds.get(normalized);
                    if(first)throw new Error(`Duplicate output ID ${job.outputId}: already used by ${first.sheet} row ${first.row}. Unique HTML/JPEG filenames are required.`);
                    usedIds.set(normalized,{sheet:job.sheet,row:job.row});
                }catch(error){
                    // Preserve the original input error, but avoid fabricating a
                    // filename for invalid rows that have no trustworthy SKU.
                    job.outputError=cleanError(error);
                }
            }
            allocated=await newBatchDirectory(src,{testMode});
            const {staging,final}=allocated;
            const passed=path.join(staging,'PASSED'),errors=path.join(staging,'ERRORS');
            for(const dir of [passed,errors])for(const child of ['JPEG_FILES','HTML_FILES'])
                await fs.promises.mkdir(path.join(dir,child),{recursive:true});
            const destination=(name,kind,filename)=>path.join(final,name,kind,filename);
            const results=new Array(jobs.length);
            let cursor=0,done=0,consecutiveJpegFailures=0,autoStopped=false,stoppedReason='';
            const stats={ready:0,review:0,failed:0,skipped:0,jpegReady:0,singleIncluded:0,htmlSingleIncluded:0};
            emit({stage:'started',total:jobs.length,sourceTotal:workbookJobs.length,testMode,
                sheets:sheets.map(x=>x.name),singleCount,invalidIframeCount,done:0,folder:final});
            const worker=async()=>{
                while(true){
                    if(this.cancelRequested||autoStopped)return;
                    const i=cursor++;
                    if(i>=jobs.length)return;
                    const job=jobs[i];
                    const result={...job,status:'FAILED',jpegStatus:'NOT GENERATED',
                        singleStatus:job.singlePath?'NOT CHECKED':'OPTIONAL / NONE',code:'',warning:'',
                        issues:[],brokenImages:[],jpegHeight:null,galleryCount:0,introCount:0,
                        lineupCount:job.lineupCount??null,detailsCount:null,
                        method:'',htmlFile:null,jpegFile:null,htmlSingleIncluded:false,
                        combineLayout:null,combineGalleryRows:0,htmlPreviewOnly:false,
                        classificationEvidence:null};
                    let attemptedJpeg=false;
                    try{
                        if(job.outputError){
                            addIssue(result,'OUTPUT_ID_ERROR',job.outputError);
                            throw new Error('OUTPUT_ID_BLOCKED');
                        }
                        // Iframe and Single are independent. If either is broken,
                        // build a partial result from whatever verified images remain.
                        let images=[],parsedWarnings=[];
                        if(job.inputError){
                            addIssue(result,'IFRAME_ERROR',job.inputError,job.url||'');
                        }else{
                            try{
                                const url=iframeUrl(job.raw);
                                const data=await this.fetcher(url,{maxBytes:12*1024*1024,timeoutMs:16000});
                                if(!/^(?:text\/html|text\/plain|application\/xhtml|\s*$)/i.test(data.contentType||''))
                                    throw new Error('Iframe did not return an HTML page.');
                                const parsed=discoverImages(decodePage(data.buffer,data.contentType),url,{keepAll:true});
                                images=galleryImages(parsed);parsedWarnings=[...parsed.warnings];
                                result.method='EXISTING_SOURCE_ORDER_NO_SPLIT';
                            }catch(error){addIssue(result,'IFRAME_ERROR',cleanError(error),job.url||'');}
                        }
                        for(const warning of parsedWarnings)addIssue(result,'IFRAME_REVIEW',warning,job.url||'');
                        const originalImageCount=images.length;
                        let preparedSingle=null;
                        if(job.singlePath){
                            try{
                                preparedSingle=await this.singlePreparer(job.singlePath,src);
                                if(!preparedSingle?.dataUri)throw new Error('Single image could not be read.');
                                result.singleStatus=preparedSingle.htmlUrl?'INCLUDED HTML+JPEG':'INCLUDED JPEG + PREVIEW HTML';
                            }catch(error){
                                result.singleStatus='ERROR';
                                addIssue(result,'SINGLE_BROKEN','Single source invalid: '+cleanError(error),job.singlePath);
                            }
                        }
                        let preparedAssets=null;
                        if(images.length||preparedSingle){
                            const engine=await getRenderer();
                            if(typeof engine.prepareAssets==='function'){
                                preparedAssets=await engine.prepareAssets({images,single:preparedSingle?.dataUri||null});
                                for(const bad of preparedAssets.failedGallery||[]){
                                    addIssue(result,'DETAIL_IMAGE_BROKEN',bad.error,bad.url);
                                    result.brokenImages.push(bad.url);
                                }
                                images=(preparedAssets.galleryEntries||[]).map(x=>x.url);
                                if(preparedSingle&&preparedAssets.singleError){
                                    addIssue(result,'SINGLE_BROKEN',preparedAssets.singleError,job.singlePath);
                                    preparedSingle=null;result.singleStatus='ERROR';
                                } else if(preparedSingle&&preparedAssets.singleBlank){
                                    addIssue(result,'SINGLE_BLANK_REVIEW','Single appears nearly all white; verify the product is visible.',job.singlePath);
                                }
                            }
                        }
                        result.galleryCount=images.length;
                        const single=preparedSingle?.dataUri||null;
                        const singleUrl=preparedSingle?.htmlUrl||null;
                        result.htmlSingleIncluded=Boolean(single);
                        if(preparedSingle&&!singleUrl)
                            addIssue(result,'SINGLE_HTML_MISSING','Single is local: generated HTML is a review-only Combine preview (inline Single); it is not publishable in Rakuten. Upload the Single and replace it with a public URL.',job.singlePath);
                        if(!images.length&&!single){
                            addIssue(result,'NO_USABLE_IMAGES',`No valid images remained (${originalImageCount} gallery URL(s) detected).`);
                        } else if(!job.outputId){
                            addIssue(result,'OUTPUT_ID_ERROR','Cannot derive a safe product ID from the original iframe or Single URL.');
                        } else {
                            const {html:htmlName,jpeg:jpegName}=outputFileNames(job.outputId);
                            // Build ONE immutable Combine sequence for both outputs.
                            // ERRORS only changes the destination, never the layout.
                            const combine=buildExistingCombineOutput({images,single,singleUrl});
                            result.combineLayout=combine.layout;
                            result.combineGalleryRows=combine.galleryRows;
                            result.htmlPreviewOnly=!combine.htmlPublishable;
                            // Generate into ERRORS first, then move both to PASSED
                            // only after successful JPEG validation and zero issues.
                            const htmlLocal=path.join(errors,'HTML_FILES',htmlName);
                            await fs.promises.writeFile(htmlLocal,combine.htmlDocument,{encoding:'utf8',flag:'wx'});
                            result.htmlFile=destination('ERRORS','HTML_FILES',htmlName);
                            if(combine.htmlPublishable){
                                if(combine.htmlSnippet.length>MAX_EXCEL_CELL)
                                    addIssue(result,'HTML_CELL_TOO_LONG',`HTML length ${combine.htmlSnippet.length} exceeds Excel's ${MAX_EXCEL_CELL} character limit; the HTML file is preserved.`);
                                else result.code=combine.htmlSnippet;
                            }
                            try{
                                attemptedJpeg=true;
                                const engine=await getRenderer();
                                const jpegLocal=path.join(errors,'JPEG_FILES',jpegName);
                                const meta=await engine.capture(htmlLocal,jpegLocal,{
                                    expectedImages:combine.expectedImages,renderHtml:combine.jpegHtml,
                                    images:combine.gallery,single:combine.single,preparedAssets
                                });
                                if(!(await fs.promises.stat(jpegLocal)).isFile())
                                    throw new Error('Renderer returned without saving a JPEG file.');
                                result.jpegStatus='READY';
                                result.jpegFile=destination('ERRORS','JPEG_FILES',jpegName);
                                result.jpegHeight=Number.isInteger(meta?.height)?meta.height:null;
                                if(Number.isInteger(meta?.galleryCount)&&meta.galleryCount!==combine.gallery.length)
                                    addIssue(result,'COMBINE_LAYOUT_MISMATCH',`JPEG compositor reported ${meta.galleryCount} gallery images but the validated Combine uses ${combine.gallery.length}.`);
                                if(result.jpegHeight!==null&&result.jpegHeight>maxJpegHeight)
                                    addIssue(result,'HEIGHT_OVER_3800',`Generated JPEG height ${result.jpegHeight}px exceeds ${maxJpegHeight}px. Not cropped.`);
                                if(preparedAssets&&single&&!(meta?.singleHeight>0))
                                    addIssue(result,'SINGLE_MISSING','Single was validated but was not included in the JPEG compositor.',job.singlePath);
                            }catch(error){
                                result.jpegStatus='FAILED';
                                addIssue(result,'JPEG_FAILED','JPEG unavailable: '+cleanError(error));
                                if(preparedSingle&&result.singleStatus==='INCLUDED HTML+JPEG')
                                    result.singleStatus='INCLUDED HTML (JPEG FAILED)';
                            }
                        }
                    }catch(error){
                        if(error?.message!=='OUTPUT_ID_BLOCKED')addIssue(result,'PROCESSING_ERROR',cleanError(error));
                    }
                    // A partial-but-usable JPEG is REVIEW, not FAILED. A JPEG
                    // that could not be generated remains FAILED, even if HTML exists.
                    if(result.jpegStatus==='READY'&&result.htmlFile&&result.issues.length===0){
                        const {html:htmlName,jpeg:jpegName}=outputFileNames(job.outputId);
                        try{
                            await fs.promises.rename(path.join(errors,'HTML_FILES',htmlName),path.join(passed,'HTML_FILES',htmlName));
                            await fs.promises.rename(path.join(errors,'JPEG_FILES',jpegName),path.join(passed,'JPEG_FILES',jpegName));
                            result.htmlFile=destination('PASSED','HTML_FILES',htmlName);
                            result.jpegFile=destination('PASSED','JPEG_FILES',jpegName);
                            result.status='READY';
                        }catch(error){
                            addIssue(result,'OUTPUT_MOVE_FAILED',cleanError(error));
                            result.status='FAILED';
                            // Preserve any files that did move, even on partial errors.
                            for(const [field,kind,name] of [['htmlFile','HTML_FILES',htmlName],['jpegFile','JPEG_FILES',jpegName]]){
                                const target=path.join(passed,kind,name);
                                if(fs.existsSync(target))result[field]=destination('PASSED',kind,name);
                            }
                        }
                    }else result.status=result.jpegStatus==='READY'?'REVIEW':'FAILED';
                    result.warning=result.issues.map(x=>x.url?`${x.code}: ${x.detail} [${x.url}]`:`${x.code}: ${x.detail}`).join(' | ').slice(0,MAX_EXCEL_CELL);
                    results[i]=result;done++;
                    // Broken iframe cells or warnings never count against the
                    // JPEG-renderer circuit breaker unless capture actually ran.
                    if(attemptedJpeg){
                        if(result.jpegStatus==='FAILED')consecutiveJpegFailures++;
                        else consecutiveJpegFailures=0;
                    }
                    stats[result.status.toLowerCase()]++;
                    if(result.jpegStatus==='READY')stats.jpegReady++;
                    if(result.jpegStatus==='READY'&&result.singleStatus?.startsWith('INCLUDED'))stats.singleIncluded++;
                    if(result.htmlSingleIncluded)stats.htmlSingleIncluded++;
                    if(!autoStopped&&consecutiveJpegFailures>=maxConsecutiveJpegFailures){
                        autoStopped=true;
                        stoppedReason=`Stopped after ${consecutiveJpegFailures} consecutive JPEG failures. Run Test 3 Products and inspect BATCH_REPORT.json before another full batch.`;
                        emit({stage:'halted',message:stoppedReason,done,total:jobs.length,...stats});
                    }
                    const route=result.method?
                        `${result.status}: Gallery ${result.galleryCount||0} image(s), original source order (${result.method})`:result.status;
                    const issue=result.warning?` - ${result.warning.slice(0,280)}`:'';
                    emit({stage:'row',sheet:job.sheet,row:job.row,total:jobs.length,done,...stats,
                        message:result.status!=='READY'?`${route}${issue}`.slice(0,420):
                            (done===1||done%25===0||done===jobs.length?route:'')});
                }
            };
            await Promise.all(Array.from({length:Math.min(3,jobs.length)},worker));
            for(let i=0;i<jobs.length;i++)if(!results[i]){
                const reason=autoStopped?stoppedReason:'Stopped before processing this row.';
                results[i]={...jobs[i],status:'SKIPPED',code:'',jpegStatus:'NOT GENERATED',
                    singleStatus:'NOT CHECKED',warning:reason,issues:[{code:'SKIPPED',detail:reason,url:''}],
                    htmlFile:null,jpegFile:null,jpegHeight:null};
            }
            writeResults(workbook,sheets,results);
            const excelName=path.basename(src).replace(/\.xlsx$/i,'')+'_COMBINE_RESULTS.xlsx';
            await workbook.xlsx.writeFile(path.join(staging,excelName));
            const errorsName='COMBINE_ERRORS_ONLY.xlsx';
            const errorsSummary=await writeErrorWorkbook(workbook,results,path.join(errors,errorsName));
            const counts=countSummary(results);
            const report={generatedAt:new Date().toISOString(),version:'2.0.7',sourceExcel:src,
                resultsExcel:path.join(final,excelName),errorsExcel:path.join(final,'ERRORS',errorsName),
                outputFolder:final,passedFolder:path.join(final,'PASSED'),errorsFolder:path.join(final,'ERRORS'),
                total:jobs.length,sourceTotal:workbookJobs.length,testMode,processed:done,
                sheets:sheets.map(s=>s.name),cancelled:this.cancelRequested,autoStopped,stoppedReason,
                jpegRenderer:'DIRECT_SHARP_TWO_COLUMN',combineLayout:'SINGLE_TOP_THEN_TWO_COLUMNS',
                maxJpegHeight,errorsCount:errorsSummary.rows,
                errorsByType:errorsSummary.byType,...counts,
                htmlFiles:results.filter(r=>r.htmlFile).length,
                htmlLayout:'780px: full-bleed Single at top, 15px gap, then two fixed 386px gallery columns',
                jpegLayout:'600px: full-bleed Single at top, 15px gap, then two fixed 293px gallery columns; images never stretched or upscaled',
                classificationPolicy:'Existing Brand: preserve original source order; no Line Up/Details classification',
                ocrMode:'Disabled for Existing Brand',excelRowsWithSingleSource:singleCount,
                invalidIframeCount,photoshopRequired:false,sourceImageFilesDownloaded:true,
                sourceImageFilesRetained:false,
                rows:results.map(r=>({sheet:r.sheet,row:r.row,status:r.status,jpegStatus:r.jpegStatus,
                    singleStatus:r.singleStatus,htmlSingleIncluded:Boolean(r.htmlSingleIncluded),
                    combineLayout:r.combineLayout||null,combineGalleryRows:r.combineGalleryRows||0,
                    htmlPreviewOnly:Boolean(r.htmlPreviewOnly),productId:r.outputId||null,iframeUrl:r.url||null,iframeSource:r.raw,
                    singleUrl:r.singlePath||null,htmlFile:r.htmlFile,jpegFile:r.jpegFile,
                    jpegHeight:r.jpegHeight??null,issueCodes:(r.issues||[]).map(x=>x.code),
                    issues:r.issues||[],introCount:0,lineupCount:r.lineupCount??null,
                    detailsCount:null,galleryCount:r.galleryCount||0,method:r.method,
                    warning:r.warning}))};
            await fs.promises.writeFile(path.join(staging,'BATCH_REPORT.json'),JSON.stringify(report,null,2),'utf8');
            await fs.promises.rename(staging,final);
            allocated=null;
            emit({stage:'complete',...report,done});
            return report;
        }finally{
            try{await this.ocr?.close?.();}catch{}
            try{await renderer?.close?.();}catch{}
            this.busy=false;
        }
    }
}
module.exports={StandaloneBatch,stamp,newBatchDirectory,JPEG_HEIGHT_REVIEW_PX,addIssue,countSummary};
