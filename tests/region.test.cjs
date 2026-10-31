const test=require('node:test'),assert=require('node:assert/strict');
const {checkedCrop,cropScreenRect,previewToVideoCrop,videoToPreviewCrop,petSizeForRegion,confinePetPosition}=require('../app/geometry.cjs');
test('video selection survives portrait and landscape preview letterboxing',()=>{
 for(const frame of [{width:1600,height:900},{width:900,height:1600}]){
  const original={x:.1,y:.2,w:.6,h:.5},preview={width:800,height:600};
  const drawn=videoToPreviewCrop(original,preview,frame),restored=previewToVideoCrop(drawn,preview,frame);
  for(const k of ['x','y','w','h'])assert.ok(Math.abs(original[k]-restored[k])<1e-9);
 }
});
test('a selection in preview letterboxing is rejected rather than capturing unrelated pixels',()=>{
 assert.equal(previewToVideoCrop({x:0,y:0,w:1,h:.1},{width:800,height:800},{width:1600,height:900}),null);
 assert.equal(checkedCrop({x:.9,y:0,w:.2,h:1}),null);
});
test('confirmed frame follows window moves including a negative monitor origin',()=>{
 const crop={x:.1,y:.2,w:.5,h:.6};
 assert.deepEqual(cropScreenRect({left:-1600,top:-400,right:0,bottom:600},crop),{left:-1440,top:-200,right:-640,bottom:400});
 assert.deepEqual(cropScreenRect({left:0,top:0,right:800,bottom:500},crop),{left:80,top:100,right:480,bottom:400});
});
test('pet fitting and bounds keep the entire sprite inside the frame at every edge',()=>{
 for(const rect of [{left:100,top:50,right:600,bottom:500},{left:-500,top:-300,right:-300,bottom:-160}]){
  const s=petSizeForRegion(rect,462),size={width:s,height:s*9/16};
  for(const p of [{x:-10000,y:-10000},{x:10000,y:10000},{x:0,y:0}]){
   const out=confinePetPosition(p,rect,size);assert.equal(out.fits,true);
   assert.ok(out.x>=rect.left+8&&out.y>=rect.top+8&&out.x+size.width<=rect.right-8&&out.y+size.height<=rect.bottom-8);
  }
 }
});
