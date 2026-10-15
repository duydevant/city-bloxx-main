// Invoked only by the host's isolated browser acceptance, never an application endpoint.
const { Client }=require('pg');
const {readFileSync}=require('node:fs');
const {database}=JSON.parse(readFileSync('/tmp/w1-browser-ready','utf8'));
if(!/^auth_test_[a-z0-9_]+$/.test(database))throw Error('Disposable browser database required');
const [action,email,purpose='verify']=process.argv.slice(2);
if(!/^authbrowser-[a-f0-9-]+@example\.test$/.test(email||''))throw Error('Only UUID browser fixture accounts are allowed');
async function main(){
  if(action==='mail'){
    for(let n=0;n<60;n++){
      const list=await(await fetch('http://mailpit:8025/api/v1/messages?limit=200')).json();
      const message=(list.messages||[]).find(m=>m.To?.some(t=>t.Address===email)&&m.Subject===(purpose==='reset'?'Set your password':'Verify your email'));
      if(message){const full=await(await fetch(`http://mailpit:8025/api/v1/message/${message.ID}`)).json();const link=/https?:\/\/[^\s]+\?token=[A-Za-z0-9_-]{43}/.exec(full.Text)?.[0];if(link){process.stdout.write(link);return;}}
      await new Promise(r=>setTimeout(r,200));
    }throw Error('Fixture email not delivered');
  }
  const db=new Client({host:process.env.DB_HOST,port:Number(process.env.DB_PORT),user:process.env.DB_USERNAME,password:process.env.DB_PASSWORD,database});await db.connect();
  try{
    if(action==='audit'){
      const result=await db.query("SELECT action,count(*)::int AS count FROM audit_logs WHERE actor_id IN (SELECT id FROM users WHERE email=$1) GROUP BY action",[email]);process.stdout.write(JSON.stringify(result.rows));
    }else if(action==='suspend'){
      await db.query("UPDATE users SET status='suspended',token_version=token_version+1 WHERE email=$1",[email]);
    }else throw Error('Unknown fixture action');
  }finally{await db.end()}
}
main().catch(()=>{console.error('Browser fixture operation failed');process.exitCode=1});
