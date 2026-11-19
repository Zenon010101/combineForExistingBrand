"use strict";
const {contextBridge,ipcRenderer,webUtils}=require("electron");
contextBridge.exposeInMainWorld("combine",Object.freeze({
    getPreferences:()=>ipcRenderer.invoke("prefs:read"),
    pickNewImages:section=>ipcRenderer.invoke("new:pick-images",section),
    addNewPaths:(section,paths)=>ipcRenderer.invoke("new:add-paths",section,paths),
    getNewStatus:()=>ipcRenderer.invoke("new:status"),
    clearNewFolderMemory:()=>ipcRenderer.invoke("new:forget-folders"),
    chooseNewFolder:()=>ipcRenderer.invoke("new:choose-output"),
    planNew:payload=>ipcRenderer.invoke("new:plan",payload),
    generateNew:payload=>ipcRenderer.invoke("new:generate",payload),
    clearNew:()=>ipcRenderer.invoke("new:clear"),
    openNewFolder:()=>ipcRenderer.invoke("new:open-output"),
    openNewResult:()=>ipcRenderer.invoke("new:open-result"),
    onNewProgress:handler=>{
        const callback=(_event,payload)=>handler(payload);
        ipcRenderer.on("new:progress",callback);
        return ()=>ipcRenderer.removeListener("new:progress",callback);
    },
    pickExcel:()=>ipcRenderer.invoke("file:pick"),
    startBatch:(filePath,defaultLineupCount,maxProducts=null)=>ipcRenderer.invoke("batch:start",{filePath,defaultLineupCount,maxProducts}),
    stopBatch:()=>ipcRenderer.invoke("batch:stop"),
    clearSession:()=>ipcRenderer.invoke("session:clear"),
    openOutput:()=>ipcRenderer.invoke("result:open-folder"),
    openExcel:()=>ipcRenderer.invoke("result:open-excel"),
    pathOfDroppedFile:file=>webUtils.getPathForFile(file),
    onProgress:handler=>{
        const callback=(_event,payload)=>handler(payload);
        ipcRenderer.on("batch:progress",callback);
        return ()=>ipcRenderer.removeListener("batch:progress",callback);
    }
}));
