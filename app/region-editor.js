const box=document.getElementById('box'),toolbar=document.getElementById('toolbar'),note=document.getElementById('note');
let crop={x:.15,y:.15,w:.7,h:.7},edit=true,drag=null,redraw=false;
function paint(){
 box.style.left=crop.x*innerWidth+'px';box.style.top=crop.y*innerHeight+'px';box.style.width=crop.w*innerWidth+'px';box.style.height=crop.h*innerHeight+'px';
 toolbar.style.left=Math.max(8,Math.min(innerWidth-toolbar.offsetWidth-8,crop.x*innerWidth))+'px';
 const above=crop.y*innerHeight-toolbar.offsetHeight-12;
 toolbar.style.top=Math.max(8,above>=8?above:Math.min(innerHeight-toolbar.offsetHeight-8,(crop.y+crop.h)*innerHeight+12))+'px';
}
window.regionEditor.onState(state=>{crop=state.crop;edit=state.editing;document.body.classList.toggle('confirmed',!edit);note.textContent=state.message||'拖动边框调整范围，确认后宠物在框里活动。';paint();});
document.addEventListener('pointerdown',e=>{
 if(!edit||toolbar.contains(e.target))return;
 if(!redraw&&e.target!==box&&!e.target.dataset.edge)return;
 drag={x:e.clientX/innerWidth,y:e.clientY/innerHeight,crop:{...crop},edge:redraw?'draw':e.target.dataset.edge||'move'};
 e.target.setPointerCapture(e.pointerId);e.preventDefault();
});
document.addEventListener('pointermove',e=>{
 if(!drag)return;const x=Math.max(0,Math.min(1,e.clientX/innerWidth)),y=Math.max(0,Math.min(1,e.clientY/innerHeight)),dx=x-drag.x,dy=y-drag.y,b=drag.crop;
 if(drag.edge==='draw'){crop={x:Math.min(x,drag.x),y:Math.min(y,drag.y),w:Math.abs(x-drag.x),h:Math.abs(y-drag.y)};}
 else if(drag.edge==='move'){crop={...b,x:Math.max(0,Math.min(1-b.w,b.x+dx)),y:Math.max(0,Math.min(1-b.h,b.y+dy))};}
 else{
  let l=b.x,t=b.y,r=b.x+b.w,bottom=b.y+b.h;
  if(drag.edge.includes('w'))l=Math.max(0,Math.min(r-.04,l+dx));if(drag.edge.includes('e'))r=Math.min(1,Math.max(l+.04,r+dx));
  if(drag.edge.includes('n'))t=Math.max(0,Math.min(bottom-.04,t+dy));if(drag.edge.includes('s'))bottom=Math.min(1,Math.max(t+.04,bottom+dy));
  crop={x:l,y:t,w:r-l,h:bottom-t};
 }paint();
});
document.addEventListener('pointerup',()=>{if(!drag)return;drag=null;redraw=false;document.body.style.cursor='';});
document.getElementById('redraw').onclick=()=>{redraw=true;document.body.style.cursor='crosshair';note.textContent='在视频上拖动，重新画出范围。';};
document.getElementById('cancel').onclick=()=>window.regionEditor.cancel();
document.getElementById('confirm').onclick=async()=>{try{await window.regionEditor.confirm(crop);}catch(e){note.textContent=e.message.replace(/^Error invoking remote method[^:]*: /,'');}};
window.addEventListener('resize',paint);window.regionEditor.ready();
