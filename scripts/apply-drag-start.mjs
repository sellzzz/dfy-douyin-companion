import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
function edit(file,fn){if(existsSync(file)){const s=readFileSync(file,'utf8'),out=fn(s);if(out!==s)writeFileSync(file,out);}}
const notify=`
// DouPet drag-to-watch: fixed loopback endpoint, local process capability, no browser control.
async function doupetNotify(action, win, petId) {
  try {
    const fs=require('node:fs'),path=require('node:path');
    const home=process.env.DSH_HOME||path.join(require('node:os').homedir(),'.dsh');
    const config=JSON.parse(fs.readFileSync(path.join(home,'doupet','controller.json'),'utf8'));
    const handle=win&&!win.isDestroyed()?Number(win.getNativeWindowHandle().readBigUInt64LE()):0;
    await fetch('http://127.0.0.1:3082/'+action,{method:'POST',headers:{'content-type':'application/json','x-doupet-token':config.token},body:JSON.stringify({petId:String(petId||'main'),skipHandle:handle}),signal:AbortSignal.timeout(3000)}).catch(()=>{});
  } catch {}
}
ipcMain.on('doupet:dropped',(event,petId)=>{const win=BrowserWindow.fromWebContents(event.sender);if(win&&!win.isDestroyed())doupetNotify('drop',win,petId);});
ipcMain.on('doupet:control',(event,action)=>{if(!['toggle','stop'].includes(action))return;const win=BrowserWindow.fromWebContents(event.sender);if(win&&!win.isDestroyed())doupetNotify(action,win,'main');});
ipcMain.handle('doupet:close',async(event)=>{const win=BrowserWindow.fromWebContents(event.sender);if(win&&!win.isDestroyed())await doupetNotify('stop',win,'main');return true;});
`;
const drop=`
    // DouPet: release means place the pet and choose the underlying video, never fling it away.
    if (wasDragging && e && window.petBridge && window.petBridge.doupetDropped) {
      this.justDragged = true;
      setTimeout(() => { this.justDragged = false; }, 150);
      this.dragTrail = [];
      this.customPos = { rx: (this.pos.x + this.halfW) / VIEW.w, ry: (this.pos.y + this.halfH) / VIEW.h };
      this.position();
      if (this.animations.idle.length) this.playOnce(S.pick(this.animations.idle, this.anim));
      window.petBridge.doupetDropped(this.pet.id);
      return;
    }
`;
for(const base of ['work/runtime/node_modules/dsh-pet','work/dsh-home/profiles/web/node_modules/dsh-pet','work/dsh-pet/dsh-pet']){
 const dir=resolve(root,base,'runtime/electron-helper');
 const file=existsSync(resolve(dir,'sprite/input.js'))?resolve(dir,'sprite/input.js'):resolve(dir,'sprite.js');
 edit(file,s=>{if(s.includes('// DouPet: release means'))return s;const anchor='    if (wasDragging) {';if(!s.includes(anchor))throw Error('Drag hook not found: '+file);return s.replace(anchor,drop+anchor);});
 edit(resolve(dir,'preload.js'),s=>s.includes('doupetDropped(')?s:s.replace("contextBridge.exposeInMainWorld('petBridge', {",`contextBridge.exposeInMainWorld('petBridge', {
  doupetDropped(petId) { ipcRenderer.send('doupet:dropped',String(petId||'main')); },
  doupetControl(action) { ipcRenderer.send('doupet:control',action); },`));
 edit(resolve(dir,'main.js'),s=>{
  if(s.includes('function doupetNotify('))return s.replace(/\/\/ DouPet drag-to-watch:[\s\S]*?ipcMain\.on\('doupet:control',[^\n]*\);\n(?:ipcMain\.handle\('doupet:close',[^\n]*\);\n)?/,notify.trimStart());
  return s.replace("  ipcMain.on('pet:set-interactive'",notify+"  ipcMain.on('pet:set-interactive'");
 });
 // Split source main registers the handler in another file; leave its bootstrap hook explicitly.
 if(existsSync(resolve(dir,'main'))){edit(resolve(dir,'main.js'),s=>s.includes('function doupetNotify(')?s:s+'\n'+notify);}
 const init=existsSync(resolve(dir,'sprite/init.js'))?resolve(dir,'sprite/init.js'):resolve(dir,'sprite.js');
 edit(resolve(dir,'preload.js'),s=>s.includes('doupetClose(')?s:s.replace("contextBridge.exposeInMainWorld('petBridge', {", "contextBridge.exposeInMainWorld('petBridge', {\n  doupetClose() { return ipcRenderer.invoke('doupet:close'); },"));
 edit(init,s=>s.includes('doupetControl(\'stop\')')?s:s.replace('      window.close();',"      window.petBridge?.doupetControl('stop');\n      window.close();"));
 edit(init,s=>s.replace("closeButton.addEventListener('click', (event) => {", "closeButton.addEventListener('click', async (event) => {").replace("      window.petBridge?.doupetControl('stop');", "      if (window.petBridge?.doupetClose) await window.petBridge.doupetClose();\n      else window.petBridge?.doupetControl('stop');"));
 edit(init,s=>{let kept=false;return s.replace(/    const pauseButton=document\.createElement\('button'\);[\s\S]*?    this\.hit\.appendChild\(pauseButton\);\n/g,block=>{if(kept)return '';kept=true;return block;});});
 edit(init,s=>s.includes('doupet-close doupet-pause')?s:s.replace('    this.hit.appendChild(closeButton);',`    this.hit.appendChild(closeButton);
    const pauseButton=document.createElement('button');
    pauseButton.type='button'; pauseButton.className='doupet-close doupet-pause';
    pauseButton.style.right='34px'; pauseButton.textContent='Ⅱ';
    pauseButton.title='暂停/继续陪看'; pauseButton.setAttribute('aria-label','暂停或继续陪看');
    pauseButton.addEventListener('pointerdown',e=>e.stopPropagation());
    pauseButton.addEventListener('click',e=>{e.stopPropagation();window.petBridge?.doupetControl('toggle');});
    this.hit.appendChild(pauseButton);`));
}
console.log('Drag-to-watch hooks applied.');
