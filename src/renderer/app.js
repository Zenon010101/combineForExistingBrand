"use strict";
(()=>{
    const api=window.combine,$=id=>document.getElementById(id);
    let busy=false,done=0,total=0,selectedWorkbook="";
    const logNode=$("log");
    function log(message){
        const line=`[${new Date().toLocaleTimeString()}] ${String(message)}\n`;
        logNode.textContent=(logNode.textContent==="No batch run yet."?"":logNode.textContent)+line;
        if(logNode.textContent.length>30000)logNode.textContent=logNode.textContent.slice(-26000);
        logNode.scrollTop=logNode.scrollHeight;
    }
    function state(value){
        busy=value;document.body.classList.toggle("working",busy);
        $("browse").disabled=busy;$("stop").disabled=!busy;$("clear").disabled=busy;
        $("testThree").disabled=busy||!selectedWorkbook;
        $("runFull").disabled=busy||!selectedWorkbook;
    }
    function setProgress(payload){
        if(!payload)return;
        if(payload.stage==="started"){
            total=payload.total;done=0;
            $("stage").textContent=payload.testMode?"Testing 3 products — saving beside Excel":"Processing full batch — saving beside Excel";
            log(`${payload.testMode?"TEST":"FULL BATCH"}: ${total} selected product(s) from ${payload.sourceTotal} source row(s).`);
            if(payload.invalidIframeCount)log(`SOURCE WARNING: ${payload.invalidIframeCount} source row(s) contain invalid iframe values such as #VALUE!. Full batch marks those rows FAILED.`);
        }
        if(payload.stage==="halted"){
            log(`AUTOMATIC STOP: ${payload.message}`);
            $("stage").textContent="Stopped: repeated JPEG failures";
        }
        if(payload.stage==="row"||payload.stage==="complete"){
            total=payload.total;done=payload.done;
            $("statReady").textContent=payload.ready??0;
            $("statReview").textContent=payload.review??0;
            $("statFailed").textContent=payload.failed??0;
            $("statJpeg").textContent=payload.jpegReady??0;
            if(payload.message)log(`${payload.sheet} row ${payload.row}: ${payload.message}`);
            else if(payload.stage==="row"&&(done===1||done%25===0||done===total))log(`Processed ${done}/${total}`);
        }
        $("progressCount").textContent=`${done.toLocaleString()} / ${total.toLocaleString()}`;
        const percentage=total?Math.round(100*done/total):0;
        $("meterFill").style.width=`${percentage}%`;
        $("meter").setAttribute("aria-valuenow",String(percentage));
        if(payload.stage==="complete")$("stage").textContent=payload.autoStopped?"Stopped: JPEG failures — partial results saved":
            payload.cancelled?"Stopped — partial results saved":"Complete — results saved beside Excel";
    }
    api.onProgress(setProgress);
    function reset(){
        $("log").textContent="";total=0;done=0;
        for(const id of ["statReady","statReview","statFailed","statJpeg"])$(id).textContent="0";
        $("progressCount").textContent="0 / 0";$("meterFill").style.width="0%";
        $("meter").setAttribute("aria-valuenow","0");
        $("openFolder").disabled=true;$("openExcel").disabled=true;
    }
    function selectWorkbook(filePath){
        if(busy)return;
        if(typeof filePath!=="string"||!filePath.toLowerCase().endsWith(".xlsx")){
            log("ERROR: Choose a .xlsx workbook.");return;
        }
        reset();selectedWorkbook=filePath;
        $("selectedPath").textContent=filePath;$("selectedPath").title=filePath;
        $("stage").textContent="Workbook selected — test 3 products or generate the full batch";
        log(`Selected: ${filePath}`);
        log("Ready. Select Test 3 products first to verify the JPEG renderer.");
        state(false);
    }
    async function generate(maxProducts=null){
        if(busy||!selectedWorkbook)return;
        reset();$("stage").textContent="Reading workbook ...";state(true);
        log(`${maxProducts===3?"TEST 3 PRODUCTS":"FULL BATCH"}: loading Excel, extracting iframe images, generating HTML and direct JPEG ...`);
        try{
            const result=await api.startBatch(selectedWorkbook,undefined,maxProducts);
            $("openFolder").disabled=false;$("openExcel").disabled=false;
            $("remembered").textContent=`Last Excel folder: ${selectedWorkbook.replace(/[\\/][^\\/]+$/,"")}`;
            log(`Results Excel: ${result.resultsExcel}`);
            log(`HTML files: ${result.htmlFiles}; JPEG files: ${result.jpegReady}; READY: ${result.ready}; REVIEW: ${result.review}; FAILED: ${result.failed}; SKIPPED: ${result.skipped}`);
            if(result.autoStopped)log(`AUTOMATIC STOP: ${result.stoppedReason}`);
            else if(result.cancelled)log("Batch stopped. Completed entries and skipped-row statuses were saved.");
            if(result.failed||result.review)log(`See BATCH_REPORT.json and REVIEW / ERROR column for individual product errors.`);
            $("stage").textContent=result.autoStopped?"Stopped — repeated JPEG failures":result.cancelled?
                "Stopped — partial results saved":"Complete — saved beside Excel";
        }catch(e){$("stage").textContent="Batch stopped with an error";log("ERROR: "+(e?.message||e));}
        finally{state(false);}
    }
    async function browse(){
        if(busy)return;
        try{const file=await api.pickExcel();if(file)selectWorkbook(file);}catch(e){log("ERROR: "+(e?.message||e));}
    }
    $("browse").addEventListener("click",browse);
    $("testThree").addEventListener("click",()=>generate(3));
    $("runFull").addEventListener("click",()=>generate());
    $("dropZone").addEventListener("click",e=>{if(e.target===$("browse")||$("browse").contains(e.target))return;browse();});
    $("dropZone").addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();browse();}});
    for(const name of ["dragover","dragenter"]){
        $("dropZone").addEventListener(name,e=>{e.preventDefault();if(!busy)$("dropZone").classList.add("over");});
    }
    $("dropZone").addEventListener("dragleave",()=>$("dropZone").classList.remove("over"));
    $("dropZone").addEventListener("drop",e=>{
        e.preventDefault();$("dropZone").classList.remove("over");if(busy)return;
        const files=Array.from(e.dataTransfer?.files||[]);
        if(files.length!==1){log("ERROR: Drop exactly one .xlsx workbook.");return;}
        try{selectWorkbook(api.pathOfDroppedFile(files[0]));}catch(error){log("ERROR: "+(error?.message||error));}
    });
    document.addEventListener("dragover",e=>e.preventDefault());
    document.addEventListener("drop",e=>{if(!$("dropZone").contains(e.target))e.preventDefault();});
    $("stop").addEventListener("click",async()=>{if(busy){try{await api.stopBatch();log("Stop requested. Active tasks will finish before Excel is written.");}catch(e){log("ERROR: "+e.message);}}});
    $("clear").addEventListener("click",async()=>{
        if(busy)return;
        try{
            await api.clearSession();reset();selectedWorkbook="";state(false);
            $("selectedPath").textContent="No file selected";$("selectedPath").title="Current Excel input";
            $("stage").textContent="Ready to receive Excel";$("log").textContent="No batch run yet.";
        }catch(e){log("ERROR: "+(e?.message||e));}
    });
    $("openFolder").addEventListener("click",async()=>{try{await api.openOutput();}catch(e){log("ERROR: "+e.message);}});
    $("openExcel").addEventListener("click",async()=>{try{await api.openExcel();}catch(e){log("ERROR: "+e.message);}});
    api.getPreferences().then(p=>{
        $("remembered").textContent=p.lastExcelFolder?`Last Excel folder: ${p.lastExcelFolder}`:"Last Excel folder: not selected";
        $("openFolder").disabled=!p.lastOutputFolder;
        $("openExcel").disabled=!p.lastResultsExcel;
    }).catch(e=>log("Preferences could not be loaded: "+e.message));
})();
