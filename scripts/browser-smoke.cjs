const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const assert = require("node:assert/strict");
const esbuild = require("node:module").createRequire(path.resolve(__dirname,"../base-playable-main/package.json"))("esbuild");
const fixture = require("../packages/city-bloxx-core/fixtures/quick-mixed-v13.json");
const dailyFixture = require("../packages/city-bloxx-core/fixtures/daily-v1.json");
const root = path.resolve(__dirname,"..");
const reportDir = path.join(root,"tmp","c0-c2-qa");
fs.mkdirSync(reportDir,{recursive:true});
const profile = fs.mkdtempSync(path.join(reportDir,"chrome-"));
const chrome = spawn("C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",[
  "--headless=new","--disable-gpu","--no-sandbox","--no-first-run","--no-default-browser-check",
  "--remote-debugging-port=9224",`--user-data-dir=${profile}`,"about:blank"
],{windowsHide:true,stdio:"ignore"});
let socket; let sequence=0; const pending=new Map(); const errors=[];
const delay = ms => new Promise(resolve=>setTimeout(resolve,ms));
function send(method,params={}) {
  const id=++sequence;
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{pending.delete(id);reject(new Error(`CDP timeout ${method}`));},30000);
    pending.set(id,{resolve,reject,timer}); socket.send(JSON.stringify({id,method,params}));
  });
}
async function evaluate(expression) {
  const result=await send("Runtime.evaluate",{expression,awaitPromise:true,returnByValue:true});
  if(result.exceptionDetails)throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
}
async function waitFor(expression) {
  for(let i=0;i<100;i++){if(await evaluate(expression))return;await delay(100);}
  throw new Error(`Browser condition not reached: ${expression}; ${await evaluate('document.body?.innerText.slice(0,1200)')}; errors ${JSON.stringify(errors)}`);
}
const bundle=esbuild.buildSync({entryPoints:[path.join(root,"packages/city-bloxx-core/src/index.ts")],bundle:true,platform:"browser",format:"iife",globalName:"CityBloxx",write:false}).outputFiles[0].text;
const sceneBundle=esbuild.buildSync({entryPoints:[path.join(root,"packages/city-bloxx-renderer/src/session.ts")],bundle:true,platform:"browser",format:"iife",globalName:"CityScene",write:false}).outputFiles[0].text;
const rendererBundle=esbuild.buildSync({entryPoints:[path.join(root,"packages/city-bloxx-renderer/src/index.ts")],bundle:true,platform:"browser",format:"iife",globalName:"CityRender",write:false}).outputFiles[0].text;
const botBundle=esbuild.buildSync({entryPoints:[path.join(root,"base-game-nextjs/modules/city-bloxx/test-simulation.ts")],bundle:true,platform:"browser",format:"iife",globalName:"TestBot",write:false}).outputFiles[0].text;
function initScript(kind,storageMode="normal",rawOverride) {
  const initial={schema:2,standardQuickBest:0,assistQuickBest:0,runs:0,lastReplay:fixture};
  return `
    window.__frameCount=0;window.__frames=new Map();window.__rafId=0;
    window.requestAnimationFrame=cb=>{const id=++window.__rafId;window.__frames.set(id,cb);return id};
    window.cancelAnimationFrame=id=>window.__frames.delete(id);
    window.__step=()=>{const entries=[...window.__frames.values()];window.__frames.clear();const time=100+(++window.__frameCount)*1000/60;entries.forEach(cb=>cb(time))};
    window.__clock=42;Date.now=()=>window.__clock;
    ${bundle}
    window.__fixture=${JSON.stringify(fixture)};
    window.__storageGet=Storage.prototype.getItem;window.__storageSet=Storage.prototype.setItem;
    ${rawOverride !== undefined ? `localStorage.setItem(${JSON.stringify(kind==="web"?"city-bloxx.quick-save.v2":"city_bloxx_save_v1")},${JSON.stringify(rawOverride)});` : storageMode === "preserve" ? "" : `localStorage.setItem(${JSON.stringify(kind==="web"?"city-bloxx.quick-save.v2":"city_bloxx_save_v1")},${JSON.stringify(JSON.stringify(kind==="web"?initial:{v:1,d:initial}))});`}
    ${storageMode==="read-failure"?'Storage.prototype.getItem=()=>{throw new Error("simulated read failure")};':""}
    ${storageMode==="write-failure"?'Storage.prototype.setItem=()=>{throw new Error("simulated write failure")};':""}
  `;
}
async function navigate(kind,url,storageMode="normal",rawOverride) {
  const script=await send("Page.addScriptToEvaluateOnNewDocument",{source:initScript(kind,storageMode,rawOverride)});
  await send("Page.navigate",{url});
  await waitFor('document.querySelector(".cb-panel h2")?.textContent === "Quick Tower"');
  await evaluate("for(let i=0;i<4;i++)window.__step()");
  await send("Page.removeScriptToEvaluateOnNewDocument",{identifier:script.identifier});
}
async function click(label) {
  await evaluate(`Array.from(document.querySelectorAll('.cb-game button')).find(b=>b.textContent===${JSON.stringify(label)}).click()`);
  if(["Play Standard","Play Assist","Build again","Last replay","Replay / restart","Restart replay"].includes(label))await waitFor('document.querySelector(".cb-panel").hidden');
}
async function switchLanguage(kind,locale) {
  if(kind==="playable")await evaluate('document.querySelector("[data-language]").click()');
  else {
    assert.equal(await evaluate('document.querySelector(".cb-game [data-language]")===null'),true);
    await evaluate('document.querySelector("header [role=combobox]").click()');
    await waitFor('document.querySelector("[role=option]")!==null');
    await evaluate(`[...document.querySelectorAll('[role=option]')].find(el=>el.textContent.includes(${JSON.stringify(locale==="vi"?"Tiếng Việt":"English")})).click()`);
  }
}
async function recordedRun(assist=false,record=fixture) {
  await click(assist?"Play Assist":"Play Standard");
  await evaluate(`{window.__step();
    const arena=document.querySelector('.cb-arena');
    const pointer=()=>arena.dispatchEvent(new PointerEvent('pointerdown',{button:0,isPrimary:true,bubbles:true}));
    const record=${JSON.stringify(record)};
    let index=0;
    for(let tick=0;tick<record.endTick;tick++){
      arena.dispatchEvent(new KeyboardEvent('keydown',{key:' ',repeat:true,bubbles:true}));
      if(record.inputs[index]?.tick===tick){pointer();pointer();index++;}
      window.__step();
    }}`);
  await delay(30);
  return evaluate("document.querySelector('.cb-panel').innerText");
}
async function screenshot(name) {
  const result=await send("Page.captureScreenshot",{format:"png"});
  fs.writeFileSync(path.join(reportDir,name+".png"),Buffer.from(result.data,"base64"));
}
async function trackingSmoke(kind,url,key) {
  const read=()=>evaluate(`(()=>{const raw=JSON.parse(localStorage.getItem(${JSON.stringify(key)}));return ${kind==="web"?"raw":"raw.d"}})()`);
  const before=await read();assert.equal(before.schema,4);assert.equal(before.stats.totals.attempts,2);
  assert.equal(before.stats.totals.abandoned,1);assert.equal(before.runs,1);
  assert.equal(before.progression.xp,before.history.reduce((sum,h)=>sum+(h.xpEarned||0),0));
  fs.writeFileSync(path.join(reportDir,`${kind}-c4-save-after-settlement.json`),JSON.stringify(before,null,2));
  const payload=JSON.stringify(before),envelope=JSON.stringify({v:1,d:before});
  const bytes={utf8:Buffer.byteLength(payload),utf16:payload.length*2,envelopeUtf8:Buffer.byteLength(envelope),envelopeUtf16:envelope.length*2};
  assert(Math.max(...Object.values(bytes))<=256*1024);
  assert.equal(before.stats.totals.quality.miss,3);
  assert.equal(before.stats.totals.scoredBody,fixture.result.height-1+fixture.result.misses);
  await click("Statistics");await panelLayoutSmoke(kind,"statistics-overview-en");
  await click("Next");await panelLayoutSmoke(kind,"statistics-skill-en");
  assert((await evaluate('document.querySelector(".cb-panel").innerText')).includes("Perfect rate"));
  await switchLanguage(kind,"vi");await panelLayoutSmoke(kind,"statistics-skill-vi");
  assert((await evaluate('document.querySelector(".cb-panel").innerText')).includes("Tỷ lệ Perfect"));
  await switchLanguage(kind,"en");await click("Next");await panelLayoutSmoke(kind,"statistics-class-en");
  await click("History");await panelLayoutSmoke(kind,"history-en");
  await evaluate('document.querySelector("[data-history-id]").click()');
  await click("Drop quality");await panelLayoutSmoke(kind,"history-quality-en");
  assert((await evaluate('document.querySelector(".cb-panel").innerText')).includes("Foundation · unscored"));
  await click("Pin replay");assert.equal((await read()).replayRefs.pinned,(await read()).history[0].identity.id);
  await click("Back");await switchLanguage(kind,"vi");await panelLayoutSmoke(kind,"history-vi");
  await switchLanguage(kind,"en");await click("Home");
  await click("Sound on");await click("Reduced motion");await delay(40);
  assert.equal((await read()).settings.muted,true);assert.equal((await read()).settings.reducedMotion,true);
  await navigate(kind,url,"preserve");
  assert.equal(await evaluate('document.querySelector("[data-sound]").getAttribute("aria-pressed")'),"true");
  assert.equal(await evaluate('document.querySelector("[data-motion]").getAttribute("aria-pressed")'),"true");
  assert.deepEqual((await read()).stats,before.stats);
  await click("Sound off");await click("Reduced motion");await delay(40);
  return {schema:4,bytes,history:"details/filter/pin/reload EN/VI",statistics:"overview/skill/class; foundation and roof excluded",settings:"mute/motion restored",rewards:"replay/read screens do not settle runs"};
}
async function recoverySmoke(kind,url,key) {
  await navigate(kind,url,"read-failure");
  const legacy=await evaluate(`JSON.stringify({schema:3,standardQuickBest:88,assistQuickBest:22,runs:10,city:CityBloxx.emptySave().city})`);
  const encoded=kind==="web"?legacy:JSON.stringify({v:1,d:JSON.parse(legacy)});
  await evaluate(`window.__storageSet.call(localStorage,${JSON.stringify(key)},${JSON.stringify(encoded)})`);
  await click("Recover saved progress");await click("Retry load");
  await waitFor('document.querySelector(".cb-panel h2")?.textContent==="Quick Tower"');
  assert.equal(await evaluate(`window.__storageGet.call(localStorage,${JSON.stringify(key)})`),encoded);
  await click("Play Standard");await evaluate("window.__step()");await click("Pause");await click("Home");
  assert.equal(await evaluate(`window.__storageGet.call(localStorage,${JSON.stringify(key)})`),encoded);
  await evaluate('Storage.prototype.getItem=window.__storageGet');
  await click("Recover saved progress");await panelLayoutSmoke(kind,"recovery-en");
  await switchLanguage(kind,"vi");await panelLayoutSmoke(kind,"recovery-vi");await switchLanguage(kind,"en");
  await click("Retry load");await waitFor('document.querySelector("[data-best]").textContent==="88"');await delay(50);
  const recovered=await evaluate(`JSON.parse(localStorage.getItem(${JSON.stringify(key)}))`),value=kind==="web"?recovered:recovered.d;
  assert.equal(value.schema,4);assert.equal(value.standardQuickBest,88);assert.equal(value.runs,10);assert.equal(value.stats.totals.attempts,0);
  fs.writeFileSync(path.join(reportDir,`${kind}-c4-save-before-migration.json`),legacy);
  fs.writeFileSync(path.join(reportDir,`${kind}-c4-save-after-migration.json`),JSON.stringify(value,null,2));
  for(const broken of ["{corrupt",JSON.stringify(kind==="web"?{schema:999}:{v:1,d:{schema:999}})]) {
    // Inject at the next document's boot, after the old session's pagehide flush.
    await navigate(kind,url,"preserve",broken);
    assert((await evaluate('document.querySelector(".cb-notice").textContent')).includes("without saving"));
    await click("Recover saved progress");await click("Retry load");
    await waitFor('document.querySelector(".cb-panel h2")?.textContent==="Quick Tower"');
    assert.equal(await evaluate(`localStorage.getItem(${JSON.stringify(key)})`),broken);
  }
  return {failedRead:"raw preserved during retry and unsaved play",retry:"saved PB/counters restored",corrupt:"raw JSON and unknown schema preserved",ui:"recovery EN/VI mobile"};
}
async function driveCity(record,startTick=0,endTick=record.endTick) {
  await evaluate(`{window.__step();const arena=document.querySelector('.cb-arena');const record=${JSON.stringify(record)};
    let index=record.inputs.findIndex(d=>d.tick>=${startTick});if(index<0)index=record.inputs.length;
    for(let tick=${startTick};tick<${endTick};tick++){
      if(record.inputs[index]?.tick===tick){arena.dispatchEvent(new PointerEvent('pointerdown',{button:0,isPrimary:true,bubbles:true}));index++;}
      window.__step();
    }if(${endTick}===record.endTick)for(let i=0;i<240;i++)window.__step();}`);
  await delay(50);
}
async function dailySmoke(kind,url,key) {
  console.log("Testing Daily",kind);
  const read=()=>evaluate(`(()=>{const raw=JSON.parse(localStorage.getItem(${JSON.stringify(key)}));return ${kind==="web"?"raw":"raw.d"}})()`);
  const stamp=Date.parse("2026-10-09T23:59:00Z"), midnight=Date.parse("2026-10-10T00:00:00Z");
  await navigate(kind,url);await evaluate(`window.__clock=${stamp}`);
  const baseline=await read();assert.deepEqual(baseline.city.unlocked,["residential"]);
  for(const d of dailyFixture.definitions)assert.deepEqual(await evaluate(`CityBloxx.resolveDaily(${JSON.stringify(d.dateUTC)})`),d);
  await click("Daily Tower");await panelLayoutSmoke(kind,"daily-entry-en");
  assert.equal(await evaluate('document.querySelectorAll(".cb-daily-strip [data-date]").length'),7);
  await switchLanguage(kind,"vi");await panelLayoutSmoke(kind,"daily-entry-vi");await switchLanguage(kind,"en");
  for(const locale of ["en","vi"]) {
    if(locale==="vi")await switchLanguage(kind,"vi");
    await click(locale==="en"?"Daily guide":"Hướng dẫn Daily");
    for(let page=0;page<3;page++){await panelLayoutSmoke(kind,`daily-guide-${locale}-${page+1}`);if(page<2)await click(locale==="en"?"Next":"Tiếp");}
    await click(locale==="en"?"Back":"Quay lại");if(locale==="vi")await switchLanguage(kind,"en");
  }
  await click("History");await panelLayoutSmoke(kind,"daily-history-en");
  await switchLanguage(kind,"vi");await panelLayoutSmoke(kind,"daily-history-vi");await switchLanguage(kind,"en");await click("Back");
  await click("Play Daily");await waitFor('document.querySelector(".cb-panel").hidden');
  const record=dailyFixture.complete, fallingTick=record.inputs[0].tick+1;
  await driveCity(record,0,fallingTick);await click("Pause");await click("Home");await delay(50);
  const falling=await read();assert.equal(falling.daily.pending.checkpoint.tick,fallingTick);
  assert.equal(falling.daily.days[0].attempts,1);assert.equal(falling.daily.lifetimeCreditedDays,0);
  assert.equal(await evaluate(`CityBloxx.restoreTower(${JSON.stringify(falling.daily.pending.checkpoint)}).getPhase()`),"falling");
  await navigate(kind,url,"preserve");await evaluate(`window.__clock=${midnight}`);await click("Daily Tower");
  await click("Play Daily");assert.equal(await evaluate('document.querySelector(".cb-panel h2").textContent'),"Replace pending Daily?");
  await panelLayoutSmoke(kind,"daily-replace-confirm-en");await click("Keep pending Daily");
  assert.deepEqual((await read()).daily.pending,falling.daily.pending);
  await click("Resume Daily");await waitFor('document.querySelector(".cb-panel").hidden');
  assert.equal(await evaluate('document.querySelector("[data-mode]").textContent'),"2026-10-09 UTC");
  await switchLanguage(kind,"vi");await switchLanguage(kind,"en");
  await driveCity(record,fallingTick,record.inputs[1].tick);await click("Pause");await delay(50);
  const foundation=await read();assert.equal(foundation.daily.lifetimeCreditedDays,0);assert.equal(await evaluate('window.__frames.size'),0,await evaluate('JSON.stringify({panel:document.querySelector(".cb-panel").innerText,frames:[...window.__frames.values()].map(fn=>String(fn).slice(0,300))})'));await click("Resume");
  await driveCity(record,record.inputs[1].tick,record.inputs[2].tick);await click("Pause");await click("Home");await delay(50);
  const scored=await read();assert.deepEqual(scored.daily.creditedDates,["2026-10-09"]);assert.equal(scored.daily.lifetimeCreditedDays,1);
  await click("Daily Tower");await click("Resume Daily");await waitFor('document.querySelector(".cb-panel").hidden');await driveCity(record,record.inputs[2].tick);
  await waitFor('document.querySelector(".cb-panel h2")?.textContent.startsWith("Daily complete")');
  await panelLayoutSmoke(kind,"daily-result-en");await switchLanguage(kind,"vi");await panelLayoutSmoke(kind,"daily-result-vi");await switchLanguage(kind,"en");
  const completed=await read();assert.deepEqual(completed.daily.days[0].bestComplete.result,record.result);
  assert.equal(completed.daily.days[0].attempts,1);assert.equal(completed.daily.longestStreak,1);assert.equal(completed.daily.lifetimeCreditedDays,1);
  assert.deepEqual(completed.city,baseline.city);assert.equal(completed.standardQuickBest,baseline.standardQuickBest);assert.equal(completed.runs,baseline.runs);
  assert.equal(completed.progression.xp,533);assert.equal(completed.progression.masteryXP.industrial,183);assert.equal(completed.stats.byMode.daily.completed,1);
  await click("Replay / restart");await waitFor('document.querySelector(".cb-panel").hidden');await evaluate(`window.__step();for(let i=0;i<${record.endTick+250};i++)window.__step()`);await delay(50);
  assert((await evaluate('document.querySelector(".cb-panel h2").textContent')).startsWith("Replay complete"));
  assert.deepEqual((await read()).daily,completed.daily);assert.deepEqual((await read()).progression,completed.progression);
  await navigate(kind,url,"preserve");await evaluate(`window.__clock=${midnight}`);await click("Daily Tower");await click("Resume Daily");
  await waitFor('document.querySelector(".cb-panel h2")?.textContent.startsWith("Daily complete")');await delay(50);
  assert.deepEqual((await read()).stats,completed.stats);assert.equal((await read()).progression.xp,533);
  await click("Retry this Daily");await waitFor('document.querySelector(".cb-panel").hidden');await driveCity(dailyFixture.roofMiss);
  assert((await evaluate('document.querySelector(".cb-panel h2").textContent')).startsWith("Daily complete"));
  const roofMiss=await read();assert.equal(roofMiss.daily.days[0].attempts,2);assert.equal(roofMiss.history[0].metrics.roof,"miss");assert.deepEqual(roofMiss.daily.days[0].bestComplete,completed.daily.days[0].bestComplete);
  await click("Retry this Daily");await waitFor('document.querySelector(".cb-panel").hidden');await driveCity(dailyFixture.failed);
  assert((await evaluate('document.querySelector(".cb-panel h2").textContent')).startsWith("Daily incomplete"));await panelLayoutSmoke(kind,"daily-failed-en");
  const failed=await read();assert.equal(failed.daily.days[0].attempts,3);assert.equal(failed.daily.days[0].bestFailedHeight,1);assert.deepEqual(failed.daily.days[0].bestComplete,completed.daily.days[0].bestComplete);
  assert.equal(failed.daily.lifetimeCreditedDays,1);assert.equal(failed.history[0].complete,false);
  await click("Home");await click("History");await evaluate('const select=document.querySelector(".cb-data-select");select.value="daily";select.dispatchEvent(new Event("change"))');
  await panelLayoutSmoke(kind,"daily-filtered-history-en");await switchLanguage(kind,"vi");await panelLayoutSmoke(kind,"daily-filtered-history-vi");await switchLanguage(kind,"en");
  fs.writeFileSync(path.join(reportDir,`${kind}-daily-save.json`),JSON.stringify(failed,null,2));
  await click("Home");await click("Daily Tower");await click("Play Daily");await click("Discard and play today");await waitFor('document.querySelector(".cb-panel").hidden');
  await click("Pause");await click("Home");await delay(50);
  const today=await read();assert.equal(today.daily.pending.checkpoint.config.daily.dateUTC,"2026-10-10");assert.equal(today.daily.days[0].attempts,1);assert.equal(today.daily.lifetimeCreditedDays,1);
  await click("Last replay");await waitFor('document.querySelector(".cb-panel").hidden');
  await evaluate(`window.__step();for(let i=0;i<${dailyFixture.failed.endTick+250};i++)window.__step()`);
  await click("Retry this Daily");assert.equal(await evaluate('document.querySelector(".cb-panel h2").textContent'),"Replace pending Daily?");
  await click("Keep pending Daily");await delay(50);assert.deepEqual((await read()).daily.pending,today.daily.pending);
  const bytes=Math.max(JSON.stringify(failed).length*2,Buffer.byteLength(JSON.stringify(failed)));assert(bytes<=256*1024);
  await navigate(kind,url);
  return {definitions:dailyFixture.definitions,complete:record.result,roofMiss:dailyFixture.roofMiss.result,failed:dailyFixture.failed.result,bytes,attempts:3,lifetimeCreditedDays:1,
    resume:"foundation falling, scored body, result; pinned date across UTC midnight",ui:"entry/guide/history/results EN/VI at 320x568,390x844,900x430; no clipping/scroll",isolation:"City unlocks/Quick best unchanged",settlement:"no duplicate attempts/streak/XP on resume/replay; failed PB separate; roof Miss complete"};
}
async function captureClassSeams(kind) {
  await evaluate(rendererBundle);
  for(const id of ["industrial","office"]) {
    await evaluate(`(async()=>{
      const canvas=document.createElement('canvas');canvas.dataset.seamPreview='true';
      canvas.style.cssText='position:fixed;top:0;left:0;z-index:9999';document.body.append(canvas);
      const renderer=new CityRender.QuickTowerRenderer(canvas,${JSON.stringify(kind==="web"?"/game":"./game")});
      await renderer.load();await renderer.loadBuilding(${JSON.stringify(id)});renderer.resize(390,700,1);
      const base=new CityBloxx.QuickTowerGame({seed:42,mode:'city',assist:false,building:${JSON.stringify(id)}}).getSnapshot();
      const floors=Array.from({length:4},()=>({x:0,quality:'great',population:10,error:.1}));
      renderer.render({...base,phase:'ended',floors,swayOffset:0,camera:{x:0,lift:0}});
    })()`);
    await screenshot(`${kind}-${id}-seams`);
    await evaluate('document.querySelector("[data-seam-preview]").remove()');
  }
}
async function feedbackSmoke(kind) {
  await evaluate(rendererBundle);
  const result=await evaluate(`(async()=>{
    const canvas=document.createElement('canvas');canvas.dataset.feedbackPreview='true';
    canvas.style.cssText='position:fixed;top:0;left:0;z-index:9999';document.body.append(canvas);
    const renderer=new CityRender.QuickTowerRenderer(canvas,${JSON.stringify(kind==="web"?"/game":"./game")});
    await renderer.load();renderer.resize(390,700,1);
    const ctx=canvas.getContext('2d'), texts=[], counts=[];
    const fillText=ctx.fillText.bind(ctx), fillRect=ctx.fillRect.bind(ctx);
    let rects=0;ctx.fillText=(text,...args)=>{texts.push(text);fillText(text,...args)};
    ctx.fillRect=(...args)=>{rects++;fillRect(...args)};
    const base=new CityBloxx.QuickTowerGame(42).getSnapshot();
    for(const streak of [2,3,6]) {
      rects=0;renderer.render({...base,lastPlacement:'perfect',streak,feedbackRatio:.7});counts.push(rects);
    }
    rects=0;renderer.render({...base,lastPlacement:'perfect',streak:6,feedbackRatio:.7},undefined,1,true);
    const reducedRects=rects, start=performance.now();
    for(let i=0;i<240;i++)renderer.render({...base,lastPlacement:'perfect',streak:6,feedbackRatio:.7});
    const meanRenderMs=(performance.now()-start)/240;
    return {labels:texts.slice(0,4),counts,reducedRects,meanRenderMs};
  })()`);
  assert.deepEqual(result.labels,["DOUBLE PERFECT","TRIPLE PERFECT","PERFECT ×6","PERFECT ×6"]);
  assert(result.counts[2]>result.counts[1]&&result.counts[1]>result.counts[0]);
  assert.equal(result.reducedRects,2); // ground only; zero particles
  await screenshot(`${kind}-perfect-streak`);
  await evaluate('document.querySelector("[data-feedback-preview]").remove()');
  return result;
}
async function noScrollSmoke(kind) {
  // Called only with the City map open.
  for(const [width,height] of [[390,844],[320,568],[900,430]]) {
    await send("Emulation.setDeviceMetricsOverride",{width,height,deviceScaleFactor:1,mobile:true});
    await delay(100);await evaluate("window.__step()");
    const layout=await evaluate(`(()=>{
      const doc=document.scrollingElement,panel=document.querySelector('.cb-panel'), bounds=panel.getBoundingClientRect();
      const outside=[...panel.querySelectorAll('button')].filter(b=>{
        const r=b.getBoundingClientRect();return r.left<bounds.left-1||r.right>bounds.right+1||r.top<bounds.top-1||r.bottom>bounds.bottom+1;
      }).map(b=>b.textContent);
      return {width:doc.scrollWidth,height:doc.scrollHeight,viewportWidth:innerWidth,viewportHeight:innerHeight,
        overflow:getComputedStyle(panel).overflow,outside,cellHeight:document.querySelector('[data-lot]').getBoundingClientRect().height};
    })()`);
    assert(layout.width<=layout.viewportWidth+1,`${kind} ${width} horizontal overflow ${JSON.stringify(layout)}`);
    assert(layout.height<=layout.viewportHeight+1,`${kind} ${height} vertical overflow ${JSON.stringify(layout)}`);
    assert.equal(layout.overflow,"hidden");assert.deepEqual(layout.outside,[],`${kind} clipped controls ${width}x${height}`);
    assert(layout.cellHeight>=24,`${kind} city cells too small ${width}x${height}: ${layout.cellHeight}`);
    await screenshot(`${kind}-city-no-scroll-${width}x${height}`);
  }
  await send("Emulation.setDeviceMetricsOverride",{width:390,height:844,deviceScaleFactor:1,mobile:true});
}
async function panelLayoutSmoke(kind,name) {
  for(const [width,height] of [[320,568],[390,844],[900,430]]) {
    await send("Emulation.setDeviceMetricsOverride",{width,height,deviceScaleFactor:2,mobile:true});
    await delay(80);await evaluate("window.__step()");
    const layout=await evaluate(`(()=>{
      const panel=document.querySelector('.cb-panel'),bounds=panel.getBoundingClientRect(),toolbar=document.querySelector('.cb-toolbar').getBoundingClientRect();
      const outside=[...panel.querySelectorAll('h2,h3,li,dt,dd,button,.cb-progression-content strong,.cb-progression-content small,.cb-progression-content progress,.cb-progression-content select,[data-reward-save]')].filter(el=>{const r=el.getBoundingClientRect();return r.left<bounds.left-1||r.right>bounds.right+1||r.top<bounds.top-1||r.bottom>bounds.bottom+1}).map(el=>el.textContent);
      const controls=[...document.querySelectorAll('.cb-toolbar-controls button')].map(el=>({y:el.getBoundingClientRect().top,left:el.getBoundingClientRect().left,right:el.getBoundingClientRect().right,clip:el.scrollWidth>el.clientWidth+1}));
      const title=document.querySelector('.cb-toolbar-title strong').getBoundingClientRect(),mode=document.querySelector('[data-mode]').getBoundingClientRect();
      return {outside,controls,toolbar:{left:toolbar.left,right:toolbar.right},titleY:title.top+title.height/2,modeY:mode.top+mode.height/2,scroll:[document.scrollingElement.scrollWidth,document.scrollingElement.scrollHeight]};
    })()`);
    await screenshot(`${kind}-${name}-${width}x${height}`);
    assert.deepEqual(layout.outside,[],`${kind} ${name} clipped panel ${width}x${height}: ${JSON.stringify(layout)}`);
    assert(layout.scroll[0]<=width+1&&layout.scroll[1]<=height+1,`${kind} ${name} page overflow`);
    if(width<600) {
      assert(Math.abs(layout.titleY-layout.modeY)<2,`${kind} title/mode not on one row`);
      assert(layout.controls.every(control=>Math.abs(control.y-layout.controls[0].y)<1&&!control.clip&&control.left>=layout.toolbar.left-1&&control.right<=layout.toolbar.right+1),`${kind} toolbar clipped/wrapped ${JSON.stringify(layout.controls)}`);
    }
  }
  await send("Emulation.setDeviceMetricsOverride",{width:390,height:844,deviceScaleFactor:1,mobile:true});
}
async function progressionSmoke(kind,url,key) {
  const time=Date.parse("2026-10-09T12:00:00Z"), read=()=>evaluate(`(()=>{const raw=JSON.parse(localStorage.getItem(${JSON.stringify(key)}));return ${kind==="web"?"raw":"raw.d"}})()`);
  const baseline=await evaluate(`(()=>{
    const s=CityBloxx.ensureMissions(CityBloxx.initializeTracking(CityBloxx.emptySave(),'progress-browser',${time}),${time});
    const ids=['land-10','perfect-10','roof-hit'],defs={};
    for(let i=0;i<500;i++)for(const slot of CityBloxx.resolveMissions('2026-10-09','pool-'+i,['residential']).slots)defs[slot.definition.id]=slot.definition;
    s.progression.missionDays[0].slots=ids.map(id=>({definition:defs[id],progress:0,status:'active',completedAt:null,claimedAt:null}));
    return s;
  })()`);
  const raw=JSON.stringify(kind==="web"?baseline:{v:1,d:baseline});
  await navigate(kind,url,"preserve",raw);await evaluate(`window.__clock=${time}`);
  await click("Progression");await delay(80);
  for(let page=0;page<5;page++) {
    await panelLayoutSmoke(kind,`progression-${page}-en`);
    await switchLanguage(kind,"vi");await panelLayoutSmoke(kind,`progression-${page}-vi`);await switchLanguage(kind,"en");
    if(page===2) {
      assert.equal(await evaluate('document.querySelectorAll("[data-mission-id]").length'),3);
      await waitFor('document.querySelector("[data-mission-reroll]:not([disabled])")!==null');await evaluate('document.querySelector("[data-mission-reroll]:not([disabled])").click()');await delay(80);
      const day=(await read()).progression.missionDays.find(d=>d.dateUTC==="2026-10-09");assert.equal(day.rerolled,true);
      await waitFor('document.querySelectorAll("[data-mission-reroll]").length===0');
    }
    if(page===3)for(let i=0;i<6;i++){await click("More achievements");await panelLayoutSmoke(kind,`achievements-${i+2}`);}
    if(page<4)await click("Next");
  }
  await click("Back");
  await navigate(kind,url,"preserve",raw);await evaluate(`window.__clock=${time}`);
  await click("Daily Tower");await click("Play Daily");await waitFor('document.querySelector(".cb-panel").hidden');await driveCity(dailyFixture.complete);await delay(80);
  assert.equal((await read()).progression.xp,533);
  await click("XP & missions");
  await evaluate('window.__hidden=true;Object.defineProperty(document,"hidden",{configurable:true,get:()=>window.__hidden});Object.defineProperty(document,"visibilityState",{configurable:true,get:()=>window.__hidden?"hidden":"visible"});document.dispatchEvent(new Event("visibilitychange"))');
  const count=await evaluate('document.querySelector("[data-xp-count]").textContent');await delay(200);
  assert.equal(await evaluate('document.querySelector("[data-xp-count]").textContent'),count);
  await evaluate('window.__hidden=false;document.dispatchEvent(new Event("visibilitychange"))');
  if(await evaluate('[...document.querySelectorAll("button")].some(b=>b.textContent==="Skip XP animation")'))await click("Skip XP animation");
  assert.equal(await evaluate('document.querySelector("[data-xp-count]").textContent'),"+533 XP");
  await panelLayoutSmoke(kind,"progression-reward-en");await switchLanguage(kind,"vi");await panelLayoutSmoke(kind,"progression-reward-vi");await switchLanguage(kind,"en");
  await click("Next");await panelLayoutSmoke(kind,"progression-result-missions");
  assert.equal(await evaluate('document.querySelectorAll("[data-mission-claim]").length'),3);
  await delay(80);
  await evaluate('Storage.prototype.setItem=()=>{throw new Error("progression write failure")};const b=document.querySelector("[data-mission-claim]");b.click();b.click()');
  await waitFor('document.querySelector("[data-reward-save]")?.textContent.includes("Save failed")');
  assert.equal((await read()).progression.xp,533);
  assert((await evaluate('document.querySelector("[data-mission-id=land-10]").textContent')).includes("Claimed"));
  await evaluate('Storage.prototype.setItem=window.__storageSet');await click("Retry save");await delay(100);
  assert.equal((await read()).progression.xp,553);assert.equal((await read()).progression.masteryXP.industrial,183);
  await waitFor('document.querySelectorAll("[data-mission-claim]:not([disabled])").length===2');
  await evaluate('document.querySelector("[data-mission-claim]").click()');await delay(100);
  await waitFor('document.querySelectorAll("[data-mission-claim]:not([disabled])").length===1');
  await evaluate('document.querySelector("[data-mission-claim]").click()');await delay(100);
  assert.equal((await read()).progression.xp,653);
  await click("Next");await panelLayoutSmoke(kind,"progression-unlocks");await click("More unlocks");await panelLayoutSmoke(kind,"progression-more-unlocks");
  await click("Back");await switchLanguage(kind,"vi");assert(await evaluate('[...document.querySelectorAll("button")].some(b=>b.textContent==="XP và nhiệm vụ")'));await switchLanguage(kind,"en");
  await click("Home");await navigate(kind,url,"preserve");await evaluate(`window.__clock=${time}`);
  assert.equal((await read()).progression.xp,653);assert.equal((await read()).progression.unlocks.length,6);
  await click("Daily Tower");await click("Resume Daily");await waitFor('document.querySelector(".cb-panel h2")?.textContent.includes("Daily complete")');
  await click("Reduced motion");await click("XP & missions");assert.equal(await evaluate('document.querySelector("[data-xp-count]").textContent'),"+533 XP");
  assert.equal(await evaluate('[...document.querySelectorAll("button")].some(b=>b.textContent==="Skip XP animation")'),false);
  assert.equal((await read()).progression.xp,653);
  await click("Back");await click("Home");
  fs.writeFileSync(path.join(reportDir,`${kind}-c4-progression-save.json`),JSON.stringify(await read(),null,2));
  return {builderXP:653,industrialMasteryXP:183,achievementUnlocks:6,claimedMissions:3,reroll:"one unstarted slot; receipt survives redraw",reward:"skip, Reduced Motion instant, visibility pause, grouped unlocks",save:"duplicate click, failed write retained in session, same snapshot retry, reload idempotent",layout:"5 menu pages, 7 achievement pages, result XP/missions/unlocks EN/VI; 320x568, 390x844, 900x430"};
}
async function siteI18nSmoke() {
  for(const locale of ["en","vi"]) {
    const source=await send("Page.addScriptToEvaluateOnNewDocument",{source:`localStorage.setItem('base-game.locale',${JSON.stringify(locale)})`});
    for(const [route,en,vi] of [["/","Play Quick Tower","Chơi xây tháp nhanh"],["/guide/build-city","Build City guide","Hướng dẫn xây thành phố"],
      ["/sign-in","Password","Mật khẩu"],["/sign-up","Sign up","Đăng ký"],["/profile","Account information","Thông tin tài khoản"],
      ["/missing-city-page","This page could not be found.","Không tìm thấy trang này."]]) {
      await send("Page.navigate",{url:`http://127.0.0.1:3010${route}`});
      await waitFor(`location.pathname===${JSON.stringify(route)}&&document.documentElement.lang.startsWith(${JSON.stringify(locale)})&&document.body.innerText.includes(${JSON.stringify(locale==="vi"?vi:en)})`);
      if(route==="/guide/build-city")await screenshot(`web-guide-${locale}`);
    }
    await send("Page.removeScriptToEvaluateOnNewDocument",{identifier:source.identifier});
  }
}
async function realFrameSmoke() {
  // Separate navigation: NO fake RAF. This measures headless CPU/frame scheduling, not display/GPU FPS.
  await send("Emulation.setDeviceMetricsOverride",{width:390,height:844,deviceScaleFactor:2,mobile:true});
  const script=await send("Page.addScriptToEvaluateOnNewDocument",{source:`
    localStorage.setItem('base-game.locale','en');
    window.__probe={active:false,cpu:[],intervals:[],longTasks:[],imageDraws:0,canvasDraws:0,last:0};
    const original=requestAnimationFrame;
    window.requestAnimationFrame=callback=>original(time=>{
      const p=window.__probe,start=performance.now();callback(time);
      if(p.active){p.cpu.push(performance.now()-start);if(p.last)p.intervals.push(time-p.last);p.last=time;}
    });
    const draw=CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage=function(source,...args){
      if(window.__probe.active){if(source instanceof HTMLImageElement)window.__probe.imageDraws++;else window.__probe.canvasDraws++;}
      return draw.call(this,source,...args);
    };
    if(PerformanceObserver.supportedEntryTypes.includes('longtask'))new PerformanceObserver(list=>{
      if(window.__probe.active)window.__probe.longTasks.push(...list.getEntries().map(entry=>entry.duration));
    }).observe({type:'longtask',buffered:false});
  `});
  await send("Page.navigate",{url:"http://127.0.0.1:3010/play"});
  await waitFor('document.querySelector(".cb-panel h2")?.textContent==="Quick Tower"');
  await send("Page.removeScriptToEvaluateOnNewDocument",{identifier:script.identifier});
  await click("Play Standard");await delay(500);
  await evaluate(`window.__probe.active=true;
    for(const ms of [800,2300])setTimeout(()=>document.querySelector('.cb-arena').dispatchEvent(new PointerEvent('pointerdown',{button:0,isPrimary:true,bubbles:true})),ms);`);
  await delay(4500);
  const result=await evaluate(`(()=>{
    const p=window.__probe;p.active=false;
    const summary=values=>{const sorted=values.slice().sort((a,b)=>a-b);return {count:values.length,p50:sorted[Math.floor(sorted.length*.5)]??0,p95:sorted[Math.floor(sorted.length*.95)]??0,max:sorted.at(-1)??0}};
    return {rafCpuMs:summary(p.cpu),rafIntervalMs:summary(p.intervals),longTasksMs:p.longTasks,imageDraws:p.imageDraws,cachedCanvasDraws:p.canvasDraws,floors:document.querySelector('[data-floors]').textContent,caveat:'Chrome headless, GPU disabled; not real device/display FPS. Warm 4.5s swing/fall, DPR 2.'};
  })()`);
  assert(result.rafCpuMs.count>100,"Real RAF did not run");
  assert.equal(result.imageDraws,0,"Full-size images reached the warm animation path");
  assert(result.cachedCanvasDraws>100);
  await screenshot("web-real-raf-profile");
  console.log("Real RAF profile",JSON.stringify(result));return result;
}
async function populationSmoke(kind) {
  await evaluate(rendererBundle);
  const results=[];
  for(const building of ["residential","industrial","office","highrise"]) {
    const result=await evaluate(`(async()=>{
      const canvas=document.createElement('canvas');canvas.dataset.populationPreview='true';
      canvas.style.cssText='position:fixed;top:0;left:0;z-index:9999';document.body.append(canvas);
      const renderer=new CityRender.QuickTowerRenderer(canvas,${JSON.stringify(kind==="web"?"/game":"./game")});
      await renderer.load();await renderer.loadBuilding(${JSON.stringify(building)});renderer.resize(390,700,1);
      const base=new CityBloxx.QuickTowerGame({seed:42,mode:'city',assist:false,building:${JSON.stringify(building)}}).getSnapshot();
      const floors=Array.from({length:base.targetFloors},()=>({x:0,quality:'great',population:10,error:.1}));
      const snapshot={...base,floors,phase:'ended',feedbackId:1,lastPlacement:'perfect',feedbackRatio:0,population:500,
        roof:{x:0,quality:'perfect',population:50,error:0},camera:{x:0,lift:base.targetFloors*120-270}};
      const ctx=canvas.getContext('2d'),draw=ctx.drawImage.bind(ctx);let sprites=0;
      ctx.drawImage=(source,...args)=>{if(source.dataset?.populationSprite)sprites++;draw(source,...args)};
      renderer.render(snapshot);for(let i=0;i<14;i++)renderer.updateEffects(.1);renderer.render(snapshot);
      const active=renderer.hasPopulationEffect(), animatedSprites=sprites;
      sprites=0;renderer.render(snapshot,undefined,1,true);const reducedSprites=sprites;
      for(let i=0;i<40;i++)renderer.updateEffects(.1);
      renderer.render(snapshot);const ended=!renderer.hasPopulationEffect();
      renderer.resetEffects();renderer.render(snapshot);for(let i=0;i<14;i++)renderer.updateEffects(.1);renderer.render(snapshot);
      window.__populationRenderer=renderer;
      return {active,animatedSprites,reducedSprites,ended,population:snapshot.population};
    })()`);
    const count={residential:4,industrial:6,office:8,highrise:10}[building];
    assert(result.active&&result.ended);assert.equal(result.animatedSprites,count*2);
    assert.equal(result.reducedSprites,0);assert.equal(result.population,500);
    await screenshot(`${kind}-population-${building}`);await evaluate('document.querySelector("[data-population-preview]").remove()');
    results.push({building,...result});
  }
  return results;
}
async function citySmoke(kind,url,key) {
  await click("Build City");
  assert.equal(await evaluate('document.querySelectorAll("[data-lot]").length'),25);
  assert.equal(await evaluate('getComputedStyle(document.querySelector(".cb-arena")).touchAction'),"none");
  await evaluate('document.querySelector("[data-class=industrial]").click()');
  assert(await evaluate('Array.from(document.querySelectorAll(".cb-game button")).find(b=>b.textContent==="Build selected lot").disabled'));
  await evaluate(`document.querySelector('[data-class=residential]').click();document.querySelector('[data-lot="12"]').click()`);
  await noScrollSmoke(kind);
  await screenshot(`${kind}-city-map`);
  const planned=await evaluate(`(()=>{
    const g=new CityBloxx.QuickTowerGame({seed:42,mode:'city',building:'residential',assist:false});let stopTick=0;
    for(let tick=0;tick<15000&&g.getPhase()!=='ended';tick++){
      const s=g.getSnapshot(),index=s.floors.length-1,top=index>=0?s.floors[index].x+CityBloxx.floorSway(s,index):0;
      if(s.phase==='swing'&&Math.abs(s.current.x-top)<3)g.drop(0);
      g.advanceTicks(1);if(!stopTick&&g.getSnapshot().floors.length===2&&g.getPhase()==='settling')stopTick=g.getTick();
    }
    return {record:g.getRecord(),stopTick};
  })()`);
  await click("Build selected lot");await waitFor('document.querySelector(".cb-panel").hidden');
  await driveCity(planned.record,0,planned.stopTick);
  const readCity=()=>evaluate(`(()=>{const raw=JSON.parse(localStorage.getItem(${JSON.stringify(key)}));return ${kind==="web"?"raw":"raw.d"};})()`);
  let saved=await readCity();assert.equal(saved.schema,4);
  assert.equal(saved.city.pending.checkpoint.tick,planned.stopTick);
  assert.equal(await evaluate(`CityBloxx.restoreTower(${JSON.stringify(saved.city.pending.checkpoint)}).getSnapshot().floors.length`),2);
  await screenshot(`${kind}-city-checkpoint`);
  await navigate(kind,url,"preserve");await click("Build City");await click("Resume tower");
  await waitFor('document.querySelector(".cb-panel").hidden');
  await driveCity(planned.record,planned.stopTick);
  const result=await evaluate('document.querySelector(".cb-panel").innerText');
  assert(result.includes("City tower complete")&&result.includes("10/10")&&result.includes("Roof placed"),result);
  await screenshot(`${kind}-city-result`);
  await panelLayoutSmoke(kind,"city-results-en");await switchLanguage(kind,"vi");
  await waitFor('document.querySelector(".cb-game").lang==="vi"');await panelLayoutSmoke(kind,"city-results-vi");
  await switchLanguage(kind,"en");await waitFor('document.querySelector(".cb-game").lang==="en"');
  saved=await readCity();assert(saved.city.pending);assert.equal(saved.city.lots[12],null);
  const quickBest=saved.standardQuickBest;
  const finishedXP=saved.progression.xp,finishedStats=saved.stats;
  await navigate(kind,url,"preserve");await click("Build City");await click("Resume tower");
  await waitFor('document.querySelector(".cb-panel h2")?.textContent.includes("City tower complete")');
  await click("Accept building");await delay(50);
  saved=await readCity();assert.equal(saved.city.pending,null);assert.equal(saved.city.lots[12].floors,10);
  assert(saved.city.unlocked.includes("industrial"));assert.equal(saved.city.stats.builds,1);
  assert.equal(saved.standardQuickBest,quickBest);
  assert.equal(saved.progression.xp,finishedXP+50);assert.equal(saved.progression.counts.city,1);assert.deepEqual(saved.stats,finishedStats);
  const population=saved.city.lots[12].population;
  await screenshot(`${kind}-city-populated`);
  await evaluate('document.querySelector(".cb-panel").scrollTop=document.querySelector(".cb-panel").scrollHeight');
  await screenshot(`${kind}-city-actions`);
  await click("Rebuild selected lot");await waitFor('document.querySelector(".cb-panel").hidden');
  await click("Pause");await click("City map");await click("Cancel pending tower");await click("Confirm cancel");await delay(50);
  saved=await readCity();assert.equal(saved.city.pending,null);assert.equal(saved.city.lots[12].population,population);
  assert.equal(saved.progression.xp,finishedXP+50);
  await click("Rebuild selected lot");await waitFor('document.querySelector(".cb-panel").hidden');await driveCity(planned.record);
  const rebuilt=await readCity();assert(rebuilt.progression.xp>finishedXP);
  await click("Keep old building");await delay(50);
  saved=await readCity();assert.equal(saved.city.lots[12].population,population);assert.equal(saved.progression.xp,rebuilt.progression.xp);
  assert.deepEqual(saved.stats,rebuilt.stats);assert.equal(saved.city.stats.builds,1);
  await click("Demolish");await click("Confirm demolition");await delay(50);
  saved=await readCity();assert.equal(saved.city.lots[12],null);assert(saved.city.unlocked.includes("industrial"));
  await click("Home");
  return planned.record;
}
async function captureMotion(kind) {
  await click("Play Standard");
  await evaluate('window.__step();for(let i=0;i<70;i++)window.__step()');
  await screenshot(`${kind}-motion-1-hanging`);
  const duration=await evaluate(`(()=>{const g=new CityBloxx.QuickTowerGame(42);g.advanceTicks(70);g.drop(0);const tick=g.getTick();while(g.getPhase()==='falling')g.advanceTicks(1);return g.getTick()-tick;})()`);
  await evaluate(`document.querySelector('.cb-arena').dispatchEvent(new PointerEvent('pointerdown',{button:0,isPrimary:true,bubbles:true}));for(let i=0;i<10;i++)window.__step()`);
  assert.equal(await evaluate('document.querySelector("[data-floors]").textContent'),"0");
  await screenshot(`${kind}-motion-2-falling`);
  await evaluate(`for(let i=0;i<${duration-10};i++)window.__step()`);
  assert.equal(await evaluate('document.querySelector("[data-floors]").textContent'),"1");
  await screenshot(`${kind}-motion-3-landed`);
  await evaluate('for(let i=0;i<24;i++)window.__step()');
  await screenshot(`${kind}-motion-4-next-load`);
  await click("Pause");await click("Home");
}
async function captureHighRig(kind) {
  await evaluate(botBundle);await evaluate(rendererBundle);
  const setup=await evaluate(`(async()=>{
    const game=new CityBloxx.QuickTowerGame(42);for(let i=0;i<50;i++)TestBot.placeAccurately(game);
    for(let i=0;i<3000&&game.getPhase()!=='swing';i++)game.advanceTicks(1);
    if(game.getPhase()!=='swing')throw new Error('High tower never reached swing');
    const canvas=document.createElement('canvas');canvas.dataset.rigPreview='true';canvas.style.cssText='position:fixed;top:0;left:0;z-index:9999';document.body.append(canvas);
    const renderer=new CityRender.QuickTowerRenderer(canvas,${JSON.stringify(kind==="web"?"/game":"./game")});
    await renderer.load();renderer.resize(390,700,2);renderer.render(game.getSnapshot());
    window.__rigGame=game;window.__rigRenderer=renderer;
    return {floors:game.getSnapshot().floors.length,lives:game.getSnapshot().lives,difficulty:game.getSnapshot().difficulty};
  })()`);
  assert.equal(setup.floors,50);assert.equal(setup.lives,3);assert(Math.abs(setup.difficulty.cableLength-148.9104)<.001);
  await screenshot(`${kind}-rig-50-loaded`);
  await evaluate('window.__rigGame.drop(0);window.__rigGame.advanceTicks(18);window.__rigRenderer.render(window.__rigGame.getSnapshot())');
  await screenshot(`${kind}-rig-50-retracted`);
  await evaluate('document.querySelector("[data-rig-preview]").remove();delete window.__rigGame;delete window.__rigRenderer');
}
async function captureMiss(kind) {
  await evaluate(botBundle);await evaluate(rendererBundle);
  const impact=await evaluate(`(async()=>{
    const game=new CityBloxx.QuickTowerGame(42);TestBot.placeAccurately(game);
    for(let tick=0;tick<3000;tick++) {
      const s=game.getSnapshot(),error=Math.abs(s.current.x-s.floors[0].x);
      if(s.phase==='swing'&&error>100&&error<125){game.drop(1);break;}game.advanceTicks(1);
    }
    for(let tick=0;tick<200&&!game.getSnapshot().impact;tick++)game.advanceTicks(1);
    const s=game.getSnapshot();if(s.phase!=='miss'||s.impact?.floorIndex!==0)throw new Error('Miss did not hit the top floor');
    const canvas=document.createElement('canvas');canvas.dataset.missPreview='true';canvas.style.cssText='position:fixed;top:0;left:0;z-index:9999';document.body.append(canvas);
    const renderer=new CityRender.QuickTowerRenderer(canvas,${JSON.stringify(kind==="web"?"/game":"./game")});
    await renderer.load();renderer.resize(390,700,2);
    const ctx=canvas.getContext('2d'),original=ctx.fillRect.bind(ctx);let count=0;ctx.fillRect=(...args)=>{count++;return original(...args)};
    renderer.render(s);const animated=count;count=0;renderer.render(s,undefined,1,true);const reduced=count;
    ctx.fillRect=original;renderer.render(s);window.__missGame=game;window.__missRenderer=renderer;
    return {impact:s.impact,lives:s.lives,particles:animated-reduced};
  })()`);
  assert.equal(impact.lives,2);assert.equal(impact.particles,8);
  await screenshot(`${kind}-miss-1-impact`);
  const falling=await evaluate(`(()=>{
    const game=window.__missGame,before=game.getSnapshot();game.advanceTicks(20);const s=game.getSnapshot();
    window.__missRenderer.render(s);return {x:s.current.x,releaseX:before.current.x,lives:s.lives,floors:s.floors.length,phase:s.phase};
  })()`);
  assert.notEqual(falling.x,falling.releaseX);assert.equal(falling.lives,2);assert.equal(falling.floors,1);assert.equal(falling.phase,'miss');
  await screenshot(`${kind}-miss-2-sliding`);
  await evaluate('document.querySelector("[data-miss-preview]").remove();delete window.__missGame;delete window.__missRenderer');
}
async function main() {
  let targets;
  for(let i=0;i<100;i++){try{targets=await(await fetch("http://127.0.0.1:9224/json/list")).json();break;}catch{await delay(100);}}
  if(!targets)throw new Error("Chrome debugging unavailable");
  socket=new WebSocket(targets.find(t=>t.type==="page").webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{socket.addEventListener("open",resolve,{once:true});socket.addEventListener("error",reject,{once:true});});
  socket.addEventListener("message",event=>{
    const m=JSON.parse(event.data);
    if(m.id){const p=pending.get(m.id);if(p){clearTimeout(p.timer);pending.delete(m.id);m.error?p.reject(new Error(JSON.stringify(m.error))):p.resolve(m.result);}}
    if(m.method==="Runtime.exceptionThrown")errors.push(m.params.exceptionDetails.text);
  });
  await send("Page.enable");await send("Runtime.enable");
  await send("Network.enable");
  // Offline preview uses the template mock SDK; certification runs against the real SDK separately.
  await send("Network.setBlockedURLs",{urls:["https://www.youtube.com/game_api/*"]});
  const report=[];
  for(const [kind,url] of [["web","http://127.0.0.1:3010/play"],["playable",process.env.CITY_BLOXX_PLAYABLE_SMOKE_URL||"http://127.0.0.1:4173/"]]){
    console.log(`Testing ${kind}`);
    await send("Emulation.setDeviceMetricsOverride",{width:390,height:844,deviceScaleFactor:1,mobile:true});
    await navigate(kind,url);
    assert.equal(await evaluate('JSON.stringify(CityBloxx.verifyRecord(window.__fixture).result)'),JSON.stringify(fixture.result));
    await screenshot(`${kind}-home-portrait`);
    assert.equal(await evaluate('document.querySelectorAll("[data-life]:not(.cb-heart-empty)").length'),3);
    if(kind==="web")assert(await evaluate('[...document.querySelectorAll("link[rel=icon]")].some(link=>link.href.includes("icon.svg"))'));
    assert(await evaluate('document.querySelector(".cb-game").scrollWidth <= document.querySelector(".cb-game").clientWidth'));
    await captureMotion(kind);
    const first=await recordedRun();
    assert.equal(await evaluate('document.querySelectorAll(".cb-heart-empty").length'),3);
    assert(first.includes(String(fixture.result.population)) && first.includes(String(fixture.result.height)) && first.includes(`${fixture.result.accuracy.toFixed(1)}%`),first);
    await screenshot(`${kind}-result`);
    assert.deepEqual(await evaluate('[...document.querySelectorAll(".cb-stats dd")].map(el=>el.textContent)'),[String(fixture.result.population),String(fixture.result.height),`${fixture.result.accuracy.toFixed(1)}%`,String(fixture.result.perfectCount),String(fixture.result.bestStreak),`${(fixture.result.durationTicks/60).toFixed(1)}s`]);
    await panelLayoutSmoke(kind,"results-en");
    await switchLanguage(kind,"vi");await waitFor('document.querySelector(".cb-game").lang==="vi"');
    await panelLayoutSmoke(kind,"results-vi");await switchLanguage(kind,"en");
    await waitFor('document.querySelector(".cb-game").lang==="en"');
    const key=kind==="web"?"city-bloxx.quick-save.v2":"city_bloxx_save_v1";
    const raw=await evaluate(`JSON.parse(localStorage.getItem(${JSON.stringify(key)}))`);
    const saved=kind==="web"?raw:raw.d;
    assert.deepEqual(saved.lastReplay.result,fixture.result);assert.equal(saved.standardQuickBest,fixture.result.population);
    await click("Replay / restart");
    await evaluate("window.__step();for(let i=0;i<100;i++)window.__step()");
    await click("Pause");const before=await evaluate('document.querySelector("[data-population]").textContent');
    assert.equal(await evaluate('window.__frames.size'),0);
    await evaluate("for(let i=0;i<60;i++)window.__step()");
    assert.equal(await evaluate('document.querySelector("[data-population]").textContent'),before);
    await click("Restart replay");
    await evaluate(`window.__step();for(let i=0;i<${fixture.endTick+3};i++)window.__step()`);
    const replayText=await evaluate('document.querySelector(".cb-panel").innerText');
    assert(replayText.includes("Replay complete")&&replayText.includes(String(fixture.result.population)));
    const afterReplay=await evaluate(`JSON.parse(localStorage.getItem(${JSON.stringify(key)}))`);
    assert.equal((kind==="web"?afterReplay:afterReplay.d).runs,1);
    assert.deepEqual((kind==="web"?afterReplay:afterReplay.d).stats,saved.stats);
    assert.deepEqual((kind==="web"?afterReplay:afterReplay.d).progression,saved.progression);
    await click("Home");
    const tracking=await trackingSmoke(kind,url,key);
    const assistRecord=await evaluate(`(()=>{const g=new CityBloxx.QuickTowerGame({seed:42,mode:'quick',assist:true});for(let i=0;i<5000&&g.getPhase()!=='ended';i++){const s=g.getSnapshot(),x=s.floors.length?s.floors[s.floors.length-1].x:0;if(s.phase==='swing'&&Math.abs(s.current.x-x)>115)g.drop(0);g.advanceTicks(1);}return g.getRecord();})()`);
    const assistText=await recordedRun(true,assistRecord);assert(assistText.includes("Assist · unranked"));
    const afterAssist=await evaluate(`JSON.parse(localStorage.getItem(${JSON.stringify(key)}))`);
    assert.equal((kind==="web"?afterAssist:afterAssist.d).standardQuickBest,fixture.result.population);
    await click("Home");
    await send("HeapProfiler.collectGarbage");const heapBefore=(await send("Runtime.getHeapUsage")).usedSize;
    const fastRecord=await evaluate(`(()=>{const g=new CityBloxx.QuickTowerGame(42);for(let i=0;i<5000&&g.getPhase()!=='ended';i++){const s=g.getSnapshot(),top=s.floors.length?s.floors[s.floors.length-1].x:0;if(s.phase==='swing'&&Math.abs(s.current.x-top)>115)g.drop(0);g.advanceTicks(1);}return g.getRecord();})()`);
    await click("Reduced motion");
    for(let i=0;i<30;i++){await recordedRun(false,fastRecord);await click("Home");}
    await send("HeapProfiler.collectGarbage");const heapAfter=(await send("Runtime.getHeapUsage")).usedSize;
    assert(heapAfter-heapBefore<4*1048576,`Heap grew ${heapAfter-heapBefore}`);
    await send("Emulation.setDeviceMetricsOverride",{width:900,height:430,deviceScaleFactor:1,mobile:true});
    await delay(100);await evaluate("window.__step()");await screenshot(`${kind}-home-landscape`);
    assert(await evaluate('document.querySelector(".cb-arena").getBoundingClientRect().height >= 100'));
    await send("Emulation.setDeviceMetricsOverride",{width:390,height:844,deviceScaleFactor:1,mobile:true});
    const cityRecord=await citySmoke(kind,url,key);
    tracking.daily=await dailySmoke(kind,url,key);
    tracking.progression=await progressionSmoke(kind,url,key);
    // Progression uses a pinned UTC clock/save; renderer fixtures start fresh at seed 42.
    await navigate(kind,url);
    await captureClassSeams(kind);
    await captureHighRig(kind);
    await captureMiss(kind);
    const feedback=await feedbackSmoke(kind);
    const population=await populationSmoke(kind);
    console.log('Population FX verified',kind,JSON.stringify(population));
    await click("Play Standard");
    const arenaWithoutCombo=await evaluate('document.querySelector(".cb-arena").getBoundingClientRect().height');
    assert(await evaluate('document.querySelector(".cb-combo").hidden'));
    await evaluate(botBundle);
    await evaluate(`{const g=new CityBloxx.QuickTowerGame(42);TestBot.placeAccurately(g,.02);TestBot.placeAccurately(g,.02);
      const plan=g.getSnapshot();window.__step();for(let tick=0;tick<plan.tick+2;tick++){
        if(plan.drops.some(input=>input.tick===tick))document.querySelector('.cb-arena').dispatchEvent(new PointerEvent('pointerdown',{button:0,isPrimary:true,bubbles:true}));
        window.__step();if(document.querySelector('[data-floors]').textContent==='1'&&!document.querySelector('.cb-combo').hidden)throw new Error('Foundation awarded combo');
      }
    }`);
    assert.equal(await evaluate('document.querySelector("[data-floors]").textContent'),"2");
    assert.equal(await evaluate('document.querySelector(".cb-combo").hidden'),false);
    assert.equal(await evaluate('document.querySelector(".cb-arena").getBoundingClientRect().height'),arenaWithoutCombo);
    const livePopulation=await evaluate('document.querySelector("[data-population]").textContent');
    const beforeComboBounds=await evaluate('document.querySelector(".cb-arena").getBoundingClientRect().height');
    await switchLanguage(kind,"vi");
    await waitFor('document.querySelector(".cb-game").lang==="vi"');
    assert.equal(await evaluate('document.querySelector("[data-population]").textContent'),livePopulation);
    assert((await evaluate('document.querySelector(".cb-toolbar strong").textContent')).includes("Xây tháp"));
    if(kind==="web")await waitFor('document.documentElement.lang.startsWith("vi")');
    await screenshot(`${kind}-live-vietnamese`);
    assert.equal(await evaluate('document.querySelector(".cb-arena").getBoundingClientRect().height'),beforeComboBounds);
    await switchLanguage(kind,"en");
    await waitFor('document.querySelector(".cb-game").lang==="en"');
    await click("Pause");await click("Home");await click("Build City");
    await switchLanguage(kind,"vi");
    await waitFor('document.querySelector(".cb-game").lang==="vi"');
    await noScrollSmoke(`${kind}-vi`);
    await click("Hướng dẫn");
    assert((await evaluate('document.querySelector(".cb-panel h2").textContent')).includes("Hướng dẫn xây thành phố"));
    for(let page=0;page<6;page++) {
      await panelLayoutSmoke(kind,`guide-vi-${page+1}`);
      if(page===2)assert((await evaluate('document.querySelector(".cb-guide-content").textContent')).includes("Tầng móng"));
      if(page<5)await click("Tiếp");
    }
    await click("Quay lại");
    await switchLanguage(kind,"en");
    await waitFor('document.querySelector(".cb-game").lang==="en"');
    await click("Guide");
    for(let page=0;page<6;page++) {await panelLayoutSmoke(kind,`guide-en-${page+1}`);if(page<5)await click("Next");}
    await click("Back");
    await navigate(kind,url,"read-failure");
    assert((await evaluate('document.querySelector(".cb-notice").textContent')).includes("without saving"));
    const recovery=await recoverySmoke(kind,url,key);
    await navigate(kind,url,"write-failure");await recordedRun(false,fastRecord);
    assert((await evaluate('document.querySelector(".cb-notice").textContent')).includes("Save failed"));
    // Exercise the shared score/lifecycle ports independently of the preview SDK.
    await evaluate(sceneBundle);
    await evaluate(`(async()=>{
      document.querySelector('.cb-game').remove();
      const target=document.createElement('div');target.style.cssText='height:500px;width:390px';document.body.append(target);
      window.__scores=[];window.__pauseHost=null;window.__resumeHost=null;
      window.__testSession=CityScene.mountQuickTower(target,{
        assets:${JSON.stringify(kind==="web"?"/game":"./game")},locale:'en',seed:()=>42,
        save:{load:async()=>CityBloxx.emptySave(),save:async()=>true},
        score:{submitStandardQuick:async value=>window.__scores.push(value)},
        audio:{play(){},suspend(){},dispose(){}},
        lifecycle:{isPaused:()=>false,onPause:cb=>{window.__pauseHost=cb;return()=>{}},onResume:cb=>{window.__resumeHost=cb;return()=>{}}}
      });await window.__testSession.ready;
    })()`);
    await recordedRun();assert.deepEqual(await evaluate('window.__scores'),[fixture.result.population]);
    await click("Home");await recordedRun(true,assistRecord);
    assert.deepEqual(await evaluate('window.__scores'),[fixture.result.population]);
    await click("Replay / restart");await evaluate(`window.__step();for(let i=0;i<${assistRecord.endTick+2};i++)window.__step()`);
    assert.deepEqual(await evaluate('window.__scores'),[fixture.result.population]);
    await click("Home");await click("Build City");await click("Build selected lot");
    await waitFor('document.querySelector(".cb-panel").hidden');await driveCity(cityRecord);
    assert.deepEqual(await evaluate('window.__scores'),[fixture.result.population]);
    await click("Discard tower");await click("Home");
    await evaluate(`window.__clock=${Date.parse("2026-10-09T12:00:00Z")}`);
    await click("Daily Tower");await click("Play Daily");await waitFor('document.querySelector(".cb-panel").hidden');
    await driveCity(dailyFixture.complete,0,dailyFixture.complete.inputs[0].tick+1);
    await evaluate('window.__pauseHost()');assert.equal(await evaluate('window.__frames.size'),0);
    await evaluate('window.__resumeHost()');
    await driveCity(dailyFixture.complete,dailyFixture.complete.inputs[0].tick+1);
    assert.deepEqual(await evaluate('window.__scores'),[fixture.result.population]);
    await click("Replay / restart");await waitFor('document.querySelector(".cb-panel").hidden');
    await evaluate(`window.__step();for(let i=0;i<${dailyFixture.complete.endTick+250};i++)window.__step()`);
    assert.deepEqual(await evaluate('window.__scores'),[fixture.result.population]);
    await click("Home");await evaluate('window.__clock=42');await click("Play Standard");
    await evaluate(`window.__step();document.querySelector('.cb-arena').dispatchEvent(new PointerEvent('pointerdown',{isPrimary:true,button:0,bubbles:true}));window.__step();window.__pauseHost();`);
    assert.equal(await evaluate('window.__frames.size'),0);
    await evaluate('window.__resumeHost();window.__step()');
    assert.equal(await evaluate('window.__frames.size'),1);
    await evaluate('window.__testSession.dispose()');
    assert.equal(await evaluate('window.__frames.size'),0);
    if(kind==="web")await siteI18nSmoke();
    report.push({platform:kind,tracking,recovery,feedback,population,language:"EN/VI live switch preserves floors/population; City guide and no-scroll verified; Web pages checked in both languages",combo:"hidden for foundation, visible after scored Perfect",renderTimingCaveat:"Headless CPU submission only, not GPU/frame presentation or real-phone FPS",goldenBrowserResult:fixture.result,portrait:390,landscape:900,retries:30,heapGrowthBytes:heapAfter-heapBefore,storageFaults:"read/write/recovery/corrupted raw verified",input:"double pointer and held key verified",replay:"pause/restart/result and XP/stat idempotency verified",city:"25 lots, locked tiers, two-floor reload/resume, roof, accept, rebuild/keep-old/cancel and demolition; XP/stat idempotency verified",scoreGuard:"standard only; Assist/replay/City excluded",lifecycle:"host pause/resume/dispose stops RAF"});
  }
  report[0].realTimeRender=await realFrameSmoke();
  assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(reportDir,"browser-report.json"),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
}
main().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{socket?.close();chrome.kill();});
