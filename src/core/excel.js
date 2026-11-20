"use strict";
// Excel input/output: keep each product on the ORIGINAL worksheet and row.
// We only ever save a NEW workbook in the output folder beside the input Excel.
const path=require("path");
const {pathToFileURL}=require("url");
const {iframeUrl}=require("./iframeHtml");
const {looksLikeSingleSource,looksLikeRemoteSingle}=require("./iframeSingle");
const MAX_ROWS=15000,MAX_EXCEL_CELL=32767;
const QC_HEADERS=["STATUS","JPEG STATUS","SINGLE STATUS","DETECTED LINE UP","DETECTED DETAILS","SPLIT METHOD","REVIEW / ERROR",
    "ISSUE CODES","JPEG HEIGHT (PX)","BROKEN DETAIL URLS"];
// Accept SINGLE, SINGLE IMAGE URL, SINGLE IMAGE PATH and SINGLE IMAGE URL / PATH.
const HEADER_SINGLE=/^single(?:\s+(?:image|photo|picture|file|path|url|link|source|or))*$/i;
const HEADER_LINEUP=/^(?:line\s*up|lineup)\s*(?:image\s*)?(?:count|#|images)$/i;
const HEADER_IFRAME=/^(?:iframe|iframe html|iframe code|iframe link|iframe url)$/i;

function cellText(cell){
    const v=cell?.value;
    if(typeof v==="string")return v.trim();
    if(v && typeof v==="object"){
        if(typeof v.error==="string")return v.error.trim(); // ExcelJS cell type Error
        if(typeof v.text==="string")return v.text.trim();
        if(v.result!=null){
            if(typeof v.result==="object" && typeof v.result.error==="string")return v.result.error.trim();
            return String(v.result).trim();
        }
        if(Array.isArray(v.richText))return v.richText.map(p=>p.text||"").join("").trim();
    }
    if(typeof v==="number"||typeof v==="boolean")return String(v);
    return typeof cell?.text==="string"?cell.text.trim():v==null?"":String(v).trim();
}
function singleCellText(cell){
    const displayed=cellText(cell);
    const href=cell?.value?.hyperlink || cell?.hyperlink;
    // Real Excel hyperlink cells may have a caption such as "View Single".
    // The actual linked URL/path, not the caption, is the Single source.
    if(typeof href==="string" && (looksLikeSingleSource(href) || looksLikeRemoteSingle(href)) &&
       !looksLikeSingleSource(displayed))return href.trim();
    return displayed;
}
function normHeader(text){return String(text||"").replace(/[_\-/&()]+/g," ").replace(/\s+/g," ").trim();}
function looksLikeIframe(text){return /^\s*<iframe\b[^>]*\bsrc\s*=/i.test(text)||/^\s*https:\/\/(?:www\.)?rakuten\.ne\.jp\/gold\//i.test(text);}
function detectHeaderColumn(ws,re,excluded=null){
    for(let r=1;r<=Math.min(5,ws.rowCount);r++){
        for(let c=1;c<=Math.min(60,ws.columnCount||60);c++){
            if(c===excluded)continue;
            if(re.test(normHeader(cellText(ws.getRow(r).getCell(c)))))return c;
        }
    }
    return null;
}
function iframeColumn(ws){
    const candidates=new Map();let preferred=detectHeaderColumn(ws,HEADER_IFRAME);
    ws.eachRow((row)=>{
        const max=Math.min(60,row.cellCount);
        for(let col=1;col<=max;col++) if(looksLikeIframe(cellText(row.getCell(col))))
            candidates.set(col,(candidates.get(col)||0)+1);
    });
    if(preferred && candidates.has(preferred))return preferred;
    let topCol=null,topCount=0;
    for(const [col,count] of candidates){if(count>topCount){topCol=col;topCount=count;}}
    if(topCol)return topCol;
    // An error-only workbook can have no readable iframe values at all.
    // Still report its source errors rather than refusing the entire batch.
    if(preferred)return preferred;
    if(ws.columnCount>=5){
        for(let r=2;r<=Math.min(ws.rowCount,200);r++){
            const row=ws.getRow(r);
            if(/^#(?:VALUE!|REF!|N\/A|NAME\?|DIV\/0!|NUM!|NULL!)/i.test(cellText(row.getCell(3)))&&
               (looksLikeSingleSource(singleCellText(row.getCell(5)))||
                   looksLikeRemoteSingle(singleCellText(row.getCell(5)))) &&
               (cellText(row.getCell(1))||cellText(row.getCell(2))))return 3;
        }
    }
    return null;
}
function findSingleCol(ws,iframeCol){
    const explicit=detectHeaderColumn(ws,HEADER_SINGLE,iframeCol);
    if(explicit)return explicit;
    // rak1-normal-item.xlsx: C=IFRAME, D=blank OUTPUT, E=Yahoo Single URL.
    // The Yahoo URLs have no .jpg extension; they are still image sources.
    const samples=[];
    for(let r=1;r<=ws.rowCount && samples.length<160;r++){
        if(looksLikeIframe(cellText(ws.getRow(r).getCell(iframeCol))))samples.push(r);
    }
    if(!samples.length){
        if(iframeCol===3){
            for(let r=2;r<=Math.min(ws.rowCount,200);r++){
                const sample=singleCellText(ws.getRow(r).getCell(5));
                if(looksLikeSingleSource(sample)||looksLikeRemoteSingle(sample))return 5;
            }
        }
        return null;
    }
    const counts=new Map(),maxCol=Math.min(Math.max(ws.columnCount||0,iframeCol+2),60);
    for(let col=1;col<=maxCol;col++){
        if(col===iframeCol)continue;
        // Rerunning a previously generated workbook must NOT mistake a
        // JPEG FILE LINK result column for the original Single source.
        const header=normHeader(cellText(ws.getRow(1).getCell(col))).toUpperCase();
        if(["OUTPUT","HTML FILE LINK","JPEG FILE LINK",...QC_HEADERS].includes(header))continue;
        let n=0;
        for(const r of samples)if(looksLikeSingleSource(singleCellText(ws.getRow(r).getCell(col))))n++;
        if(n>0)counts.set(col,n);
    }
    if(iframeCol===3 && counts.has(5))return 5;
    if(iframeCol===3){
        // In headerless rak1 workbooks, E may contain an invalid image host.
        // Treat it as the Single source so it is reported as BROKEN rather than
        // silently interpreted as "no Single provided".
        for(const r of samples){
            if(looksLikeRemoteSingle(singleCellText(ws.getRow(r).getCell(5))))return 5;
        }
    }
    if(iframeCol>1 && counts.has(iframeCol-1))return iframeCol-1;
    let selected=null,highest=0;
    for(const [col,n] of counts)if(n>highest){selected=col;highest=n;}
    return selected;
}
function readJobs(workbook){
    const sheets=[],jobs=[];
    for(const ws of workbook.worksheets){
        // Do not reprocess legacy duplicate summary sheets from older versions.
        if(ws.name==="HTML_RESULTS" && cellText(ws.getRow(1).getCell(1))==="Iframe Input")continue;
        const col=iframeColumn(ws);
        if(!col)continue;
        const singleCol=findSingleCol(ws,col);
        const overrideCol=detectHeaderColumn(ws,HEADER_LINEUP,col);
        const hasHeader=!looksLikeIframe(cellText(ws.getRow(1).getCell(col)));
        const isRak1Format=col===3 && singleCol===5;
        const sheet={ws,name:ws.name,iframeCol:col,singleCol,overrideCol,hasHeader,isRak1Format};
        sheets.push(sheet);
        for(let r=1;r<=ws.rowCount;r++){
            const row=ws.getRow(r);
            const raw=cellText(row.getCell(col));
            const validIframe=looksLikeIframe(raw);
            // Do not silently skip #VALUE! (or other Excel formula errors)
            // in column C of the user's 5-column product workbook.
            const invalidSource=isRak1Format && r>1 && /^#(?:VALUE!|REF!|N\/A|NAME\?|DIV\/0!|NUM!|NULL!)/i.test(raw) &&
                (cellText(row.getCell(1)) || cellText(row.getCell(2)));
            if(!validIframe && !invalidSource)continue;
            if(jobs.length>=MAX_ROWS)throw new Error(`Workbook has more than ${MAX_ROWS.toLocaleString()} product rows. Divide into smaller files.`);
            const overrideRaw=overrideCol?cellText(row.getCell(overrideCol)):"";
            const job={sheet:ws.name,row:r,raw,sourceCol:col,
                singlePath:singleCol?singleCellText(row.getCell(singleCol)):"",
                lineupCount:overrideRaw!==""?overrideRaw:null};
            if(invalidSource)job.inputError=`Iframe source error in ${ws.name}!C${r}: ${raw}. Fix the original Excel iframe formula/source; this product was not converted.`;
            else try{job.url=iframeUrl(raw);}catch(e){job.inputError=e.message;}
            jobs.push(job);
        }
    }
    if(!jobs.length)throw new Error("No Rakuten GOLD iframe blocks found. Add a column named IFRAME containing full <iframe ...></iframe> code.");
    return {sheets,jobs,singleCount:jobs.filter(x=>Boolean(x.singlePath)).length,
        invalidIframeCount:jobs.filter(x=>Boolean(x.inputError)).length};
}
function colFilled(ws,col){
    for(let r=1;r<=ws.rowCount;r++){
        const v=ws.getRow(r).getCell(col).value;
        if(v!==null&&v!==undefined&&String(v).trim()!=="")return true;
    }
    return false;
}
function setHeader(ws,col,title){
    const cell=ws.getRow(1).getCell(col);cell.value=title;
    cell.font={name:"Aptos",bold:true,color:{argb:"FFFFFFFF"}};
    cell.fill={type:"pattern",pattern:"solid",fgColor:{argb:"FF24364B"}};
    cell.alignment={vertical:"middle"};
    ws.getRow(1).height=Math.max(24,ws.getRow(1).height||0);
}
function reserveAdjacent(ws,col,title,hasHeader){
    const current=normHeader(cellText(ws.getRow(1).getCell(col))).toUpperCase();
    if(hasHeader && current===title)return col;
    if(colFilled(ws,col))ws.spliceColumns(col,0,[]);
    if(hasHeader)setHeader(ws,col,title);
    return col;
}
function appendQc(ws,title,hasHeader){
    if(hasHeader)for(let col=1;col<=ws.columnCount;col++)if(normHeader(cellText(ws.getRow(1).getCell(col))).toUpperCase()===title)return col;
    const col=ws.columnCount+1;
    if(hasHeader)setHeader(ws,col,title);
    return col;
}
function setLink(cell,filePath,label){
    if(!filePath){cell.value=null;return;}
    cell.value={text:path.basename(filePath),hyperlink:pathToFileURL(filePath).href,
        tooltip:`Open ${label}`};
    cell.font={name:"Aptos",underline:true,color:{argb:"FF1568AA"}};
}
function canUseRak1OutputColumn(ws,hasHeader){
    // Preserve all original data. D is blank in the supplied workbook.
    for(let r=1;r<=ws.rowCount;r++){
        const value=cellText(ws.getRow(r).getCell(4));
        if(!value)continue;
        if(hasHeader && r===1 && normHeader(value).toUpperCase()==="OUTPUT")continue;
        if(r>1 && /^<(?:table|!doctype|html)\b/i.test(value))continue;
        return false;
    }
    return true;
}
function resultLinkColumn(ws,title,minimum){
    for(let c=minimum;c<=ws.columnCount;c++){
        if(normHeader(cellText(ws.getRow(1).getCell(c))).toUpperCase()===title)return c;
    }
    return Math.max(ws.columnCount+1,minimum);
}
function writeResults(workbook,sheets,results){
    const bySheet=new Map();
    for(const result of results){
        if(!bySheet.has(result.sheet))bySheet.set(result.sheet,[]);
        bySheet.get(result.sheet).push(result);
    }
    for(const info of sheets){
        const {ws,iframeCol,hasHeader,isRak1Format}=info;
        let htmlCol,linkCol,jpegCol;
        if(isRak1Format){
            // Received sheet: A/B identifiers; C iframe; D OUTPUT; E Single.
            // Reuse D and append file links after E, never splice or move E.
            if(!canUseRak1OutputColumn(ws,hasHeader))
                throw new Error(`${info.name}: column D is not blank/OUTPUT. Refusing to overwrite data or move Single URLs in column E.`);
            htmlCol=4;
            if(hasHeader)setHeader(ws,htmlCol,"OUTPUT");
            linkCol=resultLinkColumn(ws,"HTML FILE LINK",6);
            if(hasHeader)setHeader(ws,linkCol,"HTML FILE LINK");
            jpegCol=resultLinkColumn(ws,"JPEG FILE LINK",Math.max(linkCol+1,6));
            if(hasHeader)setHeader(ws,jpegCol,"JPEG FILE LINK");
        } else {
            htmlCol=reserveAdjacent(ws,iframeCol+1,"OUTPUT",hasHeader);
            linkCol=reserveAdjacent(ws,iframeCol+2,"HTML FILE LINK",hasHeader);
            jpegCol=reserveAdjacent(ws,iframeCol+3,"JPEG FILE LINK",hasHeader);
        }
        ws.getColumn(htmlCol).width=95;
        ws.getColumn(linkCol).width=42;
        ws.getColumn(jpegCol).width=42;
        const qc={};
        let headerlessNext=Math.max(ws.columnCount,jpegCol)+1;
        for(const title of QC_HEADERS)qc[title]=hasHeader?appendQc(ws,title,true):headerlessNext++;
        ws.getColumn(qc["STATUS"]).width=13;
        ws.getColumn(qc["JPEG STATUS"]).width=19;
        ws.getColumn(qc["SINGLE STATUS"]).width=21;
        ws.getColumn(qc["DETECTED LINE UP"]).width=17;
        ws.getColumn(qc["DETECTED DETAILS"]).width=17;
        ws.getColumn(qc["SPLIT METHOD"]).width=26;
        ws.getColumn(qc["REVIEW / ERROR"]).width=85;
        ws.getColumn(qc["ISSUE CODES"]).width=44;
        ws.getColumn(qc["JPEG HEIGHT (PX)"]).width=20;
        ws.getColumn(qc["BROKEN DETAIL URLS"]).width=100;
        // Reviewer-controlled count for difficult groups. Leave blank by
        // default; editing it and rerunning the results workbook overrides
        // auto classification without changing the original source columns.
        const manualCol=appendQc(ws,"LINEUP COUNT",hasHeader);
        ws.getColumn(manualCol).width=16;
        for(const entry of bySheet.get(info.name)||[]){
            const row=ws.getRow(entry.row);
            const codeCell=row.getCell(htmlCol);
            codeCell.value=(entry.code||"").length<=MAX_EXCEL_CELL?entry.code||"":"";
            codeCell.alignment={vertical:"top",wrapText:false};
            setLink(row.getCell(linkCol),entry.htmlFile,"HTML file");
            setLink(row.getCell(jpegCol),entry.jpegFile,"JPEG file");
            row.getCell(qc["STATUS"]).value=entry.status;
            row.getCell(qc["STATUS"]).font={bold:true,color:{argb:entry.status==="READY"?"FF167946":entry.status==="REVIEW"?"FFC47A16":"FFAF3039"}};
            row.getCell(qc["JPEG STATUS"]).value=entry.jpegStatus||"NOT GENERATED";
            row.getCell(qc["SINGLE STATUS"]).value=entry.singleStatus||"OPTIONAL / NONE";
            row.getCell(qc["DETECTED LINE UP"]).value=entry.lineupCount??"";
            row.getCell(qc["DETECTED DETAILS"]).value=entry.detailsCount??"";
            row.getCell(qc["SPLIT METHOD"]).value=entry.method||"";
            const warn=row.getCell(qc["REVIEW / ERROR"]);
            warn.value=String(entry.warning||"").slice(0,MAX_EXCEL_CELL);
            row.getCell(qc["ISSUE CODES"]).value=(entry.issues||[]).map(x=>x.code).join(" | ");
            row.getCell(qc["JPEG HEIGHT (PX)"]).value=entry.jpegHeight??null;
            const broken=row.getCell(qc["BROKEN DETAIL URLS"]);
            broken.value=(entry.brokenImages||[]).join("\n").slice(0,MAX_EXCEL_CELL);
            broken.alignment={vertical:"top",wrapText:true};
        }
        if(hasHeader){ws.views=[{state:"frozen",ySplit:1}];}
    }
}
module.exports={readJobs,writeResults,looksLikeIframe,cellText,findSingleCol,canUseRak1OutputColumn,MAX_EXCEL_CELL,QC_HEADERS};
