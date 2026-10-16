const assert=require('node:assert/strict');
const {randomUUID,randomBytes,createDecipheriv}=require('node:crypto');
const password=`A!${randomBytes(24).toString('base64url')}`;
module.exports=(db,base)=>{
 const auth=async(path,body)=>{const r=await fetch(`${base}/auth/${path}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});assert.ok(r.ok,`test auth ${path}`);return(await r.json()).data;};
 return {login:async u=>({...u,...await auth('login',{email:u.email,password})}),user:async()=>{
  const email=`verification-${randomUUID()}@example.test`,u=await auth('register',{email,password});let token;
  for(let attempt=0;attempt<40&&!token;attempt++){
   for(const job of(await db.query('SELECT payload FROM mail_outbox WHERE sent_at IS NULL ORDER BY created_at DESC')).rows){
    const [iv,tag,raw]=job.payload.split('.');const d=createDecipheriv('aes-256-gcm',Buffer.from(process.env.MAIL_OUTBOX_KEY,'hex'),Buffer.from(iv,'hex'));d.setAuthTag(Buffer.from(tag,'hex'));
    const m=JSON.parse(Buffer.concat([d.update(Buffer.from(raw,'hex')),d.final()]).toString());if(m.email===email&&m.purpose==='verify')token=new URL(m.link).searchParams.get('token');
   }
   if(!token){const messages=await(await fetch(`${process.env.TEST_MAIL_URL}/api/v1/messages?limit=100`)).json();const candidate=(messages.messages||[]).find(m=>m.To?.some(t=>t.Address===email));if(candidate){const m=await(await fetch(`${process.env.TEST_MAIL_URL}/api/v1/message/${candidate.ID}`)).json();token=/token=([A-Za-z0-9_-]{43})/.exec(m.Text)?.[1];}}
   if(!token)await new Promise(r=>setTimeout(r,100));
  }
  assert.ok(token,'real test SMTP verification');await auth('verify-email',{token});return{id:u.id,email,...await auth('login',{email,password})};
 }};
};
