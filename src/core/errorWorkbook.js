"use strict";
// Independent issue-only workbook: never mutate or overwrite the source Excel.
// Hyperlinks preserve the exact original iframe and Single URL when available.
const path=require('path');
const {pathToFileURL}=require('url');
const COLUMNS=[
    ['PRODUCT ID',20],['SOURCE SHEET',24],['SOURCE ROW',14],['STATUS',14],
    ['ISSUE CODES',38],['IFRAME SOURCE',85],['IFRAME URL',85],
    ['SINGLE URL / PATH',85],['BROKEN DETAIL URLS',100],
    ['JPEG HEIGHT (PX)',19],['JPEG FILE',42],['HTML FILE',42],['ERROR DETAILS',110]
];
function addSheet(book,name){
    if(typeof book.addWorksheet==='function')return book.addWorksheet(name);
    // Minimal workbooks used by the source-only test suite don't implement
    // addWorksheet; construct their normal Worksheet type instead.
    if(!Array.isArray(book.worksheets) || book.worksheets.length===0)
        throw new Error('Workbook does not support adding a worksheet.');
    const Sheet=book.worksheets[0].constructor;
    const sheet=new Sheet(name,[]);
    book.worksheets.push(sheet);
    return sheet;
}
function newErrorWorkbook(source){
    const book=new source.constructor([]);
    if(typeof book.addWorksheet==='function')return book;
    // Test doubles require a prototype worksheet to construct standalone tabs.
    if(!Array.isArray(book.worksheets))throw new Error('Cannot construct errors-only workbook.');
    const prototype=source.worksheets?.[0];
    if(!prototype)throw new Error('Cannot construct errors-only worksheet.');
    book.worksheets.push(new prototype.constructor('ALL_ISSUES',[]));
    return book;
}
function link(cell,text,href){
    const display=String(text||'').slice(0,32767);
    if(!display)return;
    if(typeof href==='string'&&/^(?:https:\/\/|file:\/\/)/i.test(href)){
        cell.value={text:display,hyperlink:href};
        cell.font={name:'Aptos',color:{argb:'FF1568AA'},underline:true};
    } else cell.value=display;
}
function fileLink(cell,file){
    if(file)link(cell,path.basename(file),pathToFileURL(file).href);
}
function initSheet(sheet){
    COLUMNS.forEach(([title,width],i)=>{
        const col=i+1;sheet.getColumn(col).width=width;
        const cell=sheet.getRow(1).getCell(col);cell.value=title;
        cell.font={name:'Aptos',bold:true,color:{argb:'FFFFFFFF'}};
        cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF25354B'}};
        cell.alignment={vertical:'middle'};
    });
    sheet.getRow(1).height=28;
    sheet.views=[{state:'frozen',ySplit:1}];
    if(typeof sheet.autoFilter!=='undefined')sheet.autoFilter={from:'A1',to:'M1'};
}
function classifyIssueTab(issues){
    const keys=issues.map(x=>x.code);
    if(keys.some(x=>x.startsWith('SINGLE_')))return 'SINGLE_ERRORS';
    if(keys.some(x=>x.startsWith('IFRAME_')||x.startsWith('DETAIL_')))return 'IFRAME_ERRORS';
    if(keys.includes('HEIGHT_OVER_3800'))return 'HEIGHT_REVIEW';
    return 'OTHER_ERRORS';
}
function originalSingle(result){return String(result.singlePath||'').trim();}
function originalIframe(result){return String(result.raw||'').trim();}
function issueRow(sheet,n,result){
    const cells=sheet.getRow(n);
    const issues=Array.isArray(result.issues)?result.issues:[];
    const codes=issues.map(x=>x.code).filter(Boolean);
    const urls=[...new Set(issues.filter(x=>x.code==='DETAIL_IMAGE_BROKEN'&&x.url).map(x=>x.url))];
    const values=[result.outputId||'',result.sheet||'',result.row||'',result.status||'',codes.join(' | ')];
    values.forEach((v,i)=>{cells.getCell(i+1).value=v;});
    link(cells.getCell(6),originalIframe(result));
    link(cells.getCell(7),result.url||'',result.url||'');
    const single=originalSingle(result);
    link(cells.getCell(8),single,/^https:\/\//i.test(single)?single:'');
    cells.getCell(9).value=urls.join('\n').slice(0,32767);
    cells.getCell(10).value=Number.isInteger(result.jpegHeight)?result.jpegHeight:null;
    fileLink(cells.getCell(11),result.jpegFile);
    fileLink(cells.getCell(12),result.htmlFile);
    cells.getCell(13).value=String(result.warning||'').slice(0,32767);
    for(const column of [5,6,9,13])cells.getCell(column).alignment={vertical:'top',wrapText:true};
}
async function writeErrorWorkbook(sourceWorkbook,results,filename){
    const book=newErrorWorkbook(sourceWorkbook);
    const all=typeof book.addWorksheet==='function'?addSheet(book,'ALL_ISSUES'):book.worksheets[0];
    const issues=results.filter(x=>x.status!=='READY');
    const grouped=new Map([['SINGLE_ERRORS',[]],['IFRAME_ERRORS',[]],['HEIGHT_REVIEW',[]],['OTHER_ERRORS',[]]]);
    for(const result of issues){
        const keys=new Set((result.issues||[]).map(x=>x.code));
        // A row can appear on more than one category tab if it has multiple problems.
        if([...keys].some(x=>x.startsWith('SINGLE_')))grouped.get('SINGLE_ERRORS').push(result);
        if([...keys].some(x=>x.startsWith('IFRAME_')||x.startsWith('DETAIL_')))grouped.get('IFRAME_ERRORS').push(result);
        if(keys.has('HEIGHT_OVER_3800'))grouped.get('HEIGHT_REVIEW').push(result);
        if(![...grouped.values()].some(rows=>rows.includes(result)))grouped.get('OTHER_ERRORS').push(result);
    }
    initSheet(all);issues.forEach((r,i)=>issueRow(all,i+2,r));
    for(const [name,rows] of grouped){
        const ws=addSheet(book,name);initSheet(ws);
        rows.forEach((r,i)=>issueRow(ws,i+2,r));
    }
    await book.xlsx.writeFile(filename);
    return {rows:issues.length,byType:Object.fromEntries([...grouped].map(([name,rows])=>[name,rows.length]))};
}
module.exports={writeErrorWorkbook,COLUMNS,originalIframe,originalSingle,classifyIssueTab};
