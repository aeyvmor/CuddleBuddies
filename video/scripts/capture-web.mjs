// Captures the live web app for the demo video: full-page images plus element rectangles (CSS px,
// page coordinates) so the video camera can zoom/pan to real UI and the cursor can hit real buttons.
// Usage: node scripts/capture-web.mjs https://astig-xi.vercel.app/   (env ASTIG_CAPTURE_PW)
// NOTE: creates and resolves one work order on the live Manila issue; run reset-demo WORK_ORDERS afterwards.
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const url = process.argv[2];
const OUT = path.resolve("public/web");
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const PORT = 9335;
const W = 1440;
const H = 900;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const meta = { viewport: { w: W, h: H }, shots: {} };

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
  const H_ = `
    const setVal=(el,v)=>{const p=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el),'value');p.set.call(el,v);el.dispatchEvent(new Event('input',{bubbles:true}));};
    const btn=(t,root=document)=>[...root.querySelectorAll('button')].find(b=>b.textContent.trim()===t);
    const byLabel=(t,root=document)=>[...root.querySelectorAll('label')].find(l=>l.textContent.includes(t))?.querySelector('input,textarea');
    const heading=(t)=>[...document.querySelectorAll('h1,h2,h3,h4')].find(h=>h.textContent.trim().startsWith(t));
    const R=(el)=>{ if(!el) return null; const r=el.getBoundingClientRect(); return {x:r.left+scrollX,y:r.top+scrollY,w:r.width,h:r.height}; };`;
  const js = async (expr) => (await cdp("Runtime.evaluate", { expression: `(async()=>{${H_}${expr}})()`, awaitPromise: true, returnByValue: true })).result?.result?.value;
  const writeImg = (name, data) => writeFileSync(path.join(OUT, name), Buffer.from(data, "base64"));

  /** Full page (page coordinates, y offset 0). */
  async function full(name, rectsExpr) {
    const height = await js(`return Math.ceil(document.documentElement.scrollHeight)`);
    const r = await cdp("Page.captureScreenshot", { format: "jpeg", quality: 88, captureBeyondViewport: true, clip: { x: 0, y: 0, width: W, height, scale: 1 } });
    writeImg(`${name}.jpg`, r.result.data);
    meta.shots[name] = { src: `web/${name}.jpg`, y: 0, w: W, h: height, rects: (await js(rectsExpr)) ?? {} };
    console.log("full", name, height);
  }
  /** Viewport only (placed at the current scroll offset in page coordinates; used for modal dialogs). */
  async function view(name, rectsExpr) {
    const y = await js(`return scrollY`);
    const r = await cdp("Page.captureScreenshot", { format: "jpeg", quality: 88 });
    writeImg(`${name}.jpg`, r.result.data);
    meta.shots[name] = { src: `web/${name}.jpg`, y, w: W, h: H, rects: (await js(rectsExpr)) ?? {} };
    console.log("view", name, "y", y);
  }

  await cdp("Page.enable");
  await cdp("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 2, mobile: false });
  await cdp("Page.navigate", { url });
  await sleep(4000);

  await view("signin", `return { user: R(document.querySelector('input[autocomplete=username]')), pass: R(document.querySelector('input[autocomplete=current-password]')), submit: R(document.querySelector('form[aria-label="Sign in"] button[type=submit]')), card: R(document.querySelector('form[aria-label="Sign in"]')) }`);
  await js(`setVal(document.querySelector('input[autocomplete=username]'),'demo-officer'); setVal(document.querySelector('input[autocomplete=current-password]'),${JSON.stringify(process.env.ASTIG_CAPTURE_PW)});`);
  await view("signin-filled", `return {}`);
  await js(`document.querySelector('form[aria-label="Sign in"] button[type=submit]').click();`);
  await sleep(8000);

  const manila = `[...document.querySelectorAll('button[aria-label^="Map marker"]')].find(b=>b.getAttribute('aria-label').includes('Blocked drain') && b.getAttribute('aria-label').includes('Manila'))`;
  await full("dash", `return { map: R(document.querySelector('[aria-labelledby=issue-map-title]')), marker: R(${manila}), queue: R(heading('Issue queue')?.closest('section')), tiles: R(document.querySelector('#overview')) }`);
  await js(`${manila}.click();`);
  await sleep(5000);
  await js(`window.scrollTo(0,0)`);
  await full("detail", `const box=document.querySelector('[data-testid=region-box]'); return {
      map: R(document.querySelector('[aria-labelledby=issue-map-title]')), marker: R(${manila}),
      article: R(document.querySelector('article')), score: R(heading('Priority score')?.closest('section') ?? heading('Priority score')?.parentElement),
      figure: R(box?.closest('figure')), box: R(box), workOrder: R(document.querySelector('[aria-labelledby=work-order-heading]')),
      team: R(byLabel('Assigned team')), create: R(btn('Create work order')) }`);
  await js(`setVal(byLabel('Assigned team'),'Manila Drainage Maintenance');`);
  await full("wo0", `return { workOrder: R(document.querySelector('[aria-labelledby=work-order-heading]')), create: R(btn('Create work order')) }`);
  await js(`btn('Create work order').click();`);
  await sleep(3500);
  await full("wo1", `return { workOrder: R(document.querySelector('[aria-labelledby=work-order-heading]')), next: R(btn('Mark In progress')) }`);

  await js(`const b=btn('Mark In progress'); window.scrollTo(0, b.getBoundingClientRect().top + scrollY - 520); b.click();`);
  await sleep(1200);
  await view("dlg1a", `const d=document.querySelector('[role=dialog]'); return { dialog: R(d), text: R(byLabel('Inspection findings',d)), check: R(d.querySelector('input[type=checkbox]')), confirm: R(btn('Confirm and start work',d)) }`);
  await js(`const d=document.querySelector('[role=dialog]'); setVal(byLabel('Crew',d),'Barangay crew 2'); setVal(byLabel('Inspection findings',d),'Inlet about 80% blocked by debris and silt. Clearing the grate and flushing the line.'); d.querySelector('input[type=checkbox]').click();`);
  await sleep(500);
  await view("dlg1b", `return {}`);
  await js(`btn('Confirm and start work').click();`);
  await sleep(4000);
  await js(`window.scrollTo(0,0)`);
  await full("wo2", `return { workOrder: R(document.querySelector('[aria-labelledby=work-order-heading]')), next: R(btn('Mark Resolved')) }`);

  await js(`const b=btn('Mark Resolved'); window.scrollTo(0, b.getBoundingClientRect().top + scrollY - 520); b.click();`);
  await sleep(1200);
  await view("dlg2a", `const d=document.querySelector('[role=dialog]'); return { dialog: R(d), text: R(byLabel('Work done',d)), check: R(d.querySelector('input[type=checkbox]')), confirm: R(btn('Confirm repair complete',d)) }`);
  await js(`const d=document.querySelector('[role=dialog]'); setVal(byLabel('Work done',d),'Grate cleared and line flushed; water drains freely.'); d.querySelector('input[type=checkbox]').click();`);
  await sleep(500);
  await view("dlg2b", `return {}`);
  await js(`btn('Confirm repair complete').click();`);
  await sleep(4000);
  await js(`window.scrollTo(0,0)`);
  await full("wo3", `return { workOrder: R(document.querySelector('[aria-labelledby=work-order-heading]')), steps: R(document.querySelector('[aria-label="Work order progress"]')), analytics: R(document.getElementById('analytics')), tiles: R(document.querySelector('#overview')) }`);

  writeFileSync(path.join(OUT, "meta.json"), JSON.stringify(meta, null, 2));
  console.log("meta written");
} finally {
  ws?.close();
  edge.kill();
}
