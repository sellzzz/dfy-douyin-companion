const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('regionEditor',{
 confirm:crop=>ipcRenderer.invoke('region-confirm',crop),cancel:()=>ipcRenderer.invoke('region-cancel'),
 onState:fn=>ipcRenderer.on('region-state',(_event,state)=>fn(state)),ready:()=>ipcRenderer.send('region-ready')
});
