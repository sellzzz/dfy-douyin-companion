const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const runtime=path.join(root,'work/runtime/node_modules/dsh-pet');
test('upstream patches are idempotent and keep all installed JavaScript parseable',{skip:!fs.existsSync(runtime)},()=>{
 const scripts=['apply-close-button.mjs','apply-drag-start.mjs'];
 const files=['runtime/electron-helper/main.js','runtime/electron-helper/preload.js','runtime/electron-helper/sprite.js','runtime/electron-helper/index.html','lib/index.js','lib/standalone.js'];
 const run=()=>scripts.forEach(s=>execFileSync(process.execPath,[path.join(root,'scripts',s)],{stdio:'pipe'}));
 const hashes=()=>files.map(f=>crypto.createHash('sha256').update(fs.readFileSync(path.join(runtime,f))).digest('hex'));
 run();const before=hashes();run();assert.deepEqual(hashes(),before);
 for(const f of files.filter(f=>f.endsWith('.js')))execFileSync(process.execPath,['--check',path.join(runtime,f)],{stdio:'pipe'});
 const sprite=fs.readFileSync(path.join(runtime,'runtime/electron-helper/sprite.js'),'utf8');
 assert.equal((sprite.match(/const pauseButton=/g)||[]).length,1);
 assert.equal((sprite.match(/const closeButton =/g)||[]).length,1);
 const main=fs.readFileSync(path.join(runtime,'runtime/electron-helper/main.js'),'utf8');
 assert.equal((main.match(/ipcMain.handle\('doupet:close'/g)||[]).length,1);
});
