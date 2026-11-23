"use strict";

// Recover a product ID only when multiple, independent Excel/URL signals
// agree. Excel converts SKU MAR-90 to 1990-03-01 (serial 32933). An Excel
// CONCAT formula may then turn the Single URL into .../glv_32933 instead of
// .../glv_mar-90. Do not interpret that date serial as a valid SKU.
const {productIdFromSources,safeProductId}=require('./outputNaming');

const MONTHS=['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
const MS_PER_DAY=86400000;
const EPOCH_1900=Date.UTC(1899,11,30);
const EPOCH_1904=Date.UTC(1904,0,1);

function dateFormatShowsMonthYear(format){
    const cleaned=String(format||'').replace(/\\([a-z-])/gi,'$1').replace(/\[[^\]]*\]/g,'')
        .replace(/"[^"]*"/g,'').replace(/;.*$/,'');
    return /m{3,4}\s*[-\/. ]\s*yy(?!y)/i.test(cleaned);
}
function excelSerial(date,{date1904=false}={}){
    if(!(date instanceof Date)||!Number.isFinite(date.getTime()))return null;
    const midnight=Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),date.getUTCDate());
    return Math.round((midnight-(date1904?EPOCH_1904:EPOCH_1900))/MS_PER_DAY);
}
function dateFromExcelSerial(serial,{date1904=false}={}){
    if(!Number.isInteger(serial)||serial<1||serial>2958465)return null;
    return new Date((date1904?EPOCH_1904:EPOCH_1900)+serial*MS_PER_DAY);
}
function normalizePlainSku(value){
    const raw=String(value||'').trim();
    try{return safeProductId(raw);}catch{return null;}
}
function cellSkuInfo(cell,{date1904=false}={}){
    const raw=cell?.value;
    const value=(raw&&typeof raw==='object'&&!(raw instanceof Date)&&raw.result!==undefined)?raw.result:raw;
    const numFmt=String(cell?.numFmt||'');
    const monthYear=dateFormatShowsMonthYear(numFmt);
    let date=value instanceof Date?value:null;
    if(!date&&typeof value==='number'&&monthYear)date=dateFromExcelSerial(value,{date1904});
    if(date&&Number.isFinite(date.getTime())){
        const serial=excelSerial(date,{date1904});
        const display=monthYear&&date.getUTCDate()===1?
            `${MONTHS[date.getUTCMonth()]}-${String(date.getUTCFullYear()%100).padStart(2,'0')}`:null;
        return {date:true,display,serial,iso:date.toISOString().slice(0,10),numFmt,
            label:display?`${display} [Excel date ${date.toISOString().slice(0,10)}]`:
                `[Excel date ${date.toISOString().slice(0,10)}]`};
    }
    const text=typeof value==='string'?value.trim():typeof value==='number'?String(value):'';
    return {date:false,display:null,serial:null,iso:null,numFmt,label:text,sku:normalizePlainSku(text)};
}
function sameId(a,b){return Boolean(a&&b&&String(a).toLowerCase()===String(b).toLowerCase());}
function candidateFromIframe(iframeUrl){
    if(!iframeUrl)return null;
    try{return productIdFromSources('',iframeUrl);}catch{return null;}
}
function candidateFromYahoo(url){
    if(typeof url!=='string'||!/^https:\/\//i.test(url))return null;
    try{
        const parsed=new URL(url);
        if(parsed.hostname.toLowerCase()!=='item-shopping.c.yimg.jp')return null;
        return productIdFromSources(url,'');
    }catch{return null;}
}
function correctedYahooSingle(url,sku){
    const parsed=new URL(url);
    if(parsed.protocol!=='https:'||parsed.hostname.toLowerCase()!=='item-shopping.c.yimg.jp')return null;
    const last=decodeURIComponent(parsed.pathname.split('/').pop()||'');
    const underscore=last.indexOf('_');
    if(underscore<1||underscore===last.length-1)return null;
    const prefix=last.slice(0,underscore+1);
    const fixed=normalizePlainSku(sku);
    if(!fixed)return null;
    parsed.pathname=parsed.pathname.slice(0,parsed.pathname.lastIndexOf('/')+1)+encodeURIComponent(prefix+fixed.toLowerCase());
    parsed.hash='';
    return parsed.href;
}
function inspectProductRow(row,{date1904=false}={}){
    return [1,2].map(col=>({...cellSkuInfo(row.getCell(col),{date1904}),column:col}));
}
function resolveSkuIdentity(job){
    const original=String(job.singlePath||'');
    const info=Array.isArray(job.skuCells)?job.skuCells:[];
    const dated=info.filter(x=>x.date);
    const labels=info.map(x=>x.label||'');
    const iframeId=candidateFromIframe(job.url||'');
    const yahooId=candidateFromYahoo(original);
    // The text may already have been corrected in one column while another
    // cell/formula still contains an Excel date serial (for example a pasted
    // MAR-90 text value paired with a stale glv_32933 Yahoo URL).
    const textSerialMatch=info.find(x=>{
        if(x.date||!x.sku||!/^\d+$/.test(yahooId||''))return false;
        const m=/^(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)-(\d{2})$/i.exec(x.sku);
        if(!m)return false;
        const d=dateFromExcelSerial(Number(yahooId));
        return Boolean(d&&d.getUTCDate()===1&&MONTHS[d.getUTCMonth()]===m[1].toUpperCase()&&
            d.getUTCFullYear()%100===Number(m[2])&&(!iframeId||sameId(iframeId,x.sku)));
    });
    let fallback=null;
    try{fallback=productIdFromSources(original,job.url||'');}catch{}
    let outputId=fallback;
    let effectiveSinglePath=original;
    let resolution='DEFAULT_SOURCE';
    const issues=[];
    const add=(code,detail)=>issues.push({code,detail});

    // Match a date-formatted SKU against the trusted iframe name first.
    const confirmedDate=dated.find(x=>x.display&&sameId(x.display,iframeId));
    if(confirmedDate){
        outputId=iframeId;resolution='EXCEL_DATE_MATCHED_IFRAME';
        add('SKU_EXCEL_DATE_RECOVERED',`Excel converted ${confirmedDate.display} to date ${confirmedDate.iso}; recovered SKU from the Rakuten iframe filename.`);
    }
    // Preserve legacy IDs for ordinary text SKUs. A numeric Yahoo item ID
    // can be legitimate and is NOT grounds to rewrite a URL on its own.
    // Excel sometimes embeds its numeric date serial in Yahoo's Single URL.
    // Rebuild only if the month-year display is unambiguous, the number is
    // EXACTLY the Excel serial, and the iframe (if available) does not
    // contradict that SKU. Never rewrite arbitrary numeric Yahoo product IDs.
    const serialMatch=dated.find(x=>x.display&&x.serial!=null&&sameId(yahooId,String(x.serial))&&
        (!iframeId||sameId(iframeId,x.display))) || (textSerialMatch?{
            display:textSerialMatch.sku.toUpperCase(),serial:Number(yahooId),iso:'(text SKU)',date:false
        }:null);
    if(serialMatch){
        const corrected=correctedYahooSingle(original,iframeId||serialMatch.display);
        if(corrected){
            outputId=iframeId||serialMatch.display.toLowerCase();
            effectiveSinglePath=corrected;
            resolution=iframeId?'EXCEL_DATE_AND_IFRAME_REPAIRED':'EXCEL_DATE_SERIAL_REPAIRED';
            if(!confirmedDate)add('SKU_EXCEL_DATE_RECOVERED',`Recovered ${serialMatch.display} from the source SKU and matching Excel date serial ${serialMatch.serial} in the Yahoo URL.`);
            add('SINGLE_DATE_SERIAL_REPAIRED',`Excel wrote date serial ${serialMatch.serial} into the Yahoo Single URL. Reconstructed ${corrected}; original URL retained in error report.`);
        }
    } else if(dated.length&&!confirmedDate){
        resolution='EXCEL_DATE_UNRESOLVED';
        const first=dated[0];
        add('SKU_DATE_UNRESOLVED',`A product-code cell contains Excel date ${first.iso}. No trustworthy iframe/Single source confirms the original SKU; output ID ${outputId||'(none)'} requires manual review.`);
        if(first.serial!=null&&sameId(yahooId,String(first.serial))){
            // A serial-number URL is almost certainly Excel corruption. Do not
            // download it and present a wrong image as a correct product.
            effectiveSinglePath='';
            add('SINGLE_DATE_SERIAL_SUSPECT',`Yahoo URL suffix ${yahooId} is the Excel date serial, not a verified SKU. Suppressed image download pending manual correction.`);
        }
    }
    if(dated.length>1&&new Set(dated.map(x=>x.iso)).size>1){
        add('SKU_DATE_CONFLICT','SKU columns A and B contain different Excel dates. Verify the original product ID.');
    }
    return {outputId,effectiveSinglePath,sourceSkuA:labels[0]||'',sourceSkuB:labels[1]||'',
        skuResolution:resolution,skuIssues:issues,iframeProductId:iframeId,yahooProductId:yahooId};
}
module.exports={MONTHS,dateFormatShowsMonthYear,excelSerial,dateFromExcelSerial,cellSkuInfo,
    inspectProductRow,resolveSkuIdentity,correctedYahooSingle,candidateFromIframe,candidateFromYahoo,sameId};
