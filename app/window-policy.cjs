const {win32}=require('node:path');
// Native-client titles may be empty or show only the current video's caption.
// Inspect the owning executable rather than trusting an arbitrary window title.
function targetKind(info){
 const exe=win32.basename(info?.processPath||'').toLowerCase();
 if(exe==='douyin.exe')return 'desktop';
 if((exe==='chrome.exe'||exe==='msedge.exe')&&/抖音/.test(info?.title||''))return 'browser';
 return null;
}
function isDouyinWindow(info){return !!info?.visible&&!!info.bounds&&!!targetKind(info);}
module.exports={targetKind,isDouyinWindow};
