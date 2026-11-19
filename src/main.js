"use strict";
const path=require("path");
const fs=require("fs");
const {app,BrowserWindow,dialog,ipcMain,shell}=require("electron");
const {StandaloneBatch}=require("./core/batch");
const {Preferences}=require("./core/preferences");
const {NewBrandFolderMemory}=require("./core/newBrandFolders");
const {NewBrandService}=require("./manual/service");
let window=null,prefs=null,lastResult=null,brandFolders=null;
const service=new StandaloneBatch();
const manual=new NewBrandService();
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
    brandFolders=new NewBrandFolderMemory(app.getPath("userData"));
    ipcMain.handle("prefs:read",async()=>{
        const saved=await prefs.load();
        return {...saved,
            lastOutputFolder:saved.lastOutputFolder && fs.existsSync(saved.lastOutputFolder)?saved.lastOutputFolder:"",
            lastResultsExcel:saved.lastResultsExcel && fs.existsSync(saved.lastResultsExcel)?saved.lastResultsExcel:""};
    });
    ipcMain.handle("file:pick",async()=>{
        if(service.busy||manual.busy)throw new Error("A generation is already running.");
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
        if(service.busy||manual.busy)throw new Error("A generation is currently running.");
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
    ipcMain.handle("new:status",async()=>{
        const folders=await brandFolders.load();
        if(!manual.outputFolder && folders.output) manual.setOutputFolder(folders.output);
        return {...manual.status(),folders};
    });
    ipcMain.handle("new:forget-folders",async()=>{
        if(service.busy||manual.busy)throw new Error("Generation is running.");
        await brandFolders.clear();manual.clearOutputFolder();
        return {...manual.status(),folders:await brandFolders.load()};
    });
    ipcMain.handle("new:pick-images",async(_event,section)=>{
        if(manual.busy||service.busy)throw new Error("Another generation is running.");
        if(!["single","lineup","details"].includes(section))throw new Error("Invalid upload section.");
        const remembered=await brandFolders.load();
        const selected=await dialog.showOpenDialog(window,{
            title:`Select ${section} images`,defaultPath:remembered[section]||app.getPath("pictures"),
            properties:section==="single"?["openFile"]:["openFile","multiSelections"],
            filters:[{name:"Common image files",extensions:["jpg","jpeg","png","webp","tif","tiff","bmp","gif","psd","psb","avif","heic","heif","svg","tga","jp2","j2k","exr","hdr","ppm","pgm","jfif"]},
                {name:"All files (readable images only)",extensions:["*"]}]
        });
        if(selected.canceled||!selected.filePaths?.length)return {images:[],failed:[]};
        const result=await manual.importPaths(selected.filePaths);
        if(result.images.length)await brandFolders.set(section,path.dirname(result.images[0].path));
        return result;
    });
    ipcMain.handle("new:add-paths",async(_event,section,paths)=>{
        if(manual.busy||service.busy)throw new Error("Another generation is running.");
        if(!["single","lineup","details"].includes(section))throw new Error("Invalid upload section.");
        const result=await manual.importPaths(paths);
        if(result.images.length)await brandFolders.set(section,path.dirname(result.images[0].path));
        return result;
    });
    ipcMain.handle("new:choose-output",async()=>{
        if(manual.busy)throw new Error("Generation is running.");
        const remembered=await brandFolders.load();
        const result=await dialog.showOpenDialog(window,{title:"Choose New Brand JPEG + HTML output folder",
            defaultPath:manual.outputFolder||remembered.output||app.getPath("pictures"),properties:["openDirectory"]});
        if(result.canceled)return manual.status();
        const status=manual.setOutputFolder(result.filePaths[0]);
        await brandFolders.set("output",result.filePaths[0]);
        return status;
    });
    ipcMain.handle("new:plan",(_event,payload)=>manual.plan(payload));
    ipcMain.handle("new:generate",async(_event,payload)=>{
        if(service.busy)throw new Error("Wait for Existing Brand batch to finish.");
        return manual.generate(payload,data=>{if(window&&!window.isDestroyed())window.webContents.send("new:progress",data);});
    });
    ipcMain.handle("new:clear",()=>manual.reset());
    ipcMain.handle("new:open-output",async()=>{
        if(!manual.outputFolder)throw new Error("Choose an output folder first.");
        const result=await shell.openPath(manual.outputFolder);if(result)throw new Error(result);return true;
    });
    ipcMain.handle("new:open-result",async()=>{
        if(!manual.lastOutput||!fs.existsSync(manual.lastOutput))throw new Error("No generated New Brand HTML exists.");
        const result=await shell.openPath(manual.lastOutput);if(result)throw new Error(result);return true;
    });
    createWindow();
    app.on("activate",()=>{if(BrowserWindow.getAllWindows().length===0)createWindow();});
});
app.on("window-all-closed",()=>{if(process.platform!=="darwin")app.quit();});
