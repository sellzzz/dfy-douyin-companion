// Keep upstream idle/turn/walk animations and their video-timed motion drive.
// Only the movement planner and the final bounds are restricted to the chosen video.
(() => {
 let latest=null;
 const states=new WeakMap(),original=PetSprite.prototype.sendBounds;
 const originalIdle=PetSprite.prototype.playIdle,originalMove=PetSprite.prototype.tryMove;
 const originalClick=PetSprite.prototype.onClick;
 const originalMenuAction=PetSprite.prototype.onMenuAction;
 function areaFor(s){return latest?.enabled&&Date.now()>(s.doupetSuspendUntil||0)?latest.rect:null;}
 function interacting(s){return s.dragState?.active||s.menuOpen||s.chatOpen||s.sleeping||s.frozen;}
 function remember(s){s.customPos={rx:(s.pos.x+s.halfW)/VIEW.w,ry:(s.pos.y+s.halfH)/VIEW.h};}
 PetSprite.prototype.onClick=function(e){
  // A genuine plain click confirms an open editor. Drag release and shortcuts do not.
  if(!this.dragState?.active&&!this.dragState?.dragging&&!this.justDragged&&e?.button===0&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&!e.shiftKey)window.petBridge?.doupetControl?.('confirm');
  return originalClick.call(this,e);
 };
 PetSprite.prototype.onMenuAction=function(leaf,...args){
  if(leaf?.action==='doupet-settings'){this.closeMenu();window.petBridge?.doupetControl?.('settings');return;}
  return originalMenuAction.call(this,leaf,...args);
 };
 PetSprite.prototype.sendBounds=function(px,py){
  const area=areaFor(this);
  if(area&&!this.dragState?.active){
   const c=window.DfyGeometry.confinePetPosition({x:toScreen(px+VIEW.x),y:toScreen(py+VIEW.y+this.bottomPad)},area,{width:toScreen(this.size),height:toScreen(this.size*9/16)});
   px=toLocal(c.x)-VIEW.x;py=toLocal(c.y)-VIEW.y-this.bottomPad;
  }
  return original.call(this,px,py);
 };
 PetSprite.prototype.playIdle=function(...args){
  const fixed=this.pet.fixedEnabled;
  // The upstream chain chooses its own actions after the current animation ends.
  if(areaFor(this)&&!interacting(this))this.pet.fixedEnabled=false;
  try{return originalIdle.apply(this,args);}finally{this.pet.fixedEnabled=fixed;}
 };
 PetSprite.prototype.doupetPlanMove=function(options){
  const area=areaFor(this);if(!area)return S.planMove(options);
  if(interacting(this))return null;
  const left=toLocal(area.left+8)-VIEW.x,right=toLocal(area.right-8)-VIEW.x;
  const top=toLocal(area.top+8)-VIEW.y,bottom=toLocal(area.bottom-8)-VIEW.y;
  const cx=this.pos.x+this.halfW,cy=this.pos.y+this.halfH;
  const room=options.dir>0?right-this.halfW-cx:cx-this.halfW-left;
  const maxDist=Math.min(options.maxDist,room*.9);
  if(maxDist<12||this.size>right-left||this.height>bottom-top)return null;
  return S.planMove({...options,cx,cy,minDist:Math.min(options.minDist,maxDist*.6),maxDist,margin:0,sideAllow:0,areas:[{x:left,y:top,width:right-left,height:bottom-top}]});
 };
 PetSprite.prototype.tryMove=function(preferredName,...args){
  const result=originalMove.call(this,preferredName,...args);
  if(result===false&&!preferredName&&areaFor(this)&&!interacting(this)&&this.animations.turn.length){
   // Play the real turn animation; upstream handleEnded flips facing afterwards.
   const turn=S.pick(this.animations.turn,this.anim);this.playOnce(turn);return turn;
  }
  return result;
 };
 window.petBridge?.onCompanionArea?.(area=>{latest=area;});
 setInterval(()=>{
  for(const s of sprites){
   let state=states.get(s);if(!state){state={signature:''};states.set(s,state);}
   const area=areaFor(s),signature=area?JSON.stringify(area):'';
   if(state.signature===signature||s.dragState?.active)continue;
   const wasMoving=s.moveRef!=null||s.pendingMove||s.posFollow;
   s.stopMove();state.signature=signature;
   if(area)s.sendBounds(s.pos.x,s.pos.y);
   remember(s);
   if(wasMoving&&!interacting(s)&&s.animations.idle.length)s.playOnce(S.pick(s.animations.idle,s.anim));
   window.__dshPetDebug.companionArea={rect:area,mode:'upstream-animation-chain',at:Date.now()};
  }
 },300);
})();
