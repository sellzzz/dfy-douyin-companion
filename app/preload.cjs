const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('companion',{
 sources:()=>ipcRenderer.invoke('sources'),begin:id=>ipcRenderer.invoke('begin',id),
 stop:()=>ipcRenderer.invoke('stop'),infer:image=>ipcRenderer.invoke('infer',image),
 locate:(image,anchor,aspect)=>ipcRenderer.invoke('locate',image,anchor,aspect),
 status:text=>ipcRenderer.invoke('status',text),
 hint:text=>ipcRenderer.invoke('hint',text),
 onControl:fn=>ipcRenderer.on('control',(_event,action)=>fn(action))
});
