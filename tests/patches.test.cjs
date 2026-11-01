const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const runtime=path.join(root,'work/runtime/node_modules/dsh-pet');
test('desktop launcher folder contains a valid Electron entry point',()=>{
 const manifest=JSON.parse(fs.readFileSync(path.join(root,'app/package.json'),'utf8'));
 assert.ok(fs.existsSync(path.join(root,'app',manifest.main)));
 execFileSync(process.execPath,['--check',path.join(root,'app',manifest.main)],{stdio:'pipe'});
});

test('bounded roaming uses upstream animation time, pauses at both ends and turns at edges',{skip:!fs.existsSync(runtime)},()=>{
 execFileSync(process.execPath,[path.join(root,'scripts/apply-region-roaming.mjs')],{stdio:'pipe'});
 const helper=path.join(runtime,'runtime/electron-helper'),frames=new Map();let frameId=0,tick,receive;
 const context=vm.createContext({navigator:{platform:'Win32'},console,Date,Math,
  VIEW:{x:-800,y:-400,w:2000,h:1400},AREAS:[{x:0,y:0,width:2000,height:1400}],
  toScreen:v=>v*1.25,toLocal:v=>v/1.25,sprites:[],
  window:{DfyGeometry:require('../app/geometry.cjs'),__dshPetDebug:{},petBridge:{onCompanionArea:fn=>receive=fn,setBounds(){}}},
  setInterval:fn=>tick=fn,requestAnimationFrame:fn=>{frames.set(++frameId,fn);return frameId;},cancelAnimationFrame:id=>frames.delete(id)});
 vm.runInContext(fs.readFileSync(path.join(helper,'shared-core.js'),'utf8')+'\nconst S=PetShared;',context);
 vm.runInContext(fs.readFileSync(path.join(helper,'sprite.js'),'utf8'),context);
 vm.runInContext(fs.readFileSync(path.join(root,'app/pet-area-renderer.js'),'utf8'),context);
 const s=vm.runInContext(`Object.assign(Object.create(PetSprite.prototype),{
  pet:{fixedEnabled:true},size:200,height:112.5,halfW:100,halfH:56.25,bottomPad:9.375,winH:121.875,
  pos:{x:200,y:200},margin:{l:0,t:0,r:0,b:0},dragState:{active:false},_facing:'right',
  moveRef:null,throwRef:null,posFollow:null,moveToken:0,posFollowToken:0,throwToken:0,
  weights:{idle:0,turn:0,move:100},animations:{idle:['idle'],turn:['turn'],drag:[],clicks:[],events:{},categories:[],
   moves:{default:{minDist:60,maxDist:240,margin:20,leadSec:2,tailSec:2},actions:[{name:'walk'}]}},
  markPoseDirty(){},switchTo(name){this.lastAnimation=name;}
 })`,context);
 context.sprites.push(s);
 const rect={left:-600,top:-200,right:400,bottom:500};receive({enabled:true,rect});tick();
 s.playIdle();assert.equal(s.lastAnimation,'walk');assert.equal(s.pet.fixedEnabled,true);assert.ok(s.pendingMove);
 const video={duration:10,currentTime:0};s.startMoveDrive(video);
 const advance=time=>{video.currentTime=time;const callbacks=[...frames.values()];frames.clear();callbacks.forEach(fn=>fn());};
 const start=s.pos.x;advance(1);assert.equal(s.pos.x,start);
 advance(5);assert.ok(s.pos.x>start);const middle=s.pos.x;
 advance(8);assert.ok(s.pos.x>middle);const end=s.pos.x;advance(9);assert.equal(s.pos.x,end);
 assert.ok((s.pos.x+context.VIEW.x)*1.25>=rect.left+7);
 assert.ok((s.pos.x+context.VIEW.x+s.size)*1.25<=rect.right-7);
 assert.ok((s.pos.y+context.VIEW.y+s.bottomPad)*1.25>=rect.top+7);
 s.facing='left';s.sendBounds(-100000,s.pos.y);s.customPos=null;
 assert.equal(s.tryMove(),'turn');assert.equal(s.facing,'left');
 s.handleEnded();assert.equal(s.facing,'right');
 s.startMoveDrive(video);receive({enabled:false});tick();assert.equal(s.moveRef,null);assert.equal(s.pendingMove,null);
 assert.equal(s.lastAnimation,'idle');
});
test('upstream patches are idempotent and keep all installed JavaScript parseable',{skip:!fs.existsSync(runtime)},()=>{
 const scripts=['apply-close-button.mjs','apply-drag-start.mjs','apply-region-roaming.mjs'];
 const files=['runtime/electron-helper/main.js','runtime/electron-helper/preload.js','runtime/electron-helper/sprite.js','runtime/electron-helper/doupet-area.js','runtime/electron-helper/doupet-geometry.js','runtime/electron-helper/index.html','lib/index.js','lib/standalone.js'];
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
