const $=id=>document.getElementById(id),video=$('video'),overlay=$('crop');
let stream,active=false,epoch=0,crop=null,drag=null,busy=false,attachmentId=0;
function status(s){$('status').textContent=s;window.companion.status(s).catch(()=>{});}
async function refresh(){const list=await window.companion.sources();$('windows').replaceChildren(...list.map(s=>Object.assign(document.createElement('option'),{value:s.id,textContent:s.name})));status(list.length?'请选择 Chrome多开1 的抖音窗口。':'没有发现抖音窗口，请先在 Chrome多开1 打开抖音，再刷新。');}
function draw(){overlay.width=overlay.clientWidth;overlay.height=overlay.clientHeight;const c=overlay.getContext('2d');c.clearRect(0,0,overlay.width,overlay.height);if(crop){c.strokeStyle='#37dcb2';c.lineWidth=3;c.strokeRect(crop.x*overlay.width,crop.y*overlay.height,crop.w*overlay.width,crop.h*overlay.height);}}
function point(e){const r=overlay.getBoundingClientRect();return {x:Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)),y:Math.max(0,Math.min(1,(e.clientY-r.top)/r.height))};}
overlay.onpointerdown=e=>{if(!stream||active)return;drag=point(e);overlay.setPointerCapture(e.pointerId);};
overlay.onpointermove=e=>{if(!drag)return;const p=point(e);crop={x:Math.min(p.x,drag.x),y:Math.min(p.y,drag.y),w:Math.abs(p.x-drag.x),h:Math.abs(p.y-drag.y)};draw();};
overlay.onpointerup=()=>{if(!drag)return;drag=null;$('start').disabled=!(crop&&crop.w>.05&&crop.h>.05);status('已框选画面。点击“开始陪看”，宠物会自动回应。');};
async function pause(){active=false;epoch++;attachmentId++;await window.companion.stop();$('pause').disabled=true;$('start').disabled=!crop;status('已暂停分析。预览仍在本机显示，可点“结束采集”彻底停止。');}
async function stop(){await pause();stream?.getTracks().forEach(t=>t.stop());stream=null;video.srcObject=null;crop=null;$('windows').disabled=false;$('refresh').disabled=false;$('start').disabled=true;draw();status('已结束采集。');}
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
  const select=$('windows');if(![...select.options].some(o=>o.value===target.id)){select.add(Object.assign(document.createElement('option'),{value:target.id,textContent:target.name}));}select.value=target.id;select.disabled=true;$('refresh').disabled=true;
  active=true;$('start').disabled=true;$('pause').disabled=false;draw();
  status('正在一起看 · 拖到别处可结束');
  await window.companion.hint('好呀，我来陪你一起看。');
 }catch(e){if(attempt!==attachmentId)return;await stop();status(e.message);window.companion.hint('还没找到画面，把我拖到视频中间再试一下。').catch(()=>{});}
};
window.companion.onControl(async action=>{
 if(action==='stop'){await stop();return;}
 if(action==='toggle'){
  if(active){await pause();window.companion.hint('先休息一下，点我头上的暂停键就能继续。').catch(()=>{});}
  else if(stream&&crop){await window.companion.begin($('windows').value);active=true;epoch++;$('start').disabled=true;$('pause').disabled=false;status('继续一起看');}
 }
});
$('refresh').onclick=()=>refresh().catch(e=>status(e.message));
$('preview').onclick=async()=>{try{await stop();const id=$('windows').value;if(!id)throw Error('请先选择抖音窗口');await window.companion.begin(id);stream=await navigator.mediaDevices.getDisplayMedia({audio:false,video:{frameRate:2}});video.srcObject=stream;await video.play();$('windows').disabled=true;$('refresh').disabled=true;stream.getVideoTracks()[0].onended=stop;draw();status('请在预览中拖框，只选视频播放器画面。');}catch(e){status(e.message);}};
$('start').onclick=async()=>{try{if(!stream||!crop)return;await window.companion.begin($('windows').value);active=true;epoch++;$('start').disabled=true;$('pause').disabled=false;status('陪看中：约每隔5秒看一次画面，模型回应后会显示在宠物气泡。');}catch(e){status(e.message);}};
$('pause').onclick=pause;$('stop').onclick=stop;
setInterval(async()=>{if(!active||busy||!stream||!video.videoWidth||!crop)return;busy=true;const turn=epoch;
try{const c=document.createElement('canvas'),vw=video.videoWidth,vh=video.videoHeight;
// object-fit letterboxing: map the preview selection to actual captured pixels.
const r=video.getBoundingClientRect(),scale=Math.min(r.width/vw,r.height/vh),ox=(r.width-vw*scale)/2,oy=(r.height-vh*scale)/2;
const x=Math.max(0,(crop.x*r.width-ox)/scale),y=Math.max(0,(crop.y*r.height-oy)/scale),w=Math.min(vw-x,crop.w*r.width/scale),h=Math.min(vh-y,crop.h*r.height/scale);
if(w<30||h<30)throw Error('请重新框选视频画面');const down=Math.min(1,640/Math.max(w,h));c.width=Math.round(w*down);c.height=Math.round(h*down);c.getContext('2d').drawImage(video,x,y,w,h,0,0,c.width,c.height);
status('正在看画面…');const result=await window.companion.infer(c.toDataURL('image/jpeg',.7).split(',')[1]);
if(turn!==epoch||!active)return;if(result.stopped){await stop();status(result.text);}else if(result.waiting){status(result.text);}else if(!result.skipped){$('response').textContent=result.text;status(`陪看中 · 最近回应 ${result.latencySeconds.toFixed(2)} 秒`);}
}catch(e){if(turn===epoch)status('暂时无法回应：'+e.message);}finally{busy=false;}},5000);
window.addEventListener('resize',draw);refresh().then(()=>{if(new URLSearchParams(location.search).get('mode')==='drag')status('把我拖到抖音视频上，就开始陪看');}).catch(e=>status(e.message));

async function refreshMemoryUi(){
 try{
  const s=await window.companion.memoryStatus();
  $('memoryEnabled').checked=!!s.enabled;
  const parts=[`共 ${s.count} 条`];
  if(s.byKind)parts.push(`偏好${s.byKind.preference||0}/实体${s.byKind.entity||0}/瞬间${s.byKind.moment||0}`);
  $('memoryMeta').textContent=parts.join(' · ');
 }catch(e){$('memoryMeta').textContent='记忆不可用';}
}
$('memoryEnabled').onchange=async()=>{
 try{await window.companion.memorySetEnabled($('memoryEnabled').checked);await refreshMemoryUi();}
 catch(e){status('记忆开关失败：'+e.message);}
};
$('memoryRefresh').onclick=()=>refreshMemoryUi().catch(e=>status(e.message));
$('memoryClear').onclick=async()=>{
 try{if(!confirm('清空本机长期记忆？此操作不可恢复。'))return;await window.companion.memoryClear();await refreshMemoryUi();status('已清空长期记忆');}
 catch(e){status('清空失败：'+e.message);}
};
refreshMemoryUi().catch(()=>{});
