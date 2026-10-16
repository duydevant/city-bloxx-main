const {spawn,execFileSync}=require('node:child_process');
const {randomUUID,randomBytes}=require('node:crypto');
const {join,resolve}=require('node:path');
const fs=require('node:fs');
const assert=require('node:assert/strict');
const delay=ms=>new Promise(r=>setTimeout(r,ms));

async function connect(target){
  const socket=new WebSocket(target.webSocketDebuggerUrl),pending=new Map();let id=0;
  const hooks=new Map();
  await new Promise((r,j)=>{socket.addEventListener('open',r,{once:true});socket.addEventListener('error',j,{once:true})});
  socket.addEventListener('message',event=>{
    const message=JSON.parse(event.data);
    if(message.id){const task=pending.get(message.id);if(task){clearTimeout(task.timer);pending.delete(message.id);message.error?task.reject(Error(message.error.message)):task.resolve(message.result)}}
    else hooks.get(message.method)?.(message.params);
  });
  const send=(method,params={})=>new Promise((resolve,reject)=>{const current=++id;const timer=setTimeout(()=>{pending.delete(current);reject(Error(`CDP timeout: ${method}`))},20000);pending.set(current,{resolve,reject,timer});socket.send(JSON.stringify({id:current,method,params}))});
  const evaluate=async expression=>{const result=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(result.exceptionDetails)throw Error('Browser evaluation failed: '+(result.exceptionDetails.exception?.description||result.exceptionDetails.text).split('\n')[0]);return result.result.value};
  const wait=async(expression)=>{for(let i=0;i<120;i++){if(await evaluate(expression))return;await delay(100)}throw Error(`Browser condition timed out: ${expression}`)};
  await send('Page.enable');await send('Runtime.enable');await send('Network.enable');await send('Emulation.setFocusEmulationEnabled',{enabled:true});
  hooks.set('Page.javascriptDialogOpening',()=>{void send('Page.handleJavaScriptDialog',{accept:true})});
  return{send,evaluate,wait,hooks,close:()=>socket.close()};
}
exports.connect=connect;
exports.run=async function({base,container,directory}){
  const profile=join(directory,'chrome-profile'),port=Number(process.env.W1_CHROME_PORT||9236);
  const chrome=spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',['--headless=new','--disable-gpu','--no-sandbox','--no-first-run','--no-default-browser-check',`--remote-debugging-port=${port}`,`--user-data-dir=${profile}`,'about:blank'],{windowsHide:true,stdio:'ignore'});
  const tabs=[],exceptions=[],report={flows:[],sizes:[[320,568],[390,844],[900,430]],locales:['en','vi'],backend:'real Nest/PostgreSQL/Redis/SMTP behind Nginx',deployment:false};
  const fixture=(action,email,purpose='verify')=>execFileSync('docker',['exec',container,'node','test/browser-fixtures.cjs',action,email,purpose],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
  const count=email=>{const rows=JSON.parse(fixture('audit',email));return rows.find(r=>r.action==='auth.refresh_rotated')?.count||0};
  let targetCounter=0;
  async function tab(){const target=await(await fetch(`http://127.0.0.1:${port}/json/new?about:blank`,{method:'PUT'})).json();const t=await connect(target);tabs.push(t);t.hooks.set('Runtime.exceptionThrown',()=>exceptions.push(`tab-${++targetCounter}`));return t}
  async function go(t,path){await t.send('Page.navigate',{url:base+path});await t.wait(`location.pathname===${JSON.stringify(path.split('?')[0])}&&document.querySelector(${JSON.stringify(path.startsWith('/play')?'.cb-panel h2':'h1')})!==null`);await delay(180)}
  async function fill(t,fields,selector='form'){
    await t.wait(`document.querySelector(${JSON.stringify(selector)})!==null&&document.querySelector(${JSON.stringify(selector)})?.getAttribute('data-auth-ready')!=='false'`);
    await t.evaluate(`(()=>{const form=document.querySelector(${JSON.stringify(selector)});for(const[name,value]of Object.entries(${JSON.stringify(fields)})){const input=form.elements.namedItem(name);Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}))}form.requestSubmit()})()`);
  }
  async function text(t,selector,label){await t.wait(`Array.from(document.querySelectorAll(${JSON.stringify(selector)})).some(n=>n.textContent.trim()===${JSON.stringify(label)})`);await t.evaluate(`(()=>{const node=[...document.querySelectorAll(${JSON.stringify(selector)})].find(n=>n.textContent.trim()===${JSON.stringify(label)});node.click()})()`)}
  async function screenshot(t,name){const shot=await t.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(join(directory,`${name}.png`),Buffer.from(shot.data,'base64'))}
  try{
    for(let i=0;i<100;i++){try{await fetch(`http://127.0.0.1:${port}/json/version`);break}catch{await delay(100)}}
    const a=await tab(),email=`authbrowser-${randomUUID()}@example.test`,password=`Strong!${randomBytes(18).toString('hex')}`;
    await go(a,'/sign-up');await fill(a,{email,password,fullName:'Browser Player'});await a.wait('document.body.innerText.includes("Account created")');
    const link=new URL(fixture('mail',email));await go(a,link.pathname+link.search);
    await a.wait('location.search===""');await text(a,'button[type=submit]','Verify email');await a.wait('document.body.innerText.includes("Email verified")');
    await go(a,'/sign-in');await fill(a,{email,password});await a.wait('document.body.innerText.includes("Signed in:")');
    assert.equal(await a.evaluate('localStorage.getItem("auth-storage")'),null);
    assert(!(await a.evaluate('JSON.stringify({...localStorage})')).includes('accessToken'));
    const cookies=await a.send('Network.getCookies',{urls:[base+'/api/v1/auth/refresh']});const cookie=cookies.cookies.find(c=>c.name==='refresh_token');assert(cookie?.httpOnly);assert.equal(cookie.path,'/api/v1/auth');
    report.flows.push('register, actual SMTP verify link, explicit verify, sign-in, HttpOnly refresh cookie, no persisted JWT');
    await go(a,'/profile');await a.wait(`document.querySelector('form[aria-label="Account details"]')!==null`);
    await fill(a,{fullName:'Browser Renamed',username:`player_${randomBytes(4).toString('hex')}`},'form[aria-label="Account details"]');await a.wait('document.body.innerText.includes("Account details saved")');
    for(const locale of ['en','vi']){
      await a.evaluate(`localStorage.setItem('base-game.locale',${JSON.stringify(locale)})`);await go(a,'/profile');
      await a.wait(`document.documentElement.lang.startsWith(${JSON.stringify(locale)})`);
      for(const[width,height]of report.sizes){await a.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:true});await delay(80);assert(await a.evaluate('document.documentElement.scrollWidth<=innerWidth'),'auth profile overflow');await screenshot(a,`profile-${locale}-${width}`)}
    }
    await a.evaluate("localStorage.setItem('base-game.locale','en')");await go(a,'/profile');
    const b=await tab();await go(b,'/profile');await b.wait(`document.body.innerText.includes(${JSON.stringify(email)})`);
    const before=count(email);const expired=Date.now()+1000000;
    await Promise.all([a.evaluate(`Date.now=()=>${expired};window.dispatchEvent(new Event('focus'))`),b.evaluate(`Date.now=()=>${expired};window.dispatchEvent(new Event('focus'))`)]);
    await delay(1200);assert.equal(count(email)-before,1,'two tabs must serialize and share one refresh');
    await a.wait(`document.body.innerText.includes(${JSON.stringify(email)})`);await b.wait(`document.body.innerText.includes(${JSON.stringify(email)})`);
    report.flows.push('profile edit, EN/VI three viewport layouts, two-tab restore and simultaneous expiry: one rotation');
    // Response-stage failure consumes the one-time refresh server-side before dropping its response.
    await a.send('Fetch.enable',{patterns:[{urlPattern:'*/api/v1/auth/refresh',requestStage:'Response'}]});
    a.hooks.set('Fetch.requestPaused',params=>{void a.send('Fetch.failRequest',{requestId:params.requestId,errorReason:'ConnectionClosed'})});
    const consumed=count(email);
    await a.evaluate(`Date.now=()=>${expired+1000000};window.dispatchEvent(new Event('focus'))`);
    await a.wait('document.querySelector(".auth-notice")!==null');await a.send('Fetch.disable');a.hooks.delete('Fetch.requestPaused');
    assert.equal(count(email)-consumed,1);
    const afterLoss=count(email);await Promise.all([go(a,'/profile'),go(b,'/profile')]);await delay(300);assert.equal(count(email),afterLoss,'uncertain refresh must not retry after reload');
    await go(a,'/sign-in');await fill(a,{email,password});await a.wait('document.body.innerText.includes("Signed in:")');
    report.flows.push('lost refresh response consumed once; other tab/reloads stop refresh; explicit login recovers');
    // In-place auth dialogs checkpoint and pause a live Quick run without replacing its DOM.
    await go(a,'/play');await a.wait('document.querySelector(".cb-panel h2")?.textContent==="Quick Tower"');
    await text(a,'.cb-game button','Play Standard');await a.wait('document.querySelector(".cb-panel").hidden');
    await a.evaluate("window.__authArena=document.querySelector('.cb-arena');window.__savedBefore=localStorage.getItem('city-bloxx.quick-save.v2')");
    fixture('suspend',email);await a.evaluate("window.dispatchEvent(new Event('focus'))");await a.wait('document.querySelector(".auth-notice")!==null');
    assert(await a.evaluate("window.__authArena===document.querySelector('.cb-arena')"));assert.equal(await a.evaluate('location.pathname'),'/play');
    assert((await a.evaluate('document.querySelector(".cb-panel").innerText')).includes('Paused'));
    assert(await a.evaluate("new Promise(resolve=>{const q=indexedDB.open('city-bloxx.accounts.v1',1);q.onsuccess=()=>{const db=q.result,tx=db.transaction('accounts'),r=tx.objectStore('accounts').getAll();tx.oncomplete=()=>{resolve(r.result.some(s=>!!s.raw));db.close()}}})"));
    await text(a,'header button','Sign in');await a.wait('document.querySelector("dialog[open]")!==null');
    await text(a,'dialog button','Create account');assert.equal(await a.evaluate('location.pathname'),'/play');await text(a,'dialog .auth-close','Close');
    report.flows.push('suspension clears both tabs; active Quick stays mounted/paused/saved; modal auth mode switch does not navigate');
    // Register a second account to cover reset/change password and deliberate logout.
    const c=await tab(),emailB=`authbrowser-${randomUUID()}@example.test`;
    await go(c,'/sign-up');await fill(c,{email:emailB,password,fullName:'Second Player'});await c.wait('document.body.innerText.includes("Account created")');
    const linkB=new URL(fixture('mail',emailB));await go(c,linkB.pathname+linkB.search);await text(c,'button[type=submit]','Verify email');await c.wait('document.body.innerText.includes("Email verified")');
    await go(c,'/forgot-password');await fill(c,{email:emailB});await c.wait('document.body.innerText.includes("If the account is eligible")');
    const reset=new URL(fixture('mail',emailB,'reset'));assert.equal(reset.pathname,'/reset-password');await go(c,reset.pathname+reset.search);
    let changed=`Changed!${randomBytes(18).toString('hex')}`;await fill(c,{password:changed});await c.wait('document.body.innerText.includes("Password reset")');
    await go(c,'/sign-in');await fill(c,{email:emailB,password:changed});await c.wait('document.body.innerText.includes("Signed in:")');
    await go(c,'/profile');const changedAgain=`Again!${randomBytes(18).toString('hex')}`;await fill(c,{currentPassword:changed,newPassword:changedAgain},'form[aria-label="Reset password"]');await c.wait('document.body.innerText.includes("Password reset")');changed=changedAgain;
    await go(c,'/sign-in');await fill(c,{email:emailB,password:changed});await c.wait('document.body.innerText.includes("Signed in:")');
    await go(c,'/profile');await text(c,'button','Sign out all sessions');await text(c,'button','Sign out all sessions');await c.wait('document.querySelector(".web-card h2")?.textContent==="Guest"');
    await go(c,'/sign-in');await fill(c,{email:emailB,password:changed});await c.wait('document.body.innerText.includes("Signed in:")');
    await go(c,'/profile');await text(c,'button','Sign out');await text(c,'button','Sign out');await c.wait('document.querySelector(".web-card h2")?.textContent==="Guest"');
    await go(c,'/profile');await c.wait('document.querySelector(".web-card h2")?.textContent==="Guest"');
    report.flows.push('second account, forgot/reset via SMTP token, change password and re-login, confirmed logout-all/logout, Guest after reload');
    const d=await tab();await d.send('Page.addScriptToEvaluateOnNewDocument',{source:"Object.defineProperty(navigator,'locks',{value:undefined});localStorage.setItem('auth-storage',JSON.stringify({state:{accessToken:'stale',refreshToken:'stale'}}))"});
    await go(d,'/sign-in');await fill(d,{email:emailB,password:changed});await d.wait('document.body.innerText.includes("Signed in:")');const rotations=count(emailB);await go(d,'/profile');await delay(200);assert.equal(count(emailB),rotations);assert.equal(await d.evaluate('localStorage.getItem("auth-storage")'),null);
    report.flows.push('Web Locks unavailable: explicit login works, reload does not auto-refresh; legacy persisted tokens removed');
    for(const path of ['/verify-email','/reset-password','/forgot-password','/resend-verification']){const html=await(await fetch(base+path)).text();assert(html.includes('noindex'));assert(html.includes('no-referrer'))}
    assert.deepEqual(exceptions,[],'browser runtime exceptions');fs.writeFileSync(join(directory,'auth-browser.json'),JSON.stringify(report,null,2));console.log('PASS real browser auth: SMTP, profile, two-tab expiry, lost response, suspension/live Quick, recovery/logout, no-Locks fallback');return report;
  }finally{tabs.forEach(t=>t.close());chrome.kill()}
};
