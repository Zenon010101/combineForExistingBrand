"use strict";
const fs=require("fs"),path=require("path");
const KEYS=["single","lineup","details","output"];
class NewBrandFolderMemory {
    constructor(userData,io=fs){this.file=path.join(userData,"rakuten-new-brand-folders.json");this.io=io;}
    async load(){
        let data={};
        try{data=JSON.parse(await this.io.promises.readFile(this.file,"utf8"));}
        catch(e){if(e.code!=="ENOENT"&&!(e instanceof SyntaxError))throw e;}
        const output={};
        for(const key of KEYS){
            const value=data[key];
            if(typeof value==="string" && path.isAbsolute(value) && value.length<4096 && !/[\r\n\0]/.test(value)){
                try{if((await this.io.promises.stat(value)).isDirectory()){output[key]=value;continue;}}catch{}
            }
            output[key]="";
        }
        return output;
    }
    async write(data){
        await this.io.promises.mkdir(path.dirname(this.file),{recursive:true});
        const temp=this.file+`.${process.pid}.tmp`;
        try{await this.io.promises.writeFile(temp,JSON.stringify(data,null,2),"utf8");
            await this.io.promises.rename(temp,this.file);}
        finally{await this.io.promises.rm(temp,{force:true}).catch(()=>{});}
    }
    async set(section,folder){
        if(!KEYS.includes(section))throw new Error("Unknown New Brand folder section.");
        if(typeof folder!=="string"||!path.isAbsolute(folder)||!(await this.io.promises.stat(folder)).isDirectory())
            throw new Error("New Brand folder must be an existing local directory.");
        const values=await this.load();values[section]=path.resolve(folder);
        await this.write(values);return values;
    }
    async clear(){await this.write(Object.fromEntries(KEYS.map(key=>[key,""])));return this.load();}
}
module.exports={NewBrandFolderMemory,KEYS};
