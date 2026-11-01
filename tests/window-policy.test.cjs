const test=require('node:test'),assert=require('node:assert/strict');
const {targetKind,isDouyinWindow}=require('../app/window-policy.cjs');
const bounds={left:0,top:0,right:1000,bottom:800};
test('Windows Douyin is selectable even with an empty or changing video title',()=>{
 for(const title of ['', '抖音', '今天的视频标题']){
  const info={title,processPath:'D:\\Program Files (x86)\\ByteDance\\douyin\\douyin.exe',visible:true,bounds};
  assert.equal(targetKind(info),'desktop');assert.equal(isDouyinWindow(info),true);
 }
});
test('browser capture still requires a Douyin title and an actual supported browser process',()=>{
 for(const processPath of ['C:\\Chrome\\chrome.exe','C:\\Edge\\MSEDGE.EXE']){
  assert.equal(targetKind({title:'抖音 - 浏览器',processPath}),'browser');
  assert.equal(targetKind({title:'其他网站',processPath}),null);
 }
 for(const processPath of ['', 'C:\\editor.exe','D:\\douyin_tray.exe','D:\\douyin_guard.exe'])assert.equal(targetKind({title:'抖音 - Google Chrome',processPath}),null);
 assert.equal(isDouyinWindow({title:'抖音',processPath:'D:\\douyin.exe',visible:false,bounds}),false);
});
