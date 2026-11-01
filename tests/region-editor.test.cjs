const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
test('pet confirmation uses the latest drawn box, never auto-confirms a drag, and ignores an unfinished stroke',async()=>{
 const elements=new Map(),listeners=new Map(),submitted=[];let state,confirm;
 for(const id of ['box','toolbar','note','redraw','cancel','confirm'])elements.set(id,{style:{},dataset:{},offsetWidth:400,offsetHeight:40,contains:()=>false,setPointerCapture(){}});
 const context={innerWidth:1000,innerHeight:800,document:{getElementById:id=>elements.get(id),body:{style:{},classList:{toggle(){}}},addEventListener:(name,fn)=>listeners.set(name,fn)},window:{addEventListener(){},regionEditor:{onState:fn=>state=fn,onConfirmRequest:fn=>confirm=fn,confirm:async c=>submitted.push({...c}),ready(){}}}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../app/region-editor.js'),'utf8'),context);
 state({crop:{x:.1,y:.1,w:.5,h:.5},editing:true});
 listeners.get('pointerdown')({target:elements.get('box'),clientX:200,clientY:160,pointerId:1,preventDefault(){}});
 listeners.get('pointermove')({clientX:300,clientY:240});await confirm();assert.equal(submitted.length,0);
 listeners.get('pointerup')();assert.equal(submitted.length,0);await confirm();
 assert.equal(submitted.length,1);for(const [key,value] of Object.entries({x:.2,y:.2,w:.5,h:.5}))assert.ok(Math.abs(submitted[0][key]-value)<1e-9);
 state({crop:submitted[0],editing:false});await confirm();assert.equal(submitted.length,1);
});
