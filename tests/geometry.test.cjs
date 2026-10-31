const test=require('node:test'),assert=require('node:assert/strict');
const {normalizedCrop,aroundDrop}=require('../app/geometry.cjs');
test('accepts a video rectangle containing the actual drop point',()=>{
 assert.deepEqual(normalizedCrop({found:true,x:150,y:220,width:650,height:700},{x:.5,y:.5}),{x:.15,y:.22,w:.65,h:.7});
});
test('drop-point fallback stays within the selected window and below browser chrome',()=>{
 for(const anchor of [{x:0,y:0},{x:1,y:1},{x:.5,y:.5}])for(const aspect of [.7,1.4,2]){
  const box=aroundDrop(anchor,aspect);assert.ok(box.x>=0&&box.y>=.12&&box.x+box.w<=1.001&&box.y+box.h<=1.001);
 }
 assert.equal(aroundDrop({x:NaN,y:0},1),null);
});
test('rejects invalid, tiny, full-window and unrelated model boxes',()=>{
 for(const box of [{found:false},{found:true,x:0,y:0,width:1000,height:1000},{found:true,x:0,y:0,width:1,height:1},{found:true,x:-10,y:200,width:600,height:500},{found:true,x:'100',y:200,width:600,height:500},{found:true,x:500,y:200,width:600,height:500}])assert.equal(normalizedCrop(box,{x:.5,y:.5}),null);
 assert.equal(normalizedCrop({found:true,x:0,y:100,width:200,height:800},{x:.8,y:.5}),null);
});
