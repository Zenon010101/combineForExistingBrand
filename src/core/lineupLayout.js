"use strict";

// Inspect ORIGINAL source-image geometry, not generated Combine rows.
// The small grayscale preview is processed only in memory. A split/cut is
// supporting evidence, never sufficient by itself to declare Line Up.
const GRID_SIZE=240;
const LIGHT_THRESHOLD=240;

function axisCut(ink,w,h,axis){
    const size=axis==="x"?w:h;
    const other=axis==="x"?h:w;
    // Slider Maker uses approximately balanced halves. Search for the widest
    // pale gutter close to the middle, not a hard-coded 50% seam.
    const lo=Math.floor(size*.39), hi=Math.ceil(size*.61);
    const activity=[];
    for(let p=0;p<size;p++){
        let colored=0;
        for(let q=0;q<other;q++)colored+=axis==="x"?ink[q*w+p]:ink[p*w+q];
        activity.push(colored/other);
    }
    let best=null;
    for(let center=lo;center<=hi;center++){
        let left=center,right=center;
        while(left>0&&activity[left-1]<=.065)left--;
        while(right<size-1&&activity[right+1]<=.065)right++;
        const width=right-left+1;
        if(width<size*.016)continue;
        const inkRatio=activity.slice(left,right+1).reduce((a,b)=>a+b,0)/width;
        const centerPenalty=Math.abs((left+right)/2-size/2)/size;
        const score=Math.min(1,width/(size*.08))*.75+(1-inkRatio/.065)*.25-centerPenalty*.5;
        if(!best||score>best.score)best={position:Math.round((left+right)/2),width,score};
    }
    return best;
}
function axisSeam(gray,w,h,axis){
    // Full-bleed Slider Maker cuts can have NO white gutter. Detect a straight
    // panel boundary only when pixel discontinuity spans much of the image.
    const size=axis==="x"?w:h, other=axis==="x"?h:w;
    let best=null;
    for(let pos=Math.max(2,Math.floor(size*.39));pos<=Math.min(size-2,Math.ceil(size*.61));pos++){
        let jumps=0,delta=0;
        for(let q=0;q<other;q++){
            const a=axis==="x"?gray[q*w+pos-1]:gray[(pos-1)*w+q];
            const b=axis==="x"?gray[q*w+pos]:gray[pos*w+q];
            const diff=Math.abs(a-b);
            delta+=diff;if(diff>=28)jumps++;
        }
        const share=jumps/other,mean=delta/other;
        if(share<.40||mean<28)continue;
        const centerPenalty=Math.abs(pos-size/2)/size;
        const score=.5*Math.min(1,share/.80)+.5*Math.min(1,mean/75)-centerPenalty*.4;
        if(!best||score>best.score)best={position:pos,score,share,mean,kind:"seam"};
    }
    return best;
}
function regionOccupancy(ink,w,x0,y0,x1,y1){
    const lx=Math.max(0,Math.floor(x0)), ly=Math.max(0,Math.floor(y0));
    const rx=Math.min(w,Math.ceil(x1)), ry=Math.min(ink.length/w,Math.ceil(y1));
    let present=0;
    for(let y=ly;y<ry;y++)for(let x=lx;x<rx;x++)present+=ink[y*w+x];
    return present/Math.max(1,(rx-lx)*(ry-ly));
}
function detectLayoutFromGray(gray,w,h,{threshold=LIGHT_THRESHOLD}={}){
    if(!gray||!w||!h||gray.length<w*h)throw new Error("Invalid grayscale preview");
    const ink=new Uint8Array(w*h);
    let outerLight=0,outerCount=0;
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
        const i=y*w+x;
        ink[i]=gray[i]<threshold?1:0;
        if(x<w*.05||x>=w*.95||y<h*.05||y>=h*.95){outerCount++;if(gray[i]>=threshold)outerLight++;}
    }
    const backgroundLight=outerLight/Math.max(1,outerCount);
    const empty={type:"single",cuts:1,confidence:0,backgroundLight};
    const whiteBackground=backgroundLight>=.70;
    const vx=whiteBackground?axisCut(ink,w,h,"x"):null;
    const hy=whiteBackground?axisCut(ink,w,h,"y"):null;
    // For colored/full-bleed tiled photos, look for hard straight seams.
    const sx=axisSeam(gray,w,h,"x"),sy=axisSeam(gray,w,h,"y");
    const xCut=(vx?.score>=.64?vx:null) || (sx?.score>=.67?sx:null);
    const yCut=(hy?.score>=.64?hy:null) || (sy?.score>=.67?sy:null);
    const x=xCut?.position||Math.floor(w/2), y=yCut?.position||Math.floor(h/2);
    const gutters=Boolean(xCut),stacked=Boolean(yCut);
    const left=regionOccupancy(ink,w,0,0,x,h),right=regionOccupancy(ink,w,x,0,w,h);
    const top=regionOccupancy(ink,w,0,0,w,y),bottom=regionOccupancy(ink,w,0,y,w,h);
    const verticalOk=gutters&&left>=.025&&right>=.025;
    const horizontalOk=stacked&&top>=.025&&bottom>=.025;
    if(verticalOk&&horizontalOk){
        const quadrants=[
            regionOccupancy(ink,w,0,0,x,y),regionOccupancy(ink,w,x,0,w,y),
            regionOccupancy(ink,w,0,y,x,h),regionOccupancy(ink,w,x,y,w,h)
        ];
        if(quadrants.every(v=>v>=.021))return {type:"four-cut",cuts:4,
            confidence:Math.min(xCut.score,yCut.score),backgroundLight,verticalCut:x/w,horizontalCut:y/h};
    }
    if(verticalOk&&(!horizontalOk||xCut.score>=yCut.score))return {type:"horizontal",cuts:2,
        confidence:xCut.score,backgroundLight,verticalCut:x/w};
    if(horizontalOk)return {type:"vertical",cuts:2,
        confidence:yCut.score,backgroundLight,horizontalCut:y/h};
    return empty;
}
async function detectLayoutFromBuffer(buffer){
    const sharp=require("sharp");
    const {data,info}=await sharp(buffer,{limitInputPixels:45000000})
        .rotate().flatten({background:"#ffffff"})
        .resize(GRID_SIZE,GRID_SIZE,{fit:"fill"}).grayscale().raw().toBuffer({resolveWithObject:true});
    return detectLayoutFromGray(data,info.width,info.height);
}
function isSupportedMultiCut(layout){return Boolean(layout&&layout.cuts>=2&&layout.confidence>=.65);}
module.exports={detectLayoutFromGray,detectLayoutFromBuffer,isSupportedMultiCut};
