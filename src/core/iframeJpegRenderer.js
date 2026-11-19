"use strict";

// Combine JPEG visual export: a separate legacy-style 600px render document.
// The published HTML stays in its original 780px 2-column / 3-column layout.
// No intermediate image assets, Photoshop, or JSX are used.
const sharp = require("sharp");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {WIDTH} = require("./iframeJpegLayout");

const MAX_HEIGHT = 52000; // JPEG and Chromium safety bound (tall pages use tiles).
const IMAGE_WAIT_MS = 35000;
const PAINT_WAIT_MS = 110;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// Functions are deliberately independent so they can be tested without Electron.
function validateImageState(state, expectedImages) {
    if (!state || !Number.isInteger(state.total) || !Number.isInteger(state.loaded) ||
        !Number.isInteger(state.failed)) throw new Error("JPEG renderer returned invalid image diagnostics.");
    if (expectedImages !== undefined && state.total !== expectedImages)
        throw new Error(`JPEG: expected ${expectedImages} image(s), found ${state.total} in generated HTML.`);
    if (state.failed > 0 || state.loaded !== state.total) {
        const first = Array.isArray(state.failedUrls) ? state.failedUrls.slice(0, 3).join(" | ") : "";
        throw new Error(`JPEG: ${state.failed || state.total - state.loaded} image(s) did not load. ${first}`.trim());
    }
}
function validatePageHeight(height) {
    if (!Number.isFinite(height) || height < 1 || height > MAX_HEIGHT)
        throw new Error(`JPEG page height ${height} exceeds the supported ${MAX_HEIGHT}px limit or is invalid.`);
    return Math.ceil(height);
}

// Reject a visually broken gallery before publishing a JPEG. These bounds are
// measured by Chromium AFTER every image has loaded, not inferred from HTML.
function validateSingleFlushGeometry(diag){
    if(!diag?.single)return true;
    const {container,image}=diag.single;
    if(!container||!image || ![container.x,container.y,container.w,container.h,image.x,image.y,image.w,image.h,diag.galleryY].every(Number.isFinite))
        throw new Error("JPEG Existing Brand: invalid Single geometry.");
    // Only the gallery has side margins: the Single must touch the canvas top and BOTH sides.
    if(Math.abs(container.x)>1||Math.abs(container.y)>1||Math.abs(container.w-WIDTH)>1||
        Math.abs(image.x)>1||Math.abs(image.y)>1||Math.abs(image.w-WIDTH)>1||
        Math.abs(container.h-image.h)>2)
        throw new Error("JPEG Existing Brand: Single is not flush with the top and sides.");
    if(Math.abs(diag.galleryY-(container.y+container.h)-15)>2)
        throw new Error("JPEG Existing Brand: the Single-to-gallery gap is not 15px.");
    return true;
}
function validateTwoColumnGeometry(diag,expectedGalleryImages){
    if(!diag||!Array.isArray(diag.tiles)||diag.columns!==2 ||
       !(Math.abs(diag.galleryWidth-594)<2))
        throw new Error("JPEG Existing Brand: two-column gallery did not render correctly.");
    validateSingleFlushGeometry(diag);
    if(Number.isInteger(expectedGalleryImages)&&diag.tiles.length!==expectedGalleryImages)
        throw new Error(`JPEG Existing Brand: expected ${expectedGalleryImages} gallery images, got ${diag.tiles.length}.`);
    for(let i=0;i<diag.tiles.length;i++){
        const t=diag.tiles[i],side=i%2;
        if(!Number.isFinite(t.x)||!Number.isFinite(t.y)||!Number.isFinite(t.w)||!Number.isFinite(t.h)||
            Math.abs(t.w-293)>2||t.h<1||Math.abs(t.x-(diag.galleryX+side*301))>2)
            throw new Error(`JPEG Existing Brand: gallery tile ${i+1} is outside its fixed column.`);
        if(side===1 && Math.abs(t.y-diag.tiles[i-1].y)>2)
            throw new Error(`JPEG Existing Brand: images ${i} and ${i+1} did not share the same row.`);
        if(side===0 && i>=2){
            const upper=diag.tiles.slice(i-2,i);
            const minY=Math.max(...upper.map(p=>p.y+p.h))+6;
            if(t.y<minY)
                throw new Error(`JPEG Existing Brand: row ${Math.floor(i/2)+1} overlaps or misses the vertical gap.`);
        }
    }
    return true;
}

