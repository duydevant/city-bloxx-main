const { buildSync } = require('esbuild');
const { generateDtsBundle } = require('dts-bundle-generator');
const { mkdirSync, writeFileSync, copyFileSync } = require('node:fs');
const { resolve, join } = require('node:path');

const root = resolve(__dirname, '..');
const entry = resolve(root, '../packages/city-bloxx-core/src/index.ts');
const output = join(root, '.generated');
mkdirSync(output, { recursive: true });
const build = buildSync({
  entryPoints: [entry], outfile: join(output, 'core.cjs'),
  bundle: true, platform: 'node', target: 'node22', format: 'cjs', metafile: true,
});
// A server bundle must stay pure: no external runtime dependencies, UI, assets or host adapters.
if (Object.values(build.metafile.outputs).some(output => output.imports.length)) {
  throw new Error('Shared core has external runtime imports');
}
for (const input of Object.keys(build.metafile.inputs)) {
  if (!/packages[\\/]city-bloxx-(core|content)[\\/]/.test(input)) {
    throw new Error(`Unexpected core dependency: ${input}`);
  }
}
const [declarations] = generateDtsBundle([{ filePath: entry }], {
  preferredConfigPath: join(__dirname, 'core.tsconfig.json'),
});
writeFileSync(join(output, 'core.d.ts'), declarations);
copyFileSync(join(__dirname, 'core-worker.cjs'), join(output, 'worker.cjs'));
mkdirSync(join(output, 'fixtures'), { recursive: true });
for (const name of ['quick-mixed-v13.json', 'daily-v1.json']) {
  copyFileSync(resolve(root, '../packages/city-bloxx-core/fixtures', name), join(output, 'fixtures', name));
}
console.log('Built standalone shared core, declarations and worker');
