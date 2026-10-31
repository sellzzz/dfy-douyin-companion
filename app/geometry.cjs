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
function checkedCrop(c){
 if(!c||['x','y','w','h'].some(k=>typeof c[k]!=='number'||!Number.isFinite(c[k])))return null;
 if(c.x<0||c.y<0||c.w<=0||c.h<=0||c.x+c.w>1.00001||c.y+c.h>1.00001)return null;
 return {x:c.x,y:c.y,w:Math.min(c.w,1-c.x),h:Math.min(c.h,1-c.y)};
}
function cropScreenRect(bounds,crop){
 const c=checkedCrop(crop);if(!c||!bounds||bounds.right<=bounds.left||bounds.bottom<=bounds.top)return null;
 const w=bounds.right-bounds.left,h=bounds.bottom-bounds.top;
 return {left:Math.round(bounds.left+c.x*w),top:Math.round(bounds.top+c.y*h),right:Math.round(bounds.left+(c.x+c.w)*w),bottom:Math.round(bounds.top+(c.y+c.h)*h)};
}
function previewToVideoCrop(selection,preview,frame){
 if(!checkedCrop(selection)||preview.width<=0||preview.height<=0||frame.width<=0||frame.height<=0)return null;
 const scale=Math.min(preview.width/frame.width,preview.height/frame.height);
 const ox=(preview.width-frame.width*scale)/2,oy=(preview.height-frame.height*scale)/2;
 const x0=Math.max(0,(selection.x*preview.width-ox)/scale),y0=Math.max(0,(selection.y*preview.height-oy)/scale);
 const x1=Math.min(frame.width,((selection.x+selection.w)*preview.width-ox)/scale),y1=Math.min(frame.height,((selection.y+selection.h)*preview.height-oy)/scale);
 return checkedCrop({x:x0/frame.width,y:y0/frame.height,w:(x1-x0)/frame.width,h:(y1-y0)/frame.height});
}
function videoToPreviewCrop(crop,preview,frame){
 if(!checkedCrop(crop)||preview.width<=0||preview.height<=0||frame.width<=0||frame.height<=0)return null;
 const scale=Math.min(preview.width/frame.width,preview.height/frame.height);
 return {x:((preview.width-frame.width*scale)/2+crop.x*frame.width*scale)/preview.width,y:((preview.height-frame.height*scale)/2+crop.y*frame.height*scale)/preview.height,w:crop.w*frame.width*scale/preview.width,h:crop.h*frame.height*scale/preview.height};
}
function petSizeForRegion(rect,preferred=462){return Math.max(80,Math.floor(Math.min(preferred,rect.right-rect.left-16,(rect.bottom-rect.top-16)*16/9)));}
function confinePetPosition(point,rect,size,padding=8){
 const minX=rect.left+padding,minY=rect.top+padding,maxX=rect.right-padding-size.width,maxY=rect.bottom-padding-size.height;
 return {x:maxX>=minX?Math.max(minX,Math.min(maxX,point.x)):(rect.left+rect.right-size.width)/2,y:maxY>=minY?Math.max(minY,Math.min(maxY,point.y)):(rect.top+rect.bottom-size.height)/2,fits:maxX>=minX&&maxY>=minY};
}
const geometry={normalizedCrop,aroundDrop,checkedCrop,cropScreenRect,previewToVideoCrop,videoToPreviewCrop,petSizeForRegion,confinePetPosition};
if(typeof module!=='undefined')module.exports=geometry;else window.DfyGeometry=geometry;