class ElectronJpegRenderer {
    constructor({ BrowserWindow = null, paintWaitMs = PAINT_WAIT_MS, imageWaitMs = IMAGE_WAIT_MS } = {}) {
        this.BrowserWindow = BrowserWindow;
        this.paintWaitMs = paintWaitMs;
        this.imageWaitMs = imageWaitMs;
        this.window = null;
    }
    ensureWindow() {
        if (this.window && !this.window.isDestroyed()) return this.window;
        if (!this.BrowserWindow) {
            const electron = require("electron");
            if (!electron || typeof electron.BrowserWindow !== "function")
                throw new Error("Full-page JPEG rendering must run in the Electron main process.");
            this.BrowserWindow = electron.BrowserWindow;
        }
        this.window = new this.BrowserWindow({
            width: WIDTH, height: 1000, useContentSize: true, show: false,
            backgroundColor: "#ffffff", paintWhenInitiallyHidden: true,
            webPreferences: {
                offscreen: true, sandbox: true, contextIsolation: true,
                nodeIntegration: false, webSecurity: true,
                backgroundThrottling: false
            }
        });
        const wc = this.window.webContents;
        wc.setWindowOpenHandler(() => ({ action: "deny" }));
        wc.on("will-navigate", (event) => event.preventDefault());
        return this.window;
    }
    async waitForImages(webContents, expected) {
        // This runs inside the inert HTML output document; it does not execute
        // scripts from the original Rakuten iframe page.
        const script = `new Promise(resolve => {
            const images = Array.from(document.querySelectorAll('img'));
            let pending = images.length;
            let finished = false;
            const settle = () => {
                if (finished || pending > 0) return;
                finished = true;
                clearTimeout(timer);
                const failedUrls = images.filter(x => !x.complete || x.naturalWidth < 1)
                    .map(x => x.currentSrc || x.src);
                resolve({total:images.length,loaded:images.length-failedUrls.length,
                    failed:failedUrls.length,failedUrls});
            };
            const timer = setTimeout(() => {
                pending = 0;
                settle();
            }, ${Number(this.imageWaitMs)});
            for (const img of images) {
                if (img.complete) { pending--; continue; }
                const ready = () => { pending--; settle(); };
                img.addEventListener('load', ready, {once:true});
                img.addEventListener('error', ready, {once:true});
            }
            settle();
        })`;
        const state = await webContents.executeJavaScript(script, true);
        validateImageState(state, expected);
        return state;
    }
    async verifyTwoColumns(webContents,expectedGalleryImages) {
        const diag=await webContents.executeJavaScript(`(() => {
            const gallery=document.querySelector('.eb-gallery');
            if(!gallery)return null;
            const g=gallery.getBoundingClientRect();
            const columns=getComputedStyle(gallery).gridTemplateColumns.trim().split(/\s+/).length;
            const tiles=Array.from(gallery.querySelectorAll('.eb-image')).map(el=>{
                const r=el.getBoundingClientRect();
                return {x:r.x,y:r.y,w:r.width,h:r.height};
            });
            const single=document.querySelector('.bf-single');
            const s=single?.getBoundingClientRect(),i=single?.querySelector('img')?.getBoundingClientRect();
            return {galleryX:g.x,galleryY:g.y,galleryWidth:g.width,columns,tiles,
                single:single?{container:{x:s.x,y:s.y,w:s.width,h:s.height},
                  image:{x:i.x,y:i.y,w:i.width,h:i.height}}:null};
        })()`,true);
        validateTwoColumnGeometry(diag,expectedGalleryImages);
        return diag;
    }
    async measure(webContents) {
        const d = await webContents.executeJavaScript(`(() => {
            const main = document.querySelector('main.bf-page');
            if (!main) return { width: 0, height: 0 };
            const rect = main.getBoundingClientRect();
            // body/document scrollHeight is at least the previous viewport
            // height when an Electron BrowserWindow is reused for a new row.
            // Use the actual generated Combine content bounds instead.
            return { width: Math.ceil(Math.max(rect.width, main.scrollWidth)),
                     height: Math.ceil(Math.max(rect.height, main.scrollHeight)) };
        })()`, true);
        if (d.width > WIDTH + 4)
            throw new Error(`JPEG document width is ${d.width}px (expected ${WIDTH}px). Review layout before screenshot.`);
        return { width: WIDTH, height: validatePageHeight(d.height) };
    }
    async captureImage(webContents) {
        await sleep(this.paintWaitMs);
        const image = await webContents.capturePage();
        if (!image || image.isEmpty()) throw new Error("Electron returned an empty page capture.");
        // Normalize DPI/Windows display scaling to exactly 600 output pixels.
        return sharp(image.toPNG()).resize({width:WIDTH}).png().toBuffer();
    }
    async capture(htmlFile, outputJpeg, {expectedImages,renderHtml}={}) {
        let tempDir = null;
        try {
        let sourcePath = htmlFile;
        if (renderHtml != null) {
            if (typeof renderHtml !== "string" || renderHtml.length > 2500000 ||
                !renderHtml.includes("<main class=\"bf-page\">"))
                throw new Error("JPEG render document is invalid.");
            tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "standalone-combine-jpeg-"));
            sourcePath = path.join(tempDir, "legacy-combine.html");
            await fs.promises.writeFile(sourcePath, renderHtml, {encoding:"utf8",flag:"wx"});
        }
        const window = this.ensureWindow();
        const wc = window.webContents;
        // A previous product may have left a very tall viewport. Reset before
        // loading each new document to avoid blank space in the next JPEG.
        window.setContentSize(WIDTH, 1000);
        await wc.loadFile(sourcePath);
        await this.waitForImages(wc, expectedImages);
        // Detect accidental one-column wrapping before it becomes a released JPG.
        if(renderHtml && renderHtml.includes('class="eb-gallery"')){
            const hasSingle=renderHtml.includes('class="bf-single"');
            const galleryCount=Number.isInteger(expectedImages)?expectedImages-(hasSingle?1:0):undefined;
            await this.verifyTwoColumns(wc,galleryCount);
        }
        const {height} = await this.measure(wc);
        let data;
        if (height <= 4500) {
            window.setContentSize(WIDTH, height);
            await wc.executeJavaScript("window.scrollTo(0,0)", true);
            const screenshot = await this.captureImage(wc);
            const screenshotHeight=(await sharp(screenshot).metadata()).height;
            if (screenshotHeight < height)
                throw new Error(`JPEG capture is too short (${screenshotHeight}px vs expected ${height}px).`);
            data = await sharp(screenshot).extract({left:0,top:0,width:WIDTH,height}).flatten({background:"#ffffff"}).jpeg({quality:91,mozjpeg:true}).toBuffer();
        } else {
            const viewportHeight = 1350;
            window.setContentSize(WIDTH, viewportHeight);
            const chunks=[];
            for(let y=0; y<height; y+=viewportHeight) {
                const scrollY=Math.max(0,Math.min(y,height-viewportHeight));
                await wc.executeJavaScript(`window.scrollTo(0,${scrollY})`, true);
                const screenshot=await this.captureImage(wc);
                const {height: screenshotHeight} = await sharp(screenshot).metadata();
                const top=y-scrollY;
                const take=Math.min(height-y,viewportHeight);
                if (screenshotHeight < top+take)
                    throw new Error(`JPEG tile capture is incomplete at y=${y}.`);
                const tile=await sharp(screenshot).extract({left:0,top,width:WIDTH,height:take}).png().toBuffer();
                chunks.push({input:tile,left:0,top:y});
            }
            data=await sharp({create:{width:WIDTH,height,channels:3,background:"#ffffff"}})
                .composite(chunks).jpeg({quality:91,mozjpeg:true}).toBuffer();
        }
        // Do not publish half-written JPEGs.
        const partial=outputJpeg+".partial";
        try {
            await fs.promises.writeFile(partial,data,{flag:"wx"});
            const metadata=await sharp(partial).metadata();
            if(metadata.format!=="jpeg"||metadata.width!==WIDTH||metadata.height!==height)
                throw new Error("JPEG verification failed after writing.");
            await fs.promises.rename(partial,outputJpeg);
            return {width:WIDTH,height,bytes:data.length};
        } catch(e) {
            await fs.promises.rm(partial,{force:true}).catch(()=>{});
            throw e;
        }
        } finally {
            if (tempDir) await fs.promises.rm(tempDir,{recursive:true,force:true}).catch(()=>{});
        }
    }
    async close() {
        const w=this.window;this.window=null;
        if(w && !w.isDestroyed()) w.destroy();
    }
}
module.exports={ElectronJpegRenderer, validateImageState, validatePageHeight, validateTwoColumnGeometry, validateSingleFlushGeometry, WIDTH, MAX_HEIGHT};
