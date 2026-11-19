"use strict";
const path=require("path");
const MAX_PART_HEIGHT=60000;
function planJPEGParts(height,workspace){
    if(!Number.isInteger(height)||height<1||height>300000)throw new Error("Invalid Combine height.");
    const count=Math.ceil(height/MAX_PART_HEIGHT),parts=[];
    for(let i=0;i<count;i++){
        const top=i*MAX_PART_HEIGHT;
        parts.push({path:path.join(workspace,count===1?"result.jpg":`result_${String(i+1).padStart(2,"0")}.jpg`),top,height:Math.min(MAX_PART_HEIGHT,height-top)});
    }
    return parts;
}
module.exports={planJPEGParts};
