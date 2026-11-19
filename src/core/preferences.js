"use strict";
const fs=require("fs");
const path=require("path");
const FILE="rakuten-combine-prefs.json";
function dirPath(s){return typeof s==="string"&&s.length<4096&&!/[\r\n\0]/.test(s)?s.trim():"";}
class Preferences{
    constructor(userData,io=fs){this.file=path.join(userData,FILE);this.io=io;}
    async load(){
        try{
            const object=JSON.parse(await this.io.promises.readFile(this.file,"utf8"));
            return {lastExcelFolder:dirPath(object.lastExcelFolder),
                lastOutputFolder:dirPath(object.lastOutputFolder),
                lastResultsExcel:dirPath(object.lastResultsExcel),
                defaultLineupCount:
                Number.isInteger(object.defaultLineupCount)&&object.defaultLineupCount>=0&&object.defaultLineupCount<=250?
                    object.defaultLineupCount:3};
        }catch(e){if(e?.code==="ENOENT"||e instanceof SyntaxError)return {lastExcelFolder:"",lastOutputFolder:"",lastResultsExcel:"",defaultLineupCount:3};throw e;}
    }
    async clearRecentResults(){
        const old=await this.load();
        const next={...old,lastOutputFolder:"",lastResultsExcel:""};
        await this.io.promises.mkdir(path.dirname(this.file),{recursive:true});
        const temp=this.file+`.${process.pid}.clear.tmp`;
        try{await this.io.promises.writeFile(temp,JSON.stringify(next,null,2),"utf8");
            await this.io.promises.rename(temp,this.file);
        }finally{await this.io.promises.rm(temp,{force:true}).catch(()=>{});}
        return next;
    }
    async save(patch){
        const old=await this.load();
        const next={...old};
        if(Object.prototype.hasOwnProperty.call(patch,"lastExcelFolder")) {
            const raw=dirPath(patch.lastExcelFolder);
            if(!raw||!path.isAbsolute(raw))throw new Error("Invalid remembered folder.");
            next.lastExcelFolder=raw;
        }
        for(const key of ["lastOutputFolder","lastResultsExcel"]){
            if(Object.prototype.hasOwnProperty.call(patch,key)){
                const raw=dirPath(patch[key]);
                if(!raw||!path.isAbsolute(raw))throw new Error("Invalid remembered output location.");
                next[key]=raw;
            }
        }
        if(Object.prototype.hasOwnProperty.call(patch,"defaultLineupCount")){
            const count=Number(patch.defaultLineupCount);
            if(!Number.isInteger(count)||count<0||count>250)throw new Error("Line Up Count must be 0-250.");
            next.defaultLineupCount=count;
        }
        await this.io.promises.mkdir(path.dirname(this.file),{recursive:true});
        const temp=this.file+`.${process.pid}.tmp`;
        try{await this.io.promises.writeFile(temp,JSON.stringify(next,null,2),"utf8");await this.io.promises.rename(temp,this.file);}finally{
            await this.io.promises.rm(temp,{force:true}).catch(()=>{});
        }
        return next;
    }
}
module.exports={Preferences};
