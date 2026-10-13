const {spawnSync}=require('node:child_process');
require('dotenv/config');
const args=process.argv.slice(2);
if(args[0]==='revert'&&process.env.NODE_ENV==='production'){console.error('Production revert is disabled. Use the documented recovery/forward-fix procedure.');process.exit(1);}
const command=args[0]==='revert'?['node_modules/typeorm/cli.js','migration:revert','-d','dist/src/config/data-source.js']:['dist/src/cli.js',...args];
const result=spawnSync(process.execPath,['-r','tsconfig-paths/register',...command],{stdio:'inherit',env:{...process.env,TS_NODE_BASEURL:'dist'}});
process.exitCode=result.status??1;
