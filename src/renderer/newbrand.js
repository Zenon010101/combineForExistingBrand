"use strict";
(()=>{
    const api=window.combine;
    const $=id=>document.getElementById(id);
    const state={single:null,lineup:[],details:[],outputFolder:"",busy:false,layout:null,folders:{}};
    const SC=0.68;
    let pending=0,dragItem=null;
    function log(text){
        const node=$("newLog");
        node.textContent=(node.textContent==="Ready for manual upload."?"":node.textContent)+
            `[${new Date().toLocaleTimeString()}] ${String(text)}\n`;
        if(node.textContent.length>20000)node.textContent=node.textContent.slice(-17000);
        node.scrollTop=node.scrollHeight;
    }
    const sections=["single","lineup","details"];
    function switchMode(name){
        if(state.busy)return;
        const existing=name==="existing";
        $("existingMode").hidden=!existing;
        $("newBrandMode").hidden=existing;
        $("tabExisting").classList.toggle("selected",existing);
        $("tabNewBrand").classList.toggle("selected",!existing);
        $("tabExisting").setAttribute("aria-selected",String(existing));
        $("tabNewBrand").setAttribute("aria-selected",String(!existing));
        $("modeTitle").textContent=existing?"Existing Brand":"New Brand";
        $("modeDescription").textContent=existing?
            "Automatic Excel/iframe import. Single first, then exactly two fixed image columns in source order; no full-width gallery fallback.":
            "Manual upload: optional Single, ordered Line Up with optional editable captions, then Details. Original BrandForge Combine geometry. No text removal.";
        if(!existing)queuePreview();
    }
    $("tabExisting").addEventListener("click",()=>switchMode("existing"));
    $("tabNewBrand").addEventListener("click",()=>switchMode("new"));
    function objList(section){return section==="single"?(state.single?[state.single]:[]):state[section];}
    function payload(){return {outputName:$("newOutputName").value.trim()||"COMBINE",
        singlePath:state.single?.path||null,
        lineup:state.lineup.map(x=>({path:x.path,rowMode:x.rowMode||"single",
            colorName:x.colorName||"",colorNameRight:x.colorNameRight||"",
            captionTopY:x.captionTopY??0.44,captionBottomY:x.captionBottomY??0.925})),
        details:state.details.map(x=>x.path),exportPsd:Boolean($("newExportPsd")?.checked)};}
    function busy(value){
        state.busy=value;
        for(const id of ["newAddSingle","newAddLineup","newAddDetails","newChooseFolder","newGenerate","newReset","newForgetFolders"])
            $(id).disabled=value;
    }
    function makeButton(symbol,title,callback,disabled=false){
        const btn=document.createElement("button");btn.type="button";btn.textContent=symbol;
        btn.title=title;btn.disabled=disabled||state.busy;btn.addEventListener("click",callback);
        return btn;
    }
    function createInput(value,placeholder,onChange){
        const input=document.createElement("input");input.type="text";input.maxLength=120;
        input.value=value||"";input.placeholder=placeholder;
        input.addEventListener("input",()=>{onChange(input.value);queuePreview();});
        return input;
    }
    function buildLineupFields(entry){
        const box=document.createElement("div");box.className="manual-fields";
        const select=document.createElement("select");
        for(const [value,label] of [["single","1 color / half row"],["dual","2 colors LEFT / RIGHT"],["vertical","2 colors TOP / BOTTOM"]]){
            const option=document.createElement("option");option.value=value;option.textContent=label;
            select.appendChild(option);
        }
        select.value=entry.rowMode||"single";
        select.addEventListener("change",()=>{entry.rowMode=select.value;renderLists();queuePreview();});
        box.appendChild(select);
        box.appendChild(createInput(entry.colorName,"Color name (optional)",v=>entry.colorName=v));
        if(entry.rowMode!=="single"){
            box.appendChild(createInput(entry.colorNameRight,entry.rowMode==="vertical"?"Bottom color (optional)":"Right color (optional)",v=>entry.colorNameRight=v));
        }
        if(entry.rowMode==="vertical"){
            for(const [prop,placeholder,defaultValue] of [["captionTopY","Top caption Y %",44],["captionBottomY","Bottom caption Y %",92.5]]){
                const field=document.createElement("input");field.type="number";field.min="5";field.max="99";field.step="0.5";
                field.title=placeholder;field.placeholder=placeholder;field.style.flex="1 1 100px";
                field.value=String(Math.round((entry[prop]??defaultValue/100)*1000)/10);
                field.addEventListener("input",()=>{entry[prop]=Number(field.value)/100;queuePreview();});
                box.appendChild(field);
            }
        }
        return box;
    }
    function renderList(section){
        const container=$(section==="single"?"newSingleList":section==="lineup"?"newLineupList":"newDetailsList");
        const items=objList(section);container.replaceChildren();
        container.classList.toggle("empty-list",!items.length);
        if(!items.length){container.textContent=`No ${section==="single"?"Single":section==="lineup"?"Line Up":"Detail"} images.`;return;}
        items.forEach((item,i)=>{
            const row=document.createElement("div");row.className="manual-item";row.draggable=section!=="single";
            const thumb=item.thumbnail?document.createElement("img"):document.createElement("div");
            thumb.className=item.thumbnail?"manual-thumb":"manual-no-thumb";
            if(item.thumbnail){thumb.src=item.thumbnail;thumb.alt=item.name;}
            else thumb.textContent=item.isPhotoshop?"PSD":"IMAGE";
            const meta=document.createElement("div");meta.className="manual-meta";
            const label=document.createElement("strong");label.textContent=item.name;label.title=item.path;
            const info=document.createElement("small");info.textContent=`${item.width} x ${item.height}px`;
            meta.append(label,info);
            if(section==="lineup")meta.appendChild(buildLineupFields(item));
            const actions=document.createElement("div");actions.className="manual-tools";
            if(section!=="single"){
                actions.appendChild(makeButton("\u2191","Move up",()=>move(section,i,-1),i===0));
                actions.appendChild(makeButton("\u2193","Move down",()=>move(section,i,1),i===items.length-1));
            }
            actions.appendChild(makeButton("\u00d7","Remove image",()=>remove(section,i)));
            row.append(thumb,meta,actions);container.appendChild(row);
            if(section!=="single"){
                row.addEventListener("dragstart",event=>{
                    if(event.target.closest("input, select, button")){event.preventDefault();return;}
                    dragItem={section,index:i};row.classList.add("dragging");
                    event.dataTransfer?.setData("text/plain",String(i));
                });
                row.addEventListener("dragend",()=>{row.classList.remove("dragging");dragItem=null;});
                row.addEventListener("dragover",event=>{event.preventDefault();});
                row.addEventListener("drop",event=>{
                    event.preventDefault();if(!dragItem||dragItem.section!==section)return;
                    const from=dragItem.index,to=i;dragItem=null;
                    const list=state[section];list.splice(to,0,list.splice(from,1)[0]);renderLists();queuePreview();
                });
            }
        });
    }
    function renderLists(){for(const name of sections)renderList(name);}
    function move(section,i,dir){
        if(state.busy)return;
        const list=state[section],target=i+dir;
        if(target<0||target>=list.length)return;
        [list[i],list[target]]=[list[target],list[i]];
        renderLists();queuePreview();
    }
    function remove(section,i){
        if(state.busy)return;
        if(section==="single")state.single=null;else state[section].splice(i,1);
        renderLists();queuePreview();
    }
    async function add(section,paths=null){
        if(state.busy)return;
        try{
            const result=paths?await api.addNewPaths(section,paths):await api.pickNewImages(section);
            for(const entry of result.images||[]){
                if(section==="single")state.single=entry;
                else if(!state[section].some(x=>x.path.toLowerCase()===entry.path.toLowerCase())){
                    state[section].push(section==="lineup"?{...entry,rowMode:"single",colorName:"",colorNameRight:""}:entry);
                }
            }
            for(const failed of result.failed||[])log(`Could not load ${failed.path}: ${failed.error}`);
            if(result.images?.length)log(`Imported ${result.images.length} image(s) into ${section.toUpperCase()}.`);
            renderLists();queuePreview();await updateFolderMemory();
        }catch(e){log("Upload error: "+(e.message||e));}
    }
    $("newAddSingle").addEventListener("click",()=>add("single"));
    $("newAddLineup").addEventListener("click",()=>add("lineup"));
    $("newAddDetails").addEventListener("click",()=>add("details"));
    for(const drop of document.querySelectorAll("[data-upload]")){
        const section=drop.dataset.upload;
        drop.addEventListener("click",()=>add(section));
        drop.addEventListener("keydown",e=>{if(e.key===" "||e.key==="Enter"){e.preventDefault();add(section);}});
        for(const type of ["dragover","dragenter"])drop.addEventListener(type,e=>{e.preventDefault();drop.classList.add("over");});
        drop.addEventListener("dragleave",()=>drop.classList.remove("over"));
        drop.addEventListener("drop",e=>{
            e.preventDefault();e.stopPropagation();drop.classList.remove("over");
            const paths=Array.from(e.dataTransfer?.files||[]).map(file=>api.pathOfDroppedFile(file)).filter(Boolean);
            if(paths.length)add(section,section==="single"?paths.slice(0,1):paths);
        });
    }
    function drawLayout(layout){
        const canvas=$("newPreviewCanvas"),holder=$("newPreviewHolder");
        canvas.replaceChildren();canvas.style.height=`${Math.ceil(layout.height)}px`;
        holder.style.width="408px";holder.style.height=`${Math.ceil(layout.height*SC)}px`;
        $("newSize").textContent=`600 x ${layout.height}px`;
        const byPath=new Map([...objList("single"),...state.lineup,...state.details].map(e=>[e.path.toLowerCase(),e]));
        function putImage(item){
            const img=document.createElement("img"),source=byPath.get(item.path.toLowerCase());
            if(!source?.thumbnail){
                const placeholder=document.createElement("div");
                placeholder.textContent=`Preview unavailable: ${item.name||"PSD"}`;
                Object.assign(placeholder.style,{position:"absolute",left:`${item.x}px`,top:`${item.y}px`,
                    width:`${item.placedWidth}px`,height:`${item.placedHeight}px`,display:"flex",
                    alignItems:"center",justifyContent:"center",fontSize:"12px",color:"#667",background:"#f3f3f3"});
                canvas.appendChild(placeholder);return;
            }
            img.src=item.preserveCanvas?(source.thumbnailFull||source.thumbnail):source.thumbnail;
            img.alt=item.name||"Image";
            Object.assign(img.style,{left:`${item.x}px`,top:`${item.y}px`,width:`${item.placedWidth}px`,height:`${item.placedHeight}px`});
            canvas.appendChild(img);
        }
        if(layout.single)putImage(layout.single);
        for(const item of layout.lineup){
            putImage(item);
            for(const label of item.labels||[]){
                const node=document.createElement("div");node.className="preview-label";
                node.textContent=label.lines.join("\n");
                Object.assign(node.style,{left:`${label.x}px`,top:`${label.y}px`,width:`${label.width}px`,height:`${label.height}px`});
                canvas.appendChild(node);
            }
        }
        if(layout.detailsHeader){
            const node=document.createElement("div");node.className="preview-heading";node.textContent="DETAILS";
            node.style.left=`${layout.detailsHeader.x}px`;node.style.top=`${layout.detailsHeader.y}px`;
            canvas.appendChild(node);
        }
        for(const item of layout.details)putImage(item);
    }
    async function refreshPreview(){
        const token=++pending,empty=!state.single&&!state.lineup.length&&!state.details.length;
        if(empty){
            $("newPreviewCanvas").replaceChildren();$("newPreviewHolder").style.height="150px";
            $("newSize").textContent="600px canvas";return;
        }
        try{
            const result=await api.planNew(payload());
            if(token!==pending)return;
            state.layout=result;drawLayout(result);
        }catch(e){
            if(token!==pending)return;
            $("newSize").textContent="Review inputs";
            const node=$("newPreviewCanvas");node.replaceChildren();node.style.height="130px";
            const message=document.createElement("p");message.className="new-preview-placeholder";
            message.textContent=String(e.message||e);node.appendChild(message);
            $("newPreviewHolder").style.height="150px";
        }
    }
    function queuePreview(){refreshPreview();}
    $("newOutputName").addEventListener("input",queuePreview);
    function showRememberedFolders(){
        const labels={single:"Single",lineup:"Line Up",details:"Details",output:"Output"};
        const current=Object.entries(labels).map(([key,label])=>`${label}: ${state.folders[key]||"Not set"}`);
        $("newFolderMemory").textContent=current.join(" | ");
        $("newFolderMemory").title=current.join("\n");
    }
    async function updateFolderMemory(){
        const saved=await api.getNewStatus();
        state.folders=saved.folders||{};
        state.outputFolder=saved.outputFolder||"";
        $("newOutputFolder").textContent=state.outputFolder||"No folder selected";
        $("newOpenFolder").disabled=!state.outputFolder;
        showRememberedFolders();
    }
    $("newForgetFolders").addEventListener("click",async()=>{
        if(state.busy)return;
        try {const saved=await api.clearNewFolderMemory();
            state.folders=saved.folders||{};state.outputFolder="";
            $("newOutputFolder").textContent="No folder selected";
            $("newOpenFolder").disabled=true;showRememberedFolders();
            log("Cleared New Brand remembered folders (existing files are untouched).");
        }catch(e){log("Folder memory error: "+e.message);}
    });
    $("newChooseFolder").addEventListener("click",async()=>{
        try{const result=await api.chooseNewFolder();state.outputFolder=result.outputFolder||"";
            $("newOutputFolder").textContent=state.outputFolder||"No folder selected";
            $("newOpenFolder").disabled=!state.outputFolder;
            await updateFolderMemory();
        }catch(e){log("Folder error: "+e.message);}
    });
    api.onNewProgress(x=>{if(x.message)log(x.message);});
    $("newGenerate").addEventListener("click",async()=>{
        if(state.busy)return;
        busy(true);log("Validating source images and original BrandForge Combine geometry ...");
        try{
            const result=await api.generateNew(payload());
            log(`HTML CREATED: ${result.htmlPath}`);
            log(`JPEG CREATED: ${(result.jpegPaths||[]).join(" ; ")}`);
            if(result.psdPath)log(`PSD CREATED: ${result.psdPath}`);
            if(result.psdWarning)log(result.psdWarning);
            $("newOpenFolder").disabled=false;$("newOpenResult").disabled=false;
        }catch(e){log("GENERATION ERROR: "+(e.message||e));}
        finally{busy(false);renderLists();}
    });
    $("newReset").addEventListener("click",async()=>{
        if(state.busy)return;
        try{await api.clearNew();state.single=null;state.lineup=[];state.details=[];state.layout=null;
            $("newOpenResult").disabled=true;$("newLog").textContent="Ready for manual upload.";
            renderLists();queuePreview();
        }catch(e){log("Clear error: "+e.message);}
    });
    $("newOpenFolder").addEventListener("click",async()=>{try{await api.openNewFolder();}catch(e){log(e.message);}});
    $("newOpenResult").addEventListener("click",async()=>{try{await api.openNewResult();}catch(e){log(e.message);}});
    renderLists();
    updateFolderMemory().catch(e=>log("Folder memory could not load: "+e.message));
})();
