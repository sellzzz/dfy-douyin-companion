function normalizedCrop(box,anchor){
 if(!box?.found)return null;
 const values=['x','y','width','height'].map(k=>box[k]);
 if(values.some(v=>typeof v!=='number'||!Number.isFinite(v)))return null;
 const [x,y,w,h]=values.map(v=>v/1000);
 if(x<0||y<0||w<.08||h<.08||x+w>1.01||y+h>1.01||w*h>.95||w*h<.04)return null;
 if(anchor&&(anchor.x<x-.08||anchor.x>x+w+.08||anchor.y<y-.08||anchor.y>y+h+.08))return null;
 return {x,y,w:Math.min(w,1-x),h:Math.min(h,1-y)};
}
function aroundDrop(anchor,aspect){
 if(!anchor||!Number.isFinite(anchor.x)||!Number.isFinite(anchor.y)||!Number.isFinite(aspect)||aspect<=0)return null;
 // A conservative viewport around the explicit drop point, excluding browser controls.
 const h=.68,w=Math.min(.68,h/aspect*9/16);
 const x=Math.max(0,Math.min(1-w,anchor.x-w/2));
 const y=Math.max(.12,Math.min(1-h,anchor.y-h/2));
 return {x,y,w,h};
}
module.exports={normalizedCrop,aroundDrop};
