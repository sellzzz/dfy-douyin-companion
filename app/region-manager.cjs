const {BrowserWindow,screen,ipcMain}=require('electron');
const {writeFileSync,mkdirSync}=require('node:fs');
const path=require('node:path');
const {checkedCrop,cropScreenRect}=require('./geometry.cjs');
class RegionManager{
 constructor({root,native,onConfirm,onEnd}){
  Object.assign(this,{root,native,onConfirm,onEnd});this.window=null;this.selection=null;this.pending=null;
  this.file=path.join(root,'work/dsh-home/doupet/area.json');mkdirSync(path.dirname(this.file),{recursive:true});this.publish(false);
  ipcMain.on('region-ready',e=>{if(e.sender===this.window?.webContents)this.send();});
  ipcMain.handle('region-confirm',async(e,proposed)=>{
   this.verify(e);if(!this.pending||this.confirming)throw Error('选框已提交，请稍候');
   const crop=checkedCrop(proposed),info=this.info(),rect=info&&cropScreenRect(info.bounds,crop);
   if(!rect||rect.right-rect.left<180||rect.bottom-rect.top<120)throw Error('范围太小，请至少选择 180 × 120 像素的画面。');
   const pending=this.pending,selection=this.selection;
   this.confirming=true;try{await this.onConfirm(rect);}finally{this.confirming=false;}
   if(this.selection!==selection||this.pending!==pending)throw Error('选框已经取消');
   selection.crop=crop;selection.confirmed=true;selection.editing=false;selection.lastSize=[rect.right-rect.left,rect.bottom-rect.top].join(':');
   this.window.setIgnoreMouseEvents(true,{forward:true});this.send();this.window.hide();this.publish(!this.paused&&!this.still,rect);
   this.pending=null;pending?.resolve(crop);return crop;
  });
  ipcMain.handle('region-cancel',e=>{this.verify(e);this.clear('已取消选框');this.onEnd();});
  this.timer=setInterval(()=>this.sync(),500);
 }
 verify(e){if(!this.window||e.sender!==this.window.webContents)throw Error('无效的选框窗口');}
 info(){if(!this.selection)return null;const info=this.native.details(Number(this.selection.sourceId.split(':')[1]));return info.bounds&&info.visible&&/抖音/.test(info.title)&&/Chrome|Edge/.test(info.title)?info:null;}
 publish(enabled,rect){this.available=enabled;writeFileSync(this.file,JSON.stringify({enabled,rect:enabled?rect:null,updatedAt:Date.now(),pid:process.pid}));}
 send(){if(this.window&&!this.window.isDestroyed()&&this.selection)this.window.webContents.send('region-state',{crop:this.selection.crop,editing:this.selection.editing});}
 show(sourceId,proposed){
  this.clear('重新选择范围');const crop=checkedCrop(proposed);if(!crop)throw Error('无效的视频范围');
  this.selection={sourceId,crop,confirmed:false,editing:true};const info=this.info();if(!info){this.clear('抖音窗口不可用');throw Error('抖音窗口不可用');}
  const r=info.bounds,dip=screen.screenToDipRect(null,{x:r.left,y:r.top,width:r.right-r.left,height:r.bottom-r.top});
  this.window=new BrowserWindow({...dip,show:false,frame:false,transparent:true,resizable:false,skipTaskbar:true,focusable:false,hasShadow:false,title:'DFY 确认陪看范围',webPreferences:{preload:path.join(__dirname,'region-preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}});
  this.window.setAlwaysOnTop(true,'floating');this.window.setMenuBarVisibility(false);
  this.window.webContents.setWindowOpenHandler(()=>({action:'deny'}));this.window.webContents.on('will-navigate',e=>e.preventDefault());
  this.window.once('ready-to-show',()=>{if(this.window&&!this.window.isDestroyed()){if(this.selection?.editing)this.window.showInactive();this.send();}});
  this.window.loadFile('region-editor.html');
  return new Promise((resolve,reject)=>{this.pending={resolve,reject};});
 }
 sync(){
  if(!this.selection)return;
  const info=this.info();if(!info){this.clear('抖音窗口已关闭或离开抖音');this.onEnd();return;}
  if(info.minimized){this.window?.hide();this.publish(false);return;}
  const r=info.bounds,dip=screen.screenToDipRect(null,{x:r.left,y:r.top,width:r.right-r.left,height:r.bottom-r.top});
  if(this.window&&!this.window.isDestroyed()){
   const old=this.window.getBounds();if(['x','y','width','height'].some(k=>old[k]!==dip[k]))this.window.setBounds(dip,false);
   if(this.selection.editing){if(!this.window.isVisible())this.window.showInactive();}
   else if(this.window.isVisible())this.window.hide();
  }
  const rect=cropScreenRect(r,this.selection.crop),size=[rect.right-rect.left,rect.bottom-rect.top].join(':');
  if(rect.right-rect.left<180||rect.bottom-rect.top<120){this.publish(false);return;}
  if(this.selection.confirmed&&size!==this.selection.lastSize){
   if(!this.fitting){this.fitting=true;const current=this.selection;this.onConfirm(rect).then(()=>{if(this.selection===current)current.lastSize=size;}).catch(()=>{}).finally(()=>{this.fitting=false;});}
   this.publish(false);return;
  }
  this.publish(this.selection.confirmed&&!this.paused&&!this.still,rect);
 }
 permits(sourceId){return !!this.selection?.confirmed&&this.available&&this.selection.sourceId===sourceId;}
 setPaused(value){this.paused=!!value;this.sync();}
 setStill(value){this.still=!!value;this.sync();}
 clear(reason='陪看已结束'){
  const pending=this.pending;this.pending=null;this.selection=null;
  if(this.window&&!this.window.isDestroyed())this.window.destroy();this.window=null;this.publish(false);pending?.reject(Error(reason));
 }
 dispose(){clearInterval(this.timer);this.clear();}
}
module.exports={RegionManager};
