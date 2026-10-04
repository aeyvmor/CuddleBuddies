// Captures app screenshots for the demo video via headless Edge + Chrome DevTools Protocol.
// Usage: node scripts/capture.mjs <live|mock> <url>   (env ASTIG_CAPTURE_PW for live sign-in)
// Live mode is READ-ONLY (sign-in, map, issue detail, analytics). Mock mode runs the work-order flow.
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const [mode, url] = process.argv.slice(2);
const OUT = path.resolve("public");
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const PORT = mode === "live" ? 9333 : 9334;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const edge = spawn(EDGE, [`--remote-debugging-port=${PORT}`, "--headless=new", "--disable-gpu", "--hide-scrollbars", `--user-data-dir=${mkdtempSync(path.join(tmpdir(), "edge-"))}`, "about:blank"], { stdio: "ignore" });
let ws;
try {
  let target;
  for (let i = 0; i < 40 && !target; i++) {
    await sleep(250);
    try { target = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find((t) => t.type === "page"); } catch {}
  }
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener("open", r, { once: true }));
  let id = 0;
  const pending = new Map();
  ws.addEventListener("message", (m) => { const d = JSON.parse(m.data); pending.get(d.id)?.(d); pending.delete(d.id); });
  const cdp = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const js = async (expr) => (await cdp("Runtime.evaluate", { expression: `(async()=>{${expr}})()`, awaitPromise: true, returnByValue: true })).result?.result?.value;
  const shot = async (name) => { const r = await cdp("Page.captureScreenshot", { format: "png" }); writeFileSync(path.join(OUT, name), Buffer.from(r.result.data, "base64")); console.log("saved", name); };
  const helpers = `
    const setVal=(el,v)=>{const p=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el),'value');p.set.call(el,v);el.dispatchEvent(new Event('input',{bubbles:true}));};
    const btn=(t)=>[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===t);
    const byLabel=(t,root=document)=>[...root.querySelectorAll('label')].find(l=>l.textContent.includes(t))?.querySelector('input,textarea');
    const top=(el)=>{window.scrollTo(0, el.getBoundingClientRect().top + scrollY - 16);};`;

  await cdp("Page.enable");
  await cdp("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 2, mobile: false });
  await cdp("Page.navigate", { url });
  await sleep(4000);

  if (mode === "live") {
    await shot("web-signin.png");
    await js(`${helpers} setVal(document.querySelector('input[autocomplete=username]'),'demo-officer'); setVal(document.querySelector('input[autocomplete=current-password]'),${JSON.stringify(process.env.ASTIG_CAPTURE_PW)}); document.querySelector('form[aria-label="Sign in"] button[type=submit]').click();`);
    await sleep(7000);
    await shot("web-dashboard.png");
    await js(`${helpers} top(document.querySelector('[aria-labelledby=issue-map-title]'));`);
    await sleep(2500);
    await shot("web-map.png");
    await js(`${helpers} [...document.querySelectorAll('button[aria-label^="Map marker"]')].find(b=>b.getAttribute('aria-label').includes('Manila')).click();`);
    await sleep(4000);
    await js(`${helpers} top(document.querySelector('article') || document.getElementById('issue-detail'));`);
    await sleep(1500);
    await shot("web-issue.png");
    await js(`${helpers} const b=document.querySelector('[data-testid=region-box]'); if(b){ window.scrollTo(0, b.getBoundingClientRect().top + scrollY - 420); }`);
    await sleep(2500);
    await shot("web-evidence.png");
    await js(`${helpers} const a=document.getElementById('analytics'); if(a) top(a);`);
    await sleep(1500);
    await shot("web-analytics.png");
  } else {
    await js(`${helpers} [...document.querySelectorAll('button[aria-label^="Map marker"]')].find(b=>/Damaged drain/.test(b.getAttribute('aria-label'))).click();`);
    await sleep(1500);
    await js(`${helpers} const a=byLabel('Assigned team'); if(a) setVal(a,'Manila Drainage Maintenance'); top(document.querySelector('[aria-labelledby=work-order-heading]'));`);
    await sleep(800);
    await shot("wo-create.png");
    await js(`${helpers} btn('Create work order').click();`);
    await sleep(1500);
    await js(`${helpers} top(document.querySelector('[aria-labelledby=work-order-heading]'));`);
    await sleep(500);
    await shot("wo-created.png");
    await js(`${helpers} btn('Mark In progress').click();`);
    await sleep(800);
    await js(`${helpers} const d=document.querySelector('[role=dialog]'); setVal(byLabel('Crew',d),'Barangay crew 2'); setVal(byLabel('Inspection findings',d),'Inlet about 70% blocked by plastic and silt. Clearing grate and flushing line.'); d.querySelector('input[type=checkbox]').click();`);
    await sleep(800);
    await shot("wo-inspection.png");
    await js(`${helpers} btn('Confirm and start work').click();`);
    await sleep(1500);
    await js(`${helpers} btn('Mark Resolved').click();`);
    await sleep(800);
    await js(`${helpers} const d=document.querySelector('[role=dialog]'); setVal(byLabel('Work done',d),'Grate cleared, line flushed, water drains freely.'); d.querySelector('input[type=checkbox]').click();`);
    await sleep(800);
    await shot("wo-closeout.png");
    await js(`${helpers} btn('Confirm repair complete').click();`);
    await sleep(1500);
    await js(`${helpers} top(document.querySelector('[aria-labelledby=work-order-heading]'));`);
    await sleep(500);
    await shot("wo-resolved.png");
  }
} finally {
  ws?.close();
  edge.kill();
}
