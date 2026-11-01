import {readFileSync,writeFileSync,existsSync,copyFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
const bridge=`
// DFY confirmed area bridge BEGIN
let doupetLastArea='',doupetLastAreaSent=0;
const doupetAreaPoll=setInterval(()=>{
 try{
  const fs=require('node:fs'),path=require('node:path');
  const home=process.env.DSH_HOME||path.join(require('node:os').homedir(),'.dsh');
  let area=JSON.parse(fs.readFileSync(path.join(home,'doupet','area.json'),'utf8'));
  if(!area.enabled||Date.now()-area.updatedAt>2500)area={enabled:false};
  else{try{process.kill(area.pid,0);}catch{area={enabled:false};}}
  if(area.enabled&&(!area.rect||['left','top','right','bottom'].some(k=>!Number.isFinite(area.rect[k]))))area={enabled:false};
  const payload=area.enabled?{enabled:true,rect:area.rect}:{enabled:false};
  const key=JSON.stringify(payload);if(key===doupetLastArea&&Date.now()-doupetLastAreaSent<1000)return;doupetLastArea=key;doupetLastAreaSent=Date.now();
  for(const win of windows.values())if(!win.isDestroyed())win.webContents.send('doupet:area',payload);
 }catch{
  if(doupetLastArea!=='off'){doupetLastArea='off';for(const win of windows.values())if(!win.isDestroyed())win.webContents.send('doupet:area',{enabled:false});}
 }
},300);
app.on('before-quit',()=>clearInterval(doupetAreaPoll));
// DFY confirmed area bridge END
`;
for(const base of ['work/runtime/node_modules/dsh-pet','work/dsh-home/profiles/web/node_modules/dsh-pet','work/dsh-pet/dsh-pet']){
 const dir=resolve(root,base,'runtime/electron-helper');if(!existsSync(dir))continue;
 const patch=(file,fn)=>{const p=resolve(dir,file),s=readFileSync(p,'utf8'),out=fn(s);if(s!==out)writeFileSync(p,out);};
 copyFileSync(resolve(root,'app/pet-area-renderer.js'),resolve(dir,'doupet-area.js'));
 copyFileSync(resolve(root,'app/geometry.cjs'),resolve(dir,'doupet-geometry.js'));
 patch('index.html',s=>s.includes('doupet-area.js')?s:s.replace('    <script src="./renderer.js"></script>','    <script src="./doupet-geometry.js"></script>\n    <script src="./doupet-area.js"></script>\n    <script src="./renderer.js"></script>'));
 patch('preload.js',s=>s.includes('onCompanionArea(')?s:s.replace("contextBridge.exposeInMainWorld('petBridge', {","contextBridge.exposeInMainWorld('petBridge', {\n  onCompanionArea(cb) { ipcRenderer.on('doupet:area',(_event,area)=>cb(area)); },"));
 patch('main.js',s=>s.includes('// DFY confirmed area bridge BEGIN')?s.replace(/\/\/ DFY confirmed area bridge BEGIN[\s\S]*?\/\/ DFY confirmed area bridge END\n?/,bridge.trimStart()):s.replace("  ipcMain.on('pet:set-interactive'",bridge+"  ipcMain.on('pet:set-interactive'"));
 const input=existsSync(resolve(dir,'sprite/input.js'))?'sprite/input.js':'sprite.js';
 patch(input,s=>s.includes('this.doupetSuspendUntil =')?s:s.replace('    // DouPet: release means','    // DouPet: release means').replace('      this.dragTrail = [];\n      this.customPos =','      this.doupetSuspendUntil = Date.now() + 1500;\n      this.dragTrail = [];\n      this.customPos ='));
 // Keep upstream video.currentTime-driven walking; constrain only its planner.
 const movement=existsSync(resolve(dir,'sprite/motion.js'))?'sprite/motion.js':'sprite.js';
 patch(movement,s=>s.includes('(this.doupetPlanMove || S.planMove).call(this, {')?s:s.replace('const plan = S.planMove({','const plan = (this.doupetPlanMove || S.planMove).call(this, {'));
}
console.log('Confirmed-region pet roaming applied.');
