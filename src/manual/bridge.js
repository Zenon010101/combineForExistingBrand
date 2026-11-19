"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const { buildJsxLaunchVbs, explainFailure } = require("./photoshopCom");

function jsxString(value) { return JSON.stringify(String(value).replace(/\\/g, "/")); }
function vbsString(value) { return '"' + String(value).replace(/"/g, '""') + '"'; }

let previous = Promise.resolve();
function runPhotoshopJSX(scriptBody, label = "Landing Page PSD", timeoutMs = 900000) {
    const pending = previous.then(() => runDirect(scriptBody, label, timeoutMs));
    previous = pending.catch(() => {});
    return pending;
}

async function runDirect(body, label, timeoutMs) {
    if (process.platform !== "win32") throw new Error("PSD generation requires Adobe Photoshop installed on Windows.");
    const folder = await fs.promises.mkdtemp(path.join(os.tmpdir(), "brandforge-lp-jsx-"));
    const source = path.join(folder, "worker.jsx");
    const launch = path.join(folder, "launch.vbs");
    const status = path.join(folder, "status.txt");
    const wrapped = `#target photoshop\n` +
        `var __oldDialogs = app.displayDialogs; app.displayDialogs = DialogModes.NO;\n` +
        `function __result(s) { var f = new File(${jsxString(status)}); f.encoding = "UTF8"; if (!f.open("w")) throw new Error("Could not write status file"); f.write(String(s)); f.close(); }\n` +
        `try {\n${body.replace(/^\s*#target\s+photoshop[^\n]*\n?/i, "")}\n__result("OK");\n` +
        `} catch(e) { var msg = String(e && e.message ? e.message : e); try { if (e.line) msg += " (JSX line " + e.line + ")"; } catch(ignore) {} __result("ERROR\\n" + msg); }\n` +
        `finally { app.displayDialogs = __oldDialogs; }`;
    const vbs = buildJsxLaunchVbs(source, { variableName: "p" });
    await fs.promises.writeFile(source, wrapped, "utf8");
    await fs.promises.writeFile(launch, "\uFEFF" + vbs, "utf16le");
    try {
        const childResult = await new Promise((resolve, reject) => {
            const child = spawn("cscript.exe", ["//nologo", launch], { windowsHide: true });
            let output = "";
            let settled = false;
            const timeout = setTimeout(() => {
                child.kill();
                settle(new Error(`${label} timed out after ${Math.round(timeoutMs / 60000)} minutes. Check Photoshop for a dialog or stalled operation.`));
            }, timeoutMs);
            function settle(error, value) {
                if (settled) return;
                settled = true; clearTimeout(timeout);
                if (error) reject(error); else resolve(value);
            }
            child.on("error", settle);
            child.stdout.on("data", chunk => { output = (output + chunk.toString()).slice(-8000); });
            child.stderr.on("data", chunk => { output = (output + chunk.toString()).slice(-8000); });
            child.on("close", code => settle(null, { code, output }));
        });
        let reply = "";
        try { reply = (await fs.promises.readFile(status, "utf8")).replace(/^\uFEFF/, "").trim(); }
        catch (_) { throw new Error(`${label}: Photoshop did not write a result. ${explainFailure({code: childResult.code, stdout: childResult.output}, label)}`); }
        if (/^ERROR(?:\s|$)/.test(reply)) throw new Error(`${label}: ${reply.slice(5).trim()}`);
        if (childResult.code !== 0 || reply !== "OK") throw new Error(`${label}: ${explainFailure({code: childResult.code, stdout: childResult.output}, label)} ${reply}`);
    } finally {
        await fs.promises.rm(folder, { recursive: true, force: true }).catch(() => {});
    }
}


module.exports={runPhotoshopJSX};
