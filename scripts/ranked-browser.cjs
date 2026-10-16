// Real production Web + disposable Nest/PG/Redis acceptance; only the frame clock
// and explicit network/storage faults are controlled. No fabricated submissions.
const {spawn,execFileSync}=require('node:child_process');
const {randomUUID,randomBytes}=require('node:crypto');
const {join,resolve}=require('node:path');
const fs=require('node:fs');
const assert=require('node:assert/strict');
const {connect}=require('./auth-browser.cjs');
const esbuild=require('node:module').createRequire(resolve(__dirname,'../base-playable-main/package.json'))('esbuild');
const bundle=esbuild.buildSync({entryPoints:[resolve(__dirname,'../packages/city-bloxx-core/src/index.ts')],bundle:true,platform:'browser',format:'iife',globalName:'CityBloxx',write:false}).outputFiles[0].text;
const delay=ms=>new Promise(r=>setTimeout(r,ms));
exports.run=async function({base,container,directory}){
  const port=Number(process.env.W1_CHROME_PORT||9236),errors=[],requests=[];
  const chrome=spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',['--headless=new','--disable-gpu','--no-sandbox','--no-first-run','--no-default-browser-check',`--remote-debugging-port=${port}`,`--user-data-dir=${join(directory,'ranked-chrome')}`,'about:blank'],{windowsHide:true,stdio:'ignore'});
  let t;
  const report={flows:[],sizes:[[320,568],[390,844],[900,430]],locales:['en','vi'],backend:'real Nest/PostgreSQL/Redis/SMTP/Nginx with background resimulation',storage:'actual IndexedDB strict transactions',clock:'controlled animation frames; real UTC, timers and network',deployment:false};
  const fixture=(action,email)=>execFileSync('docker',['exec',container,'node','test/browser-fixtures.cjs',action,email],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
  const db=email=>JSON.parse(fixture('ranked',email));
  const pass=s=>{report.flows.push(s);console.log('PASS ranked browser: '+s)};
  async function go(path){await t.send('Page.navigate',{url:base+path});await t.wait(`location.pathname===${JSON.stringify(path.split('?')[0])}&&document.querySelector('.cloud-status')!==null`);await delay(200)}
  async function click(label,selector='button'){const match=`[...document.querySelectorAll(${JSON.stringify(selector)})].find(b=>!b.disabled&&b.textContent.trim()===${JSON.stringify(label)})`;await t.wait(`!!(${match})`);await t.evaluate(`${match}.click()`)}
  async function fill(fields){await t.wait(`document.querySelector('form')?.getAttribute('data-auth-ready')!=='false'&&!!document.querySelector('form')`);await t.evaluate(`(()=>{const f=document.querySelector('form');for(const[k,v]of Object.entries(${JSON.stringify(fields)})){const e=f.elements.namedItem(k);Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,v);e.dispatchEvent(new Event('input',{bubbles:true}))}f.requestSubmit()})()`)}
  async function register(email,password){await go('/sign-up');await fill({email,password,fullName:'Ranked Builder'});await t.wait(`document.body.innerText.includes('Account created')`);const url=new URL(fixture('mail',email));await go(url.pathname+url.search);await click('Verify email','button[type=submit]');await t.wait(`document.body.innerText.includes('Email verified')`)}
  async function login(email,password){await go('/sign-in');await fill({email,password});await t.wait(`document.body.innerText.includes('Signed in:')`);await saved()}
  async function logout(){await go('/profile');await click('Sign out');await click('Sign out');await t.wait(`!!document.querySelector('[data-cloud-status="guest"]')`)}
  const game=()=>t.wait(`document.querySelector('.cb-panel h2')?.textContent==='Quick Tower'`);
  const saved=()=>t.wait(`!!document.querySelector('[data-cloud-status="saved"]')`);
  async function rows(owner){return t.evaluate(`new Promise(resolve=>{const q=indexedDB.open('city-bloxx.ranked.v1',1);q.onsuccess=()=>{const d=q.result,tx=d.transaction('accounts'),r=tx.objectStore('accounts').get(${JSON.stringify(owner)});tx.oncomplete=()=>{d.close();resolve(r.result?.runs||[])}}})`)}
  async function save(owner){return t.evaluate(`new Promise(resolve=>{const q=indexedDB.open('city-bloxx.accounts.v1',1);q.onsuccess=()=>{const d=q.result,tx=d.transaction('accounts'),r=tx.objectStore('accounts').get(${JSON.stringify(owner)});tx.oncomplete=()=>{d.close();resolve(JSON.parse(r.result.raw))}}})`)}
  async function untilRows(owner,predicate){for(let n=0;n<1000;n++){const r=await rows(owner);if(predicate(r))return r;await delay(100)}throw Error('Ranked storage condition timed out')}
  async function offline(){await t.send('Fetch.enable',{patterns:[{urlPattern:'*/api/v1/city-bloxx/runs/*',requestStage:'Request'}]});t.hooks.set('Fetch.requestPaused',p=>{void t.send('Fetch.failRequest',{requestId:p.requestId,errorReason:'InternetDisconnected'})})}
  async function online(){await t.send('Fetch.disable');t.hooks.delete('Fetch.requestPaused');await t.evaluate(`window.dispatchEvent(new Event('online'))`)}
  async function panel(){await t.evaluate(`document.querySelector('.ranked-status').click()`);await t.wait(`!!document.querySelector('.ranked-dialog[open]')`)}
  async function closePanel(){await click('Close','.ranked-dialog button')}
  async function shot(name){const r=await t.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(join(directory,name+'.png'),Buffer.from(r.data,'base64'))}
  async function start(owner,mode='quick'){
    await click(mode==='quick'?'Ranked Quick':'Ranked Daily','.cb-game button');
    await t.wait(`document.querySelector('.cb-panel')?.hidden===true`);
    const active=(await rows(owner)).filter(r=>r.state==='active'&&r.mode===mode).at(-1);assert(active?.localId);assert(active.ticket);return active;
  }
  async function finish(entry,kind='fail'){
    const record=await t.evaluate(`(()=>{const core=CityBloxx,g=new core.QuickTowerGame(${JSON.stringify(entry.ticket.config)});while(g.getPhase()!=='ended'&&g.getTick()<60000){const s=g.getSnapshot();if(s.phase==='swing'){const prev=s.floors.at(-1),target=prev?prev.x+s.swayOffset*core.floorSwayWeight(s.floors.length-1):0;const fail=${JSON.stringify(kind)}==='roofMiss'?s.isRoof:s.floors.length>=2;if(fail?Math.abs(s.current.x-target)>110:Math.abs(s.current.x-target)<3)g.drop(0)}g.advanceTicks(1)}if(g.getPhase()!=='ended')throw Error('generator');return g.getRecord()})()`);
    await t.evaluate(`(()=>{window.__step();const arena=document.querySelector('.cb-arena'),record=${JSON.stringify(record)};let index=0;for(let tick=0;tick<record.endTick;tick++){if(record.inputs[index]?.tick===tick){arena.dispatchEvent(new PointerEvent('pointerdown',{button:0,isPrimary:true,bubbles:true}));index++}window.__step()}for(let i=0;i<360;i++)window.__step()})()`);
    await t.wait(`document.querySelector('.cb-panel')?.hidden===false&&document.querySelector('.cb-panel')?.innerText.includes('complete')`);
    return record;
  }
  try{
    for(let n=0;n<100;n++){try{await fetch(`http://127.0.0.1:${port}/json/version`);break}catch{await delay(100)}}
    const target=await(await fetch(`http://127.0.0.1:${port}/json/new?about:blank`,{method:'PUT'})).json();t=await connect(target);
    t.hooks.set('Runtime.exceptionThrown',p=>errors.push(p.exceptionDetails?.exception?.description||p.exceptionDetails?.text));
    t.hooks.set('Network.requestWillBeSent',p=>{if(p.request.url.includes('/api/v1/city-bloxx/runs/'))requests.push({path:new URL(p.request.url).pathname,method:p.request.method})});
    await t.send('Page.addScriptToEvaluateOnNewDocument',{source:`window.__frames=new Map();window.__rafId=0;window.__frameCount=0;window.requestAnimationFrame=cb=>{const id=++window.__rafId;__frames.set(id,cb);return id};window.cancelAnimationFrame=id=>__frames.delete(id);window.__step=()=>{const frames=[...__frames.values()];__frames.clear();const time=100+(++__frameCount)*1000/60;frames.forEach(cb=>cb(time))};${bundle}`});
    await go('/play');await game();await click('Play Assist','.cb-game button');await t.wait(`document.querySelector('.cb-panel')?.hidden===true`);await go('/play');await game();assert.equal(requests.length,0);
    pass('Guest and personal Assist start without any ranked API request');
    const email=`authbrowser-${randomUUID()}@example.test`,emailB=`authbrowser-${randomUUID()}@example.test`,password=`Strong!${randomBytes(18).toString('hex')}`;
    await register(email,password);await login(email,password);const owner=db(email).id;await go('/play');await game();
    await t.evaluate(`window.__put=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(...args){if(this.transaction.db.name==='city-bloxx.ranked.v1')throw new DOMException('fixture quota','QuotaExceededError');return __put.apply(this,args)}`);
    const before=requests.length;await click('Ranked Quick','.cb-game button');await t.wait(`document.querySelector('.cb-panel')?.innerText.includes('Online run not started')`);assert.equal(requests.length,before);assert.equal(db(email).tickets.length,0);await t.evaluate(`IDBObjectStore.prototype.put=__put`);await click('Personal play','.cb-game button');
    pass('IndexedDB quota before start prevents HTTP ticket allocation and moving game');
    let active=await start(owner);const record=await finish(active);await untilRows(owner,r=>r.find(x=>x.id===active.id)?.state==='accepted');await saved();let local=await save(owner);const once=JSON.stringify({stats:local.stats,xp:local.progression.xp,runs:local.runs});const server=db(email);assert.equal(server.submissions.length,1);assert.deepEqual(server.submissions[0].result,record.result);assert.equal(server.entries.length,1);assert.equal(server.audits,1);let terminal=(await rows(owner)).find(r=>r.id===active.id);assert.equal(terminal.ticket,null);assert.equal(terminal.body,null);
    await panel();assert(await t.evaluate(`document.querySelector('.ranked-dialog').innerText.includes('Server verified')`));await click('Retry saving/sending','.ranked-dialog button');await closePanel();local=await save(owner);assert.equal(JSON.stringify({stats:local.stats,xp:local.progression.xp,runs:local.runs}),once);
    pass('actual renderer inputs verify in background worker; one board/audit; terminal secrets scrubbed and retry grants no second C4 reward');
    await click('Home','.cb-game button');active=await start(owner);await offline();await finish(active);await untilRows(owner,r=>r.find(x=>x.id===active.id)?.state==='queued');const fixed=(await rows(owner)).find(r=>r.id===active.id).body;await go('/play');await game();assert.deepEqual((await rows(owner)).find(r=>r.id===active.id).body,fixed);await online();await untilRows(owner,r=>r.find(x=>x.id===active.id)?.state==='accepted');await saved();
    pass('API offline finish/reload/reconnect retains the same durable ticket, inputs and finish body');
    await go('/play');await game();active=await start(owner);let lost=false;
    await t.send('Fetch.enable',{patterns:[{urlPattern:'*/api/v1/city-bloxx/runs/finish',requestStage:'Response'}]});t.hooks.set('Fetch.requestPaused',p=>{if(p.responseStatusCode){lost=true;void t.send('Fetch.failRequest',{requestId:p.requestId,errorReason:'ConnectionClosed'})}else void t.send('Fetch.continueRequest',{requestId:p.requestId})});
    await finish(active);for(let i=0;i<150&&!lost;i++)await delay(100);assert(lost);await untilRows(owner,r=>r.find(x=>x.id===active.id)?.state==='queued');const consumed=db(email);await go('/play');await game();await online();await untilRows(owner,r=>r.find(x=>x.id===active.id)?.state==='accepted');assert.equal(db(email).submissions.length,consumed.submissions.length);assert.equal(db(email).audits,3);
    pass('finish response lost after server receipt replays immutably after reload and settles once');
    await go('/play');await game();active=await start(owner);await offline();await finish(active);await untilRows(owner,r=>r.find(x=>x.id===active.id)?.state==='queued');await logout();await online();await register(emailB,password);await login(emailB,password);const ownerB=db(emailB).id;assert.equal(db(emailB).tickets.length,0);assert.equal(db(email).submissions.length,3);await go('/play');await game();await panel();assert.equal(await t.evaluate(`document.querySelectorAll('.ranked-list li').length`),0);await closePanel();assert.equal((await rows(owner)).find(r=>r.id===active.id).state,'queued');await logout();await login(email,password);await untilRows(owner,r=>r.find(x=>x.id===active.id)?.state==='accepted');
    pass('A offline queue remains parked through logout/B login; B sees no A results; same-account reauthentication resumes A');
    await go('/play');await game();const daily=await start(owner,'daily');await go('/play');await game();await click('Ranked Daily','.cb-game button');await click('Resume Daily','.cb-game button');await t.wait(`document.querySelector('.cb-panel')?.hidden===true`);assert.equal((await rows(owner)).filter(r=>r.mode==='daily').length,1);assert.deepEqual((await rows(owner)).find(r=>r.id===daily.id).ticket,daily.ticket);await finish(daily,'roofMiss');await untilRows(owner,r=>r.find(x=>x.id===daily.id)?.state==='accepted');assert.equal((await rows(owner)).find(r=>r.id===daily.id).boardEligible,true);
    pass('Daily reload/resume preserves original identity/config/date/ticket; complete bodies with roof Miss enter Daily board');
    await go('/play');await game();active=await start(owner);await t.evaluate(`window.__put=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(...args){if(this.transaction.db.name==='city-bloxx.ranked.v1')throw new DOMException('fixture quota','QuotaExceededError');return __put.apply(this,args)}`);await finish(active);await saved();const retained=await save(owner);assert(retained.replays.some(r=>r.id===active.localId));await panel();assert(await t.evaluate(`document.querySelector('.ranked-dialog').innerText.includes('Queue could not be saved')`));await t.evaluate(`IDBObjectStore.prototype.put=__put`);await click('Retry saving/sending','.ranked-dialog button');await untilRows(owner,r=>r.find(x=>x.id===active.id)?.state==='accepted');await closePanel();assert.equal((await save(owner)).progression.xp,retained.progression.xp);
    pass('finish queue quota fault keeps personal replay/rewards; retry persists and verifies without a second reward');
    async function gameLayout(name){
      for(const[width,height]of report.sizes){await t.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:true});await delay(100);await t.evaluate(`window.__step()`);const clipped=await t.evaluate(`(()=>{const p=document.querySelector('.cb-panel'),r=p.getBoundingClientRect();return [...p.querySelectorAll('h2,button,p')].filter(e=>{const b=e.getBoundingClientRect();return b.top<r.top-1||b.bottom>r.bottom+1||b.left<r.left-1||b.right>r.right+1}).map(e=>e.textContent)})()`);assert.deepEqual(clipped,[],name+' clipped '+width);await shot(name+'-'+width)}
    }
    await gameLayout('ranked-quick-result');
    await go('/leaderboards');await t.wait(`document.querySelector('.board-scroll tbody tr')!==null&&document.body.innerText.includes('Your standing: #')`);assert(!(await t.evaluate(`document.querySelector('.leaderboards').innerText`)).includes(owner));
    await t.evaluate(`(()=>{const e=document.querySelector('.board-controls select');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(e,'daily');e.dispatchEvent(new Event('change',{bubbles:true}))})()`);await t.wait(`document.querySelector('.board-scroll caption')?.textContent.startsWith('Daily')&&document.querySelector('.board-scroll tbody tr')!==null`);
    pass('public Quick/Daily boards and authenticated own standing render real settled results without internal account IDs');
    for(const locale of report.locales){await t.evaluate(`localStorage.setItem('base-game.locale',${JSON.stringify(locale)})`);await go('/play');await t.wait(`!!document.querySelector('.cb-panel h2')`);await gameLayout('ranked-menu-'+locale);await go('/leaderboards');await t.wait(`document.querySelector('.board-scroll')!==null`);for(const[width,height]of report.sizes){await t.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:true});await delay(100);assert(await t.evaluate(`document.documentElement.scrollWidth<=innerWidth`),'leaderboard body overflow');await shot(`ranked-board-${locale}-${width}`);await panel();assert(await t.evaluate(`document.querySelector('.ranked-dialog').scrollWidth<=document.querySelector('.ranked-dialog').clientWidth`),'ranked dialog overflow');await shot(`ranked-panel-${locale}-${width}`);await t.evaluate(`document.querySelector('.ranked-dialog .auth-close').click()`)}}
    const raw=JSON.stringify(await rows(owner));assert(!/accessToken|refreshToken|password/.test(raw));assert(!/accessToken|refreshToken|password/.test(JSON.stringify(await save(owner))));assert.equal((await rows(ownerB)).length,0);assert.deepEqual(errors,[]);
    pass('EN/VI boards and queue panels fit 320/390 portrait and 900 landscape; no persisted auth credentials or uncaught browser exceptions');
    fs.writeFileSync(join(directory,'ranked-browser.json'),JSON.stringify(report,null,2));return report;
  }catch(error){if(t){try{await shot('ranked-failure');console.error('Ranked browser stage '+report.flows.length+': '+await t.evaluate(`document.body.innerText.slice(0,2600)`));fs.writeFileSync(join(directory,'ranked-errors.json'),JSON.stringify(errors,null,2))}catch{}}throw error}
  finally{t?.close();chrome.kill()}
};
