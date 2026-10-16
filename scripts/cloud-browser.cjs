const {spawn,execFileSync}=require('node:child_process');
const {randomUUID,randomBytes}=require('node:crypto');
const {join,resolve}=require('node:path');
const {createRequire}=require('node:module');
const fs=require('node:fs');
const assert=require('node:assert/strict');
const {connect}=require('./auth-browser.cjs');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const esbuild=createRequire(resolve(__dirname,'../base-playable-main/package.json'))('esbuild');
const compiled=esbuild.buildSync({entryPoints:[resolve(__dirname,'../packages/city-bloxx-core/src/index.ts')],bundle:true,platform:'node',format:'cjs',write:false}).outputFiles[0].text;
const moduleCore={exports:{}};new Function('module','exports',compiled)(moduleCore,moduleCore.exports);const core=moduleCore.exports;

exports.run=async function({base,container,directory}){
  const port=Number(process.env.W1_CHROME_PORT||9236),profile=join(directory,'cloud-chrome');
  const startChrome=(debug,dir)=>spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',['--headless=new','--disable-gpu','--no-sandbox','--no-first-run','--no-default-browser-check',`--remote-debugging-port=${debug}`,`--user-data-dir=${dir}`,'about:blank'],{windowsHide:true,stdio:'ignore'});
  const chrome=startChrome(port,profile),chromes=[chrome];
  const tabs=[],errors=[],report={flows:[],sizes:[[320,568],[390,844],[900,430]],locales:['en','vi'],backend:'real Nest/PostgreSQL/Redis/SMTP/Nginx',storage:'actual IndexedDB strict transactions',deployment:false};
  const fixture=(action,email)=>JSON.parse(execFileSync('docker',['exec',container,'node','test/browser-fixtures.cjs',action,email],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim());
  const mail=email=>execFileSync('docker',['exec',container,'node','test/browser-fixtures.cjs','mail',email],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
  const pass=message=>{report.flows.push(message);console.log(`PASS cloud browser: ${message}`)};
  async function tab(debug=port){
    const target=await(await fetch(`http://127.0.0.1:${debug}/json/new?about:blank`,{method:'PUT'})).json();
    const t=await connect(target);t.targetId=target.id;t.debugPort=debug;tabs.push(t);t.hooks.set('Runtime.exceptionThrown',p=>errors.push(p.exceptionDetails?.text||'exception'));return t;
  }
  async function closeTab(t){await fetch(`http://127.0.0.1:${t.debugPort}/json/close/${t.targetId}`);t.close()}
  async function go(t,path){await t.send('Page.navigate',{url:base+path});await t.wait(`location.pathname===${JSON.stringify(path.split('?')[0])}&&document.querySelector('.cloud-status')!==null`);await delay(200)}
  async function click(t,label,selector='button'){await t.wait(`Array.from(document.querySelectorAll(${JSON.stringify(selector)})).some(n=>!n.disabled&&n.textContent.trim()===${JSON.stringify(label)})`);await t.evaluate(`Array.from(document.querySelectorAll(${JSON.stringify(selector)})).find(n=>!n.disabled&&n.textContent.trim()===${JSON.stringify(label)}).click()`)}
  async function fill(t,fields,selector='form'){await t.wait(`document.querySelector(${JSON.stringify(selector)})!==null&&document.querySelector(${JSON.stringify(selector)})?.getAttribute('data-auth-ready')!=='false'`);await t.evaluate(`(()=>{const f=document.querySelector(${JSON.stringify(selector)});for(const[k,v]of Object.entries(${JSON.stringify(fields)})){const e=f.elements.namedItem(k);Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,v);e.dispatchEvent(new Event('input',{bubbles:true}))}f.requestSubmit()})()`)}
  const saved=t=>t.wait(`(async()=>{if(!document.querySelector('[data-cloud-status="saved"]'))return false;const owner=localStorage.getItem('city-bloxx.active-save-owner.v1');return await new Promise(resolve=>{const q=indexedDB.open('city-bloxx.accounts.v1',1);q.onsuccess=()=>{const db=q.result,tx=db.transaction('accounts'),get=tx.objectStore('accounts').get(owner);tx.oncomplete=()=>{const r=get.result;db.close();resolve(!!r&&!r.pending&&r.raw===r.base)}}})})()`);
  const game=t=>t.wait(`document.querySelector('.cb-game .cb-panel h2')?.textContent==='Quick Tower'`);
  const record=(t,owner)=>t.evaluate(`new Promise((resolve,reject)=>{const q=indexedDB.open('city-bloxx.accounts.v1',1);q.onerror=()=>reject(Error('open'));q.onsuccess=()=>{const db=q.result,tx=db.transaction('accounts');const get=tx.objectStore('accounts').get(${JSON.stringify(owner)});tx.oncomplete=()=>{resolve(get.result);db.close()}}})`);
  const allRecords=t=>t.evaluate(`new Promise(resolve=>{const q=indexedDB.open('city-bloxx.accounts.v1',1);q.onsuccess=()=>{const db=q.result,tx=db.transaction('accounts');const get=tx.objectStore('accounts').getAll();tx.oncomplete=()=>{resolve(get.result);db.close()}}})`);
  async function panel(t){await t.evaluate(`document.querySelector('.cloud-status').click()`);await t.wait(`document.querySelector('.cloud-dialog[open]')!==null`)}
  async function closePanel(t){if(await t.evaluate(`!!document.querySelector('.cloud-dialog[open]')`))await click(t,'Close','.cloud-dialog button')}
  async function waitRecord(t,owner,condition){for(let n=0;n<120;n++){const r=await record(t,owner);if(condition(r))return r;await delay(100)}throw Error('Account storage condition timed out')}
  async function toggle(t,key){const owner=await t.evaluate(`localStorage.getItem('city-bloxx.active-save-owner.v1')`),before=await t.evaluate(`document.querySelector('[data-${key}]').getAttribute('aria-pressed')==='true'`);await t.evaluate(`document.querySelector('[data-${key}]').click()`);await waitRecord(t,owner,r=>JSON.parse(r.raw).settings[key==='sound'?'muted':'reducedMotion']===!before)}
  async function offline(t){await t.send('Fetch.enable',{patterns:[{urlPattern:'*/api/v1/city-bloxx/save*',requestStage:'Request'}]});t.hooks.set('Fetch.requestPaused',p=>{void t.send('Fetch.failRequest',{requestId:p.requestId,errorReason:'InternetDisconnected'})})}
  async function online(t){await t.send('Fetch.disable');t.hooks.delete('Fetch.requestPaused');await t.evaluate(`window.dispatchEvent(new Event('online'))`)}
  async function register(t,email,password){await go(t,'/sign-up');await fill(t,{email,password,fullName:'Cloud Browser'});await t.wait(`document.body.innerText.includes('Account created')`);const link=new URL(mail(email));await go(t,link.pathname+link.search);await click(t,'Verify email','button[type=submit]');await t.wait(`document.body.innerText.includes('Email verified')`)}
  async function login(t,email,password){await go(t,'/sign-in');await fill(t,{email,password});await t.wait(`document.body.innerText.includes('Signed in:')`);await saved(t)}
  async function screenshot(t,name){const shot=await t.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(join(directory,name+'.png'),Buffer.from(shot.data,'base64'))}
  try{
    for(let i=0;i<100;i++){try{await fetch(`http://127.0.0.1:${port}/json/version`);break}catch{await delay(100)}}
    const a=await tab(),email=`authbrowser-${randomUUID()}@example.test`,password=`Strong!${randomBytes(18).toString('hex')}`;
    await go(a,'/play');await game(a);
    let seed=core.emptySave();seed.runs=7;seed.city=core.beginCityTower(seed.city,12,'residential',42);let allocated=core.allocateRun(seed,1);seed=allocated.save;seed.tracking.pendingCity={...allocated.context,cityRunId:seed.city.pending.runId};allocated=core.allocateRun(seed,2);seed=allocated.save;const daily=core.resolveDaily('2026-10-15'),run=new core.QuickTowerGame({mode:'daily',assist:false,building:daily.classId,seed:daily.seed,daily});seed.daily=core.beginDaily(seed.daily,run,allocated.context);seed=core.migrateSave(seed);
    await go(a,'/profile');await a.evaluate(`localStorage.setItem('city-bloxx.quick-save.v2',${JSON.stringify(JSON.stringify(seed))})`);await go(a,'/play');await game(a);await delay(100);
    const guest=await a.evaluate(`localStorage.getItem('city-bloxx.quick-save.v2')`);
    assert.equal(JSON.parse(guest).runs,7);assert(JSON.parse(guest).city.pending);assert(JSON.parse(guest).daily.pending);
    await register(a,email,password);await login(a,email,password);const user=fixture('cloud',email);assert.equal(user.payload.runs,0);assert.equal(await a.evaluate(`localStorage.getItem('city-bloxx.quick-save.v2')`),guest);
    pass('real signup/SMTP/login opens separate empty account; Guest City/Daily snapshot unchanged');
    await go(a,'/profile');await fill(a,{alias:'Cloud Builder'},'form[aria-label="Game alias"]');await a.wait(`document.body.innerText.includes('Game alias saved')`);
    await panel(a);await click(a,'Import Guest progress…','.cloud-dialog button');await waitRecord(a,user.id,r=>JSON.parse(r.raw).runs===7);await saved(a);await closePanel(a);let local=await record(a,user.id);assert.equal(JSON.parse(local.raw).runs,7);assert.equal(await a.evaluate(`localStorage.getItem('city-bloxx.quick-save.v2')`),guest);assert.deepEqual(fixture('cloud',email).payload.city.pending.checkpoint,seed.city.pending.checkpoint);assert.deepEqual(fixture('cloud',email).payload.daily.pending.checkpoint,seed.daily.pending.checkpoint);
    pass('public game alias edit and explicit Guest import; local backups, no merge, City/Daily checkpoints preserved');
    await go(a,'/play');await game(a);await saved(a);
    await offline(a);await toggle(a,'sound');await a.wait(`document.querySelector('[data-cloud-status="offline"]')!==null`);local=await record(a,user.id);const pending=local.pending;assert(pending?.body.mutationId);const expectedRaw=local.raw;
    await go(a,'/play');await game(a);assert.equal((await record(a,user.id)).pending.body.mutationId,pending.body.mutationId);assert.equal(JSON.parse((await record(a,user.id)).raw).settings.muted,JSON.parse(expectedRaw).settings.muted);await online(a);await saved(a);assert.equal((await record(a,user.id)).pending,null);
    pass('API offline/reload/reconnect preserves durable local snapshot and the same pending mutation');
    let lost=false;await a.send('Fetch.enable',{patterns:[{urlPattern:'*/api/v1/city-bloxx/save',requestStage:'Response'}]});a.hooks.set('Fetch.requestPaused',p=>{if(p.responseStatusCode&&p.request.method==='PUT'){lost=true;void a.send('Fetch.failRequest',{requestId:p.requestId,errorReason:'ConnectionClosed'})}else void a.send('Fetch.continueRequest',{requestId:p.requestId})});
    await toggle(a,'motion');await a.wait(`document.querySelector('[data-cloud-status="offline"]')!==null`);assert(lost);const consumed=fixture('cloud',email),lostPending=(await record(a,user.id)).pending;assert(lostPending);await go(a,'/play');await game(a);await online(a);await saved(a);assert.equal(fixture('cloud',email).revision,consumed.revision);assert.equal(fixture('cloud',email).mutations,consumed.mutations);
    pass('lost PUT response after server commit survives reload and returns one receipt/revision');
    chromes.push(startChrome(port+1,join(directory,'cloud-second-device')));for(let n=0;n<100;n++){try{await fetch(`http://127.0.0.1:${port+1}/json/version`);break}catch{await delay(100)}}const device=await tab(port+1);await login(device,email,password);await go(device,'/play');await game(device);await saved(device);
    await offline(a);await toggle(a,'sound');await a.wait(`document.querySelector('[data-cloud-status="offline"]')!==null`);await toggle(device,'motion');await saved(device);const other=fixture('cloud',email);await online(a);await a.wait(`document.querySelector('[data-cloud-status="conflict"]')!==null`);await a.wait(`document.querySelector('.cloud-dialog[open]')!==null`);
    const beforeResolve=await record(a,user.id),remoteRevision=other.revision;
    await a.evaluate(`window.__originalPut=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(...args){if(this.name==='backups')throw new DOMException('fixture quota','QuotaExceededError');return window.__originalPut.apply(this,args)}`);
    await click(a,'Use the cloud copy','.cloud-dialog button');await a.wait(`document.querySelector('.cloud-dialog [role="alert"]')!==null`);assert.equal((await record(a,user.id)).raw,beforeResolve.raw);assert.equal(fixture('cloud',email).revision,remoteRevision);await a.evaluate(`IDBObjectStore.prototype.put=window.__originalPut`);
    await click(a,'Use the cloud copy','.cloud-dialog button');await saved(a);await closePanel(a);await game(a);assert.equal(JSON.parse((await record(a,user.id)).raw).settings.reducedMotion,other.payload.settings.reducedMotion);assert.equal(fixture('cloud',email).backups,2);
    pass('independent device conflict; injected IndexedDB backup failure keeps both copies; cloud resolve commits atomically');
    // Second real device changes cloud again; explicitly retain the first device this time.
    await offline(a);await toggle(a,'motion');await a.wait(`document.querySelector('[data-cloud-status="offline"]')!==null`);const keep=JSON.parse((await record(a,user.id)).raw).settings.reducedMotion;
    await go(device,'/play');await game(device);await toggle(device,'sound');await saved(device);await online(a);await a.wait(`document.querySelector('[data-cloud-status="conflict"]')!==null`);await click(a,"Keep this device's copy",'.cloud-dialog button');await saved(a);await closePanel(a);assert.equal(fixture('cloud',email).payload.settings.reducedMotion,keep);assert.equal(fixture('cloud',email).backups,4);
    await closeTab(device);
    pass('explicit local resolve replaces cloud with selected snapshot and adds both remote backups');
    const peer=await tab();await go(peer,'/play');await game(peer);await saved(peer);await toggle(a,'sound');await saved(a);await peer.wait(`document.querySelector('[data-cloud-status="peer"]')!==null`);await click(peer,'Open the saved account copy','.cloud-dialog button');await game(peer);await closePanel(peer);assert.equal(JSON.parse((await record(peer,user.id)).raw).settings.muted,fixture('cloud',email).payload.settings.muted);await closeTab(peer);
    pass('two tabs share IndexedDB, stale tab is paused/backed up and explicitly reloads the saved account copy');
    await go(a,'/profile');await click(a,'Sign out');await click(a,'Sign out');await a.wait(`document.querySelector('[data-cloud-status="guest"]')!==null`);assert.equal(await a.evaluate(`localStorage.getItem('city-bloxx.quick-save.v2')`),guest);
    const emailB=`authbrowser-${randomUUID()}@example.test`;await register(a,emailB,password);await login(a,emailB,password);const userB=fixture('cloud',emailB);assert.equal(userB.payload.runs,0);assert.equal(JSON.parse((await record(a,user.id)).raw).runs,7);assert.equal(await a.evaluate(`localStorage.getItem('city-bloxx.quick-save.v2')`),guest);
    pass('confirmed logout and account B keep A, B and Guest separate; no automatic account/Guest import');
    for(const locale of ['en','vi']){await a.evaluate(`localStorage.setItem('base-game.locale',${JSON.stringify(locale)})`);await go(a,'/profile');await panel(a);for(const[width,height]of report.sizes){await a.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:true});await delay(100);assert(await a.evaluate(`document.documentElement.scrollWidth<=innerWidth&&document.querySelector('.cloud-dialog').scrollWidth<=document.querySelector('.cloud-dialog').clientWidth`));await screenshot(a,`cloud-${locale}-${width}`)}await a.evaluate(`document.querySelector('.cloud-dialog').close()`);}
    await a.evaluate(`localStorage.setItem('base-game.locale','en')`);await go(a,'/profile');
    const original=' { "schema": 999, "future": "preserve exact raw" } ';
    await a.evaluate(`new Promise(resolve=>{const q=indexedDB.open('city-bloxx.accounts.v1',1);q.onsuccess=()=>{const db=q.result,tx=db.transaction('accounts','readwrite'),store=tx.objectStore('accounts'),get=store.get(${JSON.stringify(userB.id)});get.onsuccess=()=>store.put({...get.result,raw:${JSON.stringify(original)},version:crypto.randomUUID(),pending:null});tx.oncomplete=()=>{db.close();resolve(true)}}})`);await go(a,'/profile');await a.wait(`document.querySelector('[data-cloud-status="incompatible"]')!==null`);assert.equal((await record(a,userB.id)).raw,original);await panel(a);assert(await a.evaluate(`Array.from(document.querySelectorAll('.cloud-dialog button')).some(b=>b.textContent==='Download device original')`));await closePanel(a);
    const records=await allRecords(a);assert(records.every(r=>!JSON.stringify(r).includes('accessToken')&&!JSON.stringify(r).includes('refreshToken')));assert.deepEqual(errors,[]);pass('unknown schema raw/export preserved; EN/VI portrait/landscape panels fit; no credentials persisted in account saves');
    fs.writeFileSync(join(directory,'cloud-browser.json'),JSON.stringify(report,null,2));return report;
  }catch(error){for(let i=0;i<tabs.length;i++){try{await screenshot(tabs[i],`cloud-failure-${i}`);const state=await tabs[i].evaluate(`({path:location.pathname,status:document.querySelector('.cloud-status')?.getAttribute('data-cloud-status'),dialog:document.querySelector('.cloud-dialog')?.innerText})`);fs.writeFileSync(join(directory,`cloud-failure-${i}.json`),JSON.stringify(state,null,2));console.error('Cloud browser stage '+report.flows.length+': '+JSON.stringify(state))}catch{}}throw error}
  finally{tabs.forEach(t=>t.close());chromes.forEach(process=>process.kill())}
};
