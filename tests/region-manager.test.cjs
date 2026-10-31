const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),vm=require('node:vm');
const {EventEmitter}=require('node:events');
function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'dfy-region-')),handlers=new Map();
 let details={bounds:{left:0,top:0,right:1600,bottom:1000},visible:true,minimized:false,title:'抖音 - Google Chrome'};
 const windows=[];
 class FakeWindow extends EventEmitter{
  constructor(bounds){super();this.bounds=bounds;this.webContents=new EventEmitter();Object.assign(this.webContents,{send(){},setWindowOpenHandler(){}});windows.push(this);}
  setAlwaysOnTop(){} setMenuBarVisibility(){} loadFile(){} setIgnoreMouseEvents(value){this.clickThrough=value;}
  isDestroyed(){return !!this.destroyed;}destroy(){this.destroyed=true;}isVisible(){return !!this.visible;}showInactive(){this.visible=true;}hide(){this.visible=false;}
  getBounds(){return this.bounds;}setBounds(b){this.bounds=b;}
 }
 const electron={BrowserWindow:FakeWindow,screen:{screenToDipRect:(_,r)=>r},ipcMain:{on(){},handle:(name,fn)=>handlers.set(name,fn)}};
 const context={module:{exports:{}},require:id=>id==='electron'?electron:id==='./geometry.cjs'?require('../app/geometry.cjs'):require(id),__dirname:path.resolve(__dirname,'../app'),process,setInterval:()=>0,clearInterval(){}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../app/region-manager.cjs'),'utf8'),context);
 let ends=0,fits=0,fit=async()=>{};
 const manager=new context.module.exports.RegionManager({root,native:{details:()=>details},onConfirm:async rect=>{fits++;await fit(rect);},onEnd:()=>ends++});
 t.after(()=>{manager.dispose();fs.rmSync(root,{recursive:true,force:true});});
 return {manager,handlers,windows,details,setFit:fn=>fit=fn,get fits(){return fits;},get ends(){return ends;},event:()=>({sender:windows.at(-1).webContents}),area:()=>JSON.parse(fs.readFileSync(manager.file,'utf8'))};
}
const crop={x:.1,y:.2,w:.7,h:.6},source='window:123:0';
test('human confirmation gates inference; pause, stillness, minimize and resize suspend it',async t=>{
 const f=fixture(t),m=f.manager,pending=m.show(source,crop);
 m.sync();assert.equal(m.permits(source),false);assert.equal(f.area().enabled,false);
 await f.handlers.get('region-confirm')(f.event(),crop);await pending;
 assert.equal(m.permits(source),true);assert.equal(m.permits('window:other'),false);assert.equal(f.windows[0].clickThrough,true);
 assert.deepEqual(f.area().rect,{left:160,top:200,right:1280,bottom:800});
 for(const method of ['setPaused','setStill']){m[method](true);assert.equal(m.permits(source),false);m[method](false);assert.equal(m.permits(source),true);}
 f.details.minimized=true;m.sync();assert.equal(m.permits(source),false);f.details.minimized=false;m.sync();assert.equal(m.permits(source),true);
 f.details.bounds={left:-1000,top:-500,right:0,bottom:300};m.sync();assert.equal(m.permits(source),false);
 await new Promise(resolve=>setImmediate(resolve));m.sync();assert.equal(m.permits(source),true);assert.equal(f.fits,2);
 assert.deepEqual(f.area().rect,{left:-900,top:-340,right:-200,bottom:140});
 f.details.title='其他页面 - Google Chrome';m.sync();assert.equal(m.permits(source),false);assert.equal(f.ends,1);
});
test('cancel during pet fitting cannot enable a stale region',async t=>{
 const f=fixture(t),m=f.manager;let finish;f.setFit(()=>new Promise(resolve=>finish=resolve));
 const pending=m.show(source,crop),rejected=assert.rejects(pending,/取消/);
 const confirming=f.handlers.get('region-confirm')(f.event(),crop),stale=assert.rejects(confirming,/取消/);
 await assert.rejects(f.handlers.get('region-confirm')(f.event(),crop),/稍候/);
 m.clear('已取消选框');finish();await Promise.all([rejected,stale]);assert.equal(f.area().enabled,false);assert.equal(m.permits(source),false);
});
test('invalid or foreign confirmation cannot start capture analysis',async t=>{
 const f=fixture(t),pending=f.manager.show(source,crop),cancelled=assert.rejects(pending);
 await assert.rejects(f.handlers.get('region-confirm')({sender:{}},crop),/无效/);
 await assert.rejects(f.handlers.get('region-confirm')(f.event(),{x:0,y:0,w:.01,h:.01}),/太小/);
 assert.equal(f.area().enabled,false);f.manager.clear();await cancelled;
});
