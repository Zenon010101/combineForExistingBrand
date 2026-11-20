"use strict";
const path=require("path");
const fs=require("fs");
const {app,BrowserWindow,dialog,ipcMain,shell}=require("electron");
const {StandaloneBatch}=require("./core/batch");
const {Preferences}=require("./core/preferences");
let window=null,prefs=null,lastResult=null;
const service=new StandaloneBatch();
app.setAppUserModelId("com.gulliver.rakutencombinebatch");
function send(progress){if(window && !window.isDestroyed())window.webContents.send("batch:progress",progress);}
function createWindow(){
    window=new BrowserWindow({width:1120,height:820,minWidth:830,minHeight:590,
        backgroundColor:"#0b1220",title:"Rakuten Combine Batch",autoHideMenuBar:true,
        webPreferences:{preload:path.join(__dirname,"preload.js"),contextIsolation:true,sandbox:true,
            nodeIntegration:false,webSecurity:true}});
    window.loadFile(path.join(__dirname,"renderer","index.html"));
    window.webContents.setWindowOpenHandler(()=>({action:"deny"}));
    window.webContents.on("will-navigate",event=>event.preventDefault());
}
app.whenReady().then(()=>{
    prefs=new Preferences(app.getPath("userData"));
    ipcMain.handle("prefs:read",async()=>{
        const saved=await prefs.load();
        return {...saved,
            lastOutputFolder:saved.lastOutputFolder && fs.existsSync(saved.lastOutputFolder)?saved.lastOutputFolder:"",
            lastResultsExcel:saved.lastResultsExcel && fs.existsSync(saved.lastResultsExcel)?saved.lastResultsExcel:""};
    });
    ipcMain.handle("file:pick",async()=>{
        if(service.busy)throw new Error("A generation is already running.");
        const saved=await prefs.load();
        const folder=saved.lastExcelFolder && fs.existsSync(saved.lastExcelFolder)?saved.lastExcelFolder:app.getPath("documents");
        const chosen=await dialog.showOpenDialog(window,{title:"Select Excel - auto generate beside this file",defaultPath:folder,
            properties:["openFile"],filters:[{name:"Excel workbooks (.xlsx)",extensions:["xlsx"]}]});
        if(chosen.canceled||!chosen.filePaths?.[0])return null;
        const selected=chosen.filePaths[0];
        await prefs.save({lastExcelFolder:path.dirname(selected)});
        return selected;
    });
    ipcMain.handle("batch:start",async(_event,{filePath,defaultLineupCount,maxProducts=null}={})=>{
        if(service.busy)throw new Error("A generation is currently running.");
        if(typeof filePath!=="string"||!path.isAbsolute(filePath)||!filePath.toLowerCase().endsWith(".xlsx"))
            throw new Error("Choose a local .xlsx file.");
        // Explicit sample/full batch only; workbook selection does not run 7,000 rows.
        if(maxProducts!==null && maxProducts!==3)
            throw new Error("Only a three-product test or a full batch is supported in the app.");
        // Old count preference is preserved in the user profile but never
        // used to guess variations in strict classification mode.
        await prefs.save({lastExcelFolder:path.dirname(filePath)});
        lastResult=null;
        const result=await service.generate(filePath,{defaultLineupCount,maxProducts,progress:send});
        lastResult=result;
        await prefs.save({lastOutputFolder:result.outputFolder,lastResultsExcel:result.resultsExcel}).catch(()=>{});
        return result;
    });
    ipcMain.handle("batch:stop",()=>service.stop());
    ipcMain.handle("session:clear",async()=>{
        if(service.busy)throw new Error("Stop the current batch before clearing the screen.");
        lastResult=null;
        await prefs.clearRecentResults();
        // Never delete generated files, only reset the app session.
        return true;
    });
    ipcMain.handle("result:open-folder",async()=>{
        const folder=lastResult?.outputFolder||(await prefs.load()).lastOutputFolder;
        if(!folder||!fs.existsSync(folder))throw new Error("No saved output folder is available.");
        const status=await shell.openPath(folder);
        if(status)throw new Error(status);
        return true;
    });
    ipcMain.handle("result:open-excel",async()=>{
        const excel=lastResult?.resultsExcel||(await prefs.load()).lastResultsExcel;
        if(!excel||!fs.existsSync(excel))throw new Error("No saved output workbook is available.");
        const status=await shell.openPath(excel);
        if(status)throw new Error(status);
        return true;
    });
    ipcMain.handle("result:open-errors-excel",async()=>{
        const saved=await prefs.load();
        const excel=lastResult?.errorsExcel||(saved.lastOutputFolder?
            path.join(saved.lastOutputFolder,"ERRORS","COMBINE_ERRORS_ONLY.xlsx"):"");
        if(!excel||!fs.existsSync(excel))throw new Error("No errors-only workbook is available.");
        const status=await shell.openPath(excel);
        if(status)throw new Error(status);
        return true;
    });
    createWindow();
    app.on("activate",()=>{if(BrowserWindow.getAllWindows().length===0)createWindow();});
});
app.on("window-all-closed",()=>{if(process.platform!=="darwin")app.quit();});
