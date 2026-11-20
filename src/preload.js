"use strict";
const {contextBridge,ipcRenderer,webUtils}=require("electron");
contextBridge.exposeInMainWorld("combine",Object.freeze({
    getPreferences:()=>ipcRenderer.invoke("prefs:read"),
    pickExcel:()=>ipcRenderer.invoke("file:pick"),
    startBatch:(filePath,defaultLineupCount,maxProducts=null)=>ipcRenderer.invoke("batch:start",{filePath,defaultLineupCount,maxProducts}),
    stopBatch:()=>ipcRenderer.invoke("batch:stop"),
    clearSession:()=>ipcRenderer.invoke("session:clear"),
    openOutput:()=>ipcRenderer.invoke("result:open-folder"),
    openExcel:()=>ipcRenderer.invoke("result:open-excel"),
    openErrorsExcel:()=>ipcRenderer.invoke("result:open-errors-excel"),
    pathOfDroppedFile:file=>webUtils.getPathForFile(file),
    onProgress:handler=>{
        const callback=(_event,payload)=>handler(payload);
        ipcRenderer.on("batch:progress",callback);
        return ()=>ipcRenderer.removeListener("batch:progress",callback);
    }
}));
