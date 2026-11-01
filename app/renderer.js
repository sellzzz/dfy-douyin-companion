const $=id=>document.getElementById(id),video=$('video'),overlay=$('crop');
let stream,active=false,confirmed=false,epoch=0,crop=null,drag=null,busy=false,attachmentId=0,lastPixels=null,lastMotion=0;
function status(s){$('status').textContent=s;window.companion.status(s).catch(()=>{});}
async function refresh(){const list=await window.companion.sources();$('windows').replaceChildren(...list.map(s=>Object.assign(document.createElement('option'),{value:s.id,textContent:s.name})));status(list.length?'请选择抖音客户端或浏览器中的抖音窗口。':'没有发现抖音窗口，请打开抖音 Windows 客户端或浏览器中的抖音，再刷新。');}
function draw(){overlay.width=overlay.clientWidth;overlay.height=overlay.clientHeight;const c=overlay.getContext('2d');c.clearRect(0,0,overlay.width,overlay.height);const p=crop&&window.DfyGeometry.videoToPreviewCrop(crop,{width:overlay.width,height:overlay.height},{width:video.videoWidth,height:video.videoHeight});if(p){c.strokeStyle='#37dcb2';c.lineWidth=3;c.strokeRect(p.x*overlay.width,p.y*overlay.height,p.w*overlay.width,p.h*overlay.height);}}
function point(e){const r=overlay.getBoundingClientRect();return {x:Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)),y:Math.max(0,Math.min(1,(e.clientY-r.top)/r.height))};}
overlay.onpointerdown=e=>{if(!stream||active)return;drag=point(e);overlay.setPointerCapture(e.pointerId);};
overlay.onpointermove=e=>{if(!drag)return;const p=point(e),selection={x:Math.min(p.x,drag.x),y:Math.min(p.y,drag.y),w:Math.abs(p.x-drag.x),h:Math.abs(p.y-drag.y)};crop=window.DfyGeometry.previewToVideoCrop(selection,{width:overlay.clientWidth,height:overlay.clientHeight},{width:video.videoWidth,height:video.videoHeight});draw();};
overlay.onpointerup=()=>{if(!drag)return;drag=null;$('start').disabled=!(crop&&crop.w>.05&&crop.h>.05);status('已框选画面。点击“开始陪看”，再确认绿色框。');};
async function pause(){active=false;epoch++;attachmentId++;await window.companion.stop();$('pause').disabled=true;$('start').disabled=!crop;status('已暂停分析。预览仍在本机显示，可点“结束采集”彻底停止。');}
async function stop(){await pause();await window.companion.end();stream?.getTracks().forEach(t=>t.stop());stream=null;video.srcObject=null;crop=null;confirmed=false;lastPixels=null;$('windows').disabled=false;$('refresh').disabled=false;$('start').disabled=true;draw();status('已结束采集。');}
async function capture(id){
 try{return await navigator.mediaDevices.getDisplayMedia({audio:false,video:{frameRate:2}});}
 catch(e){if(e.name!=='InvalidStateError')throw e;return navigator.mediaDevices.getUserMedia({audio:false,video:{mandatory:{chromeMediaSource:'desktop',chromeMediaSourceId:id,maxFrameRate:2}}});}
}
window.doupetAttach=async function(target){
 let attempt;
 try{
  await stop();attempt=++attachmentId;const turn=++epoch;
  await window.companion.begin(target.id);
  if(attempt!==attachmentId)return;
  const captured=await capture(target.id);
  if(attempt!==attachmentId){captured.getTracks().forEach(t=>t.stop());return;}
  stream=captured;video.srcObject=stream;await video.play();
  stream.getVideoTracks()[0].onended=()=>{if(stream===captured)stop();};
  status('找到抖音了，正在看视频区域…');
  const c=document.createElement('canvas'),scale=Math.min(1,1280/Math.max(video.videoWidth,video.videoHeight));
  c.width=Math.round(video.videoWidth*scale);c.height=Math.round(video.videoHeight*scale);
  c.getContext('2d').drawImage(video,0,0,c.width,c.height);
  crop=await window.companion.locate(c.toDataURL('image/jpeg',.75).split(',')[1],target.anchor,video.videoWidth/video.videoHeight);
  if(turn!==epoch||attempt!==attachmentId)return;
  status('画好绿色框后，点一下桌宠开始陪看。');
  crop=await window.companion.confirmRegion(crop);
  if(turn!==epoch||attempt!==attachmentId)return;
  confirmed=true;
  const select=$('windows');if(![...select.options].some(o=>o.value===target.id)){select.add(Object.assign(document.createElement('option'),{value:target.id,textContent:target.name}));}select.value=target.id;select.disabled=true;$('refresh').disabled=true;
  active=true;$('start').disabled=true;$('pause').disabled=false;draw();
  lastPixels=null;lastMotion=Date.now();status('正在一起看 · 宠物在已确认的框内活动');
  await window.companion.hint('好呀，我来陪你一起看。');
 }catch(e){if(attempt!==attachmentId)return;await stop();status(e.message);window.companion.hint('还没找到画面，把我拖到视频中间再试一下。').catch(()=>{});}
};
window.companion.onControl(async action=>{
 if(action==='settings'){window.doupetOpenSettings();return;}
 if(action==='stop'){await stop();return;}
 if(action==='toggle'){
  if(active){await pause();window.companion.hint('先休息一下，点我头上的暂停键就能继续。').catch(()=>{});}
  else if(stream&&crop&&confirmed){await window.companion.begin($('windows').value);active=true;epoch++;lastMotion=Date.now();$('start').disabled=true;$('pause').disabled=false;status('继续一起看');}
 }
});
$('refresh').onclick=()=>refresh().catch(e=>status(e.message));
$('preview').onclick=async()=>{try{await stop();const id=$('windows').value;if(!id)throw Error('请先选择抖音窗口');await window.companion.begin(id);stream=await navigator.mediaDevices.getDisplayMedia({audio:false,video:{frameRate:2}});video.srcObject=stream;await video.play();$('windows').disabled=true;$('refresh').disabled=true;stream.getVideoTracks()[0].onended=stop;draw();status('请在预览中拖框，只选视频播放器画面。');}catch(e){status(e.message);}};
$('start').onclick=async()=>{try{if(!stream||!crop)return;await window.companion.begin($('windows').value);crop=await window.companion.confirmRegion(crop);confirmed=true;active=true;epoch++;lastPixels=null;lastMotion=Date.now();$('start').disabled=true;$('pause').disabled=false;status('陪看中：宠物会在确认的范围内自由活动。');}catch(e){status(e.message);}};
$('pause').onclick=pause;$('stop').onclick=stop;
setInterval(async()=>{if(!active||busy||!stream||!video.videoWidth||!crop)return;busy=true;const turn=epoch;
try{const c=document.createElement('canvas'),vw=video.videoWidth,vh=video.videoHeight;
// All selections are stored in video-frame coordinates, independent of preview letterboxing.
const x=crop.x*vw,y=crop.y*vh,w=crop.w*vw,h=crop.h*vh;
if(w<30||h<30)throw Error('请重新框选视频画面');const down=Math.min(1,640/Math.max(w,h));c.width=Math.round(w*down);c.height=Math.round(h*down);c.getContext('2d').drawImage(video,x,y,w,h,0,0,c.width,c.height);
const motion=document.createElement('canvas');motion.width=32;motion.height=24;const mc=motion.getContext('2d');mc.drawImage(c,0,0,32,24);const pixels=mc.getImageData(0,0,32,24).data;
let difference=999;if(lastPixels){let total=0;for(let i=0;i<pixels.length;i+=4)total+=Math.abs(pixels[i]-lastPixels[i])+Math.abs(pixels[i+1]-lastPixels[i+1])+Math.abs(pixels[i+2]-lastPixels[i+2]);difference=total/(32*24*3);}
lastPixels=pixels;if(difference>1.5)lastMotion=Date.now();const moving=Date.now()-lastMotion<8000;await window.companion.activity(moving);
if(!moving){status('画面暂时静止，宠物歇一会儿。');return;}
status('正在看画面…');const result=await window.companion.infer(c.toDataURL('image/jpeg',.7).split(',')[1]);
if(turn!==epoch||!active)return;if(result.stopped){await stop();status(result.text);}else if(result.waiting){status(result.text);}else if(!result.skipped){$('response').textContent=result.text;$('local-summary').textContent=(result.cloudStatus==='off'?'本地陪刷：':'本地画面描述：')+result.localSummary;status(`陪看中 · ${result.replySource==='deepseek'?'DeepSeek 接话':result.cloudStatus==='fallback'?'本地结果（'+result.cloudMessage+'）':'只用本地，不推送'} · ${result.latencySeconds.toFixed(2)} 秒`);}
}catch(e){if(turn===epoch)status('暂时无法回应：'+e.message);}finally{busy=false;}},5000);
window.addEventListener('resize',draw);refresh().then(()=>{if(new URLSearchParams(location.search).get('mode')==='drag')status('拖到抖音视频，确认绿色框后开始陪看');}).catch(e=>status(e.message));
