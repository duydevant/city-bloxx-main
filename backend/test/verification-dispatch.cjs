// Fresh-process startup recovery; never accepts an application database.
const {DataSource}=require('typeorm');
const Redis=require('ioredis');
const {typeormOptions}=require('../dist/src/config/typeorm-options');
const {GameStore}=require('../dist/src/modules/city-bloxx/common/game-store.service');
const {GamePolicyService}=require('../dist/src/modules/city-bloxx/common/game-policy.service');
const {GameWorkerService}=require('../dist/src/modules/city-bloxx/common/game-worker.service');
const {SecurityService}=require('../dist/src/modules/security/security.service');
const {RunsService}=require('../dist/src/modules/city-bloxx/runs.service');
const {BoardsService}=require('../dist/src/modules/city-bloxx/boards.service');
const {VerificationService}=require('../dist/src/modules/city-bloxx/verification.service');
if(!/^auth_test_[a-z0-9_]+$/.test(process.env.TEST_DATABASE||'')||process.env.DB_DATABASE!==process.env.TEST_DATABASE)throw new Error('Disposable DB required');
(async()=>{
 const db=new DataSource(typeormOptions);await db.initialize();const redis=new Redis(process.env.REDIS_URL),infra={redis};
 const security=new SecurityService(db),store=new GameStore(db,new GamePolicyService(security)),runs=new RunsService(store,infra,db),pool=new GameWorkerService();
 process.env.GAME_VERIFICATION_ENABLED='true';const service=new VerificationService(runs,pool,store,new BoardsService(db,store,infra),security);
 try{service.onModuleInit();for(let i=0;i<100;i++){const row=(await db.query('SELECT state FROM city_bloxx_run_tickets WHERE run_id=$1',[process.argv[2]]))[0];if(row&&['accepted','rejected'].includes(row.state)){console.log('PASS automatic startup dispatch in fresh process');return;}await new Promise(r=>setTimeout(r,100));}throw new Error('Startup dispatch timeout');}
 finally{await service.onModuleDestroy();pool.onModuleDestroy();await redis.quit();await db.destroy();}
})().catch(()=>{console.error('Fresh-process dispatch failed');process.exitCode=1;});
