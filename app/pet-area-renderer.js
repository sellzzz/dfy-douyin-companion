// Runs inside the upstream pet renderer; the selected video bounds never depend on pet movement.
(() => {
 let latest=null;
 const states=new WeakMap(),original=PetSprite.prototype.sendBounds;
 function areaFor(s){return latest?.enabled&&Date.now()>(s.doupetSuspendUntil||0)?latest.rect:null;}
 PetSprite.prototype.sendBounds=function(px,py){
  const area=areaFor(this);
  if(area&&!this.dragState?.active){
   const c=window.DfyGeometry.confinePetPosition({x:toScreen(px+VIEW.x),y:toScreen(py+VIEW.y+this.bottomPad)},area,{width:toScreen(this.size),height:toScreen(this.size*9/16)});
   px=toLocal(c.x)-VIEW.x;py=toLocal(c.y)-VIEW.y-this.bottomPad;
  }
  return original.call(this,px,py);
 };
 window.petBridge?.onCompanionArea?.(area=>{latest=area;});
 setInterval(()=>{
  for(const s of sprites){
   let state=states.get(s);if(!state){state={signature:'',next:0};states.set(s,state);}
   const area=areaFor(s);
   if(!area){if(state.signature&&!s.dragState.active)s.stopMove();state.signature='';continue;}
   if(s.dragState.active||s.menuOpen||s.chatOpen||s.sleeping)continue;
   const signature=JSON.stringify(area);
   if(state.signature!==signature){s.stopMove();state.signature=signature;s.sendBounds(s.pos.x,s.pos.y);state.next=0;}
   if(Date.now()<state.next||s.posFollow)continue;
   const size={width:toScreen(s.size),height:toScreen(s.size*9/16)};
   const p=window.DfyGeometry.confinePetPosition({x:area.left+Math.random()*(area.right-area.left-size.width),y:area.top+Math.random()*(area.bottom-area.top-size.height)},area,size);
   if(!p.fits)continue;
   const targetX=toLocal(p.x)-VIEW.x+s.halfW,targetY=toLocal(p.y)-VIEW.y-s.bottomPad+s.halfH;
   s.facing=targetX<s.pos.x+s.halfW?'left':'right';
   s.moveToCenter(targetX/VIEW.w,targetY/VIEW.h,'line',2800+Math.random()*1800);
   state.next=Date.now()+6000+Math.random()*4000;
   window.__dshPetDebug.companionArea={rect:area,size,at:Date.now()};
  }
 },300);
})();
