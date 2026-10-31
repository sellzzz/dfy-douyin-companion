'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {mkdtempSync,rmSync}=require('node:fs');
const {tmpdir}=require('node:os');
const {join}=require('node:path');
const {createMemory,clampText,similar}=require('../app/memory.cjs');

function fresh(){
 const root=mkdtempSync(join(tmpdir(),'dfy-mem-'));
 const memory=createMemory({root,dir:join(root,'work','memory')});
 return {root,memory};
}

test('remember stores kinds and clamps moment length',()=>{
 const {root,memory}=fresh();
 try{
  const long='看见了一段特别精彩的舞蹈表演然后还想继续看下去而且灯光也很漂亮'.repeat(3);
  const r=memory.remember({kind:'moment',text:long,salience:0.5});
  assert.equal(r.ok,true);
  const st=memory.status();
  assert.equal(st.byKind.moment,1);
  assert.ok(st.contextPreview.includes('【长期记忆】'));
  assert.ok(memory.search('')[0].text.length<=80);
 }finally{rmSync(root,{recursive:true,force:true});}
});

test('dedupes near-duplicate preferences',()=>{
 const {root,memory}=fresh();
 try{
  assert.equal(memory.remember({kind:'preference',text:'喜欢猫猫舞蹈'}).deduped,false);
  const second=memory.remember({kind:'preference',text:'喜欢 猫猫舞蹈'});
  assert.equal(second.deduped,true);
  assert.equal(memory.status().byKind.preference,1);
 }finally{rmSync(root,{recursive:true,force:true});}
});

test('contextForPrompt truncates to maxInjectChars',()=>{
 const {root,memory}=fresh();
 try{
  for(let i=0;i<20;i++)memory.remember({kind:'moment',text:`瞬间片段编号${i}还有一些描述文字`,salience:0.5});
  memory.remember({kind:'preference',text:'喜欢旅行vlog',salience:0.9});
  const ctx=memory.contextForPrompt({maxChars:120});
  assert.ok(ctx.startsWith('【长期记忆】'));
  assert.ok(ctx.length<=120);
  memory.setEnabled(false);
  assert.equal(memory.contextForPrompt(),'');
 }finally{rmSync(root,{recursive:true,force:true});}
});

test('shouldSkipReply ignores skipped waiting and WAIT_*',()=>{
 const {memory,root}=fresh();
 try{
  assert.equal(memory.shouldSkipReply({skipped:true}),true);
  assert.equal(memory.shouldSkipReply({waiting:true,text:'等待清晰的视频画面'}),true);
  assert.equal(memory.shouldSkipReply({stopped:true,text:'stopped'}),true);
  assert.equal(memory.shouldSkipReply({text:'WAIT_AUTH'}),true);
  assert.equal(memory.shouldSkipReply({text:'WAIT_VIDEO'}),true);
  assert.equal(memory.shouldSkipReply({text:'这画面真好看'}),false);
 }finally{rmSync(root,{recursive:true,force:true});}
});

test('rememberFromReply uses heuristics and skips WAIT',async()=>{
 const {root,memory}=fresh();
 try{
  const skip=await memory.rememberFromReply('WAIT_AUTH',{extract:false,result:{waiting:true,text:'WAIT_AUTH'}});
  assert.equal(skip.ok,false);
  const ok=await memory.rememberFromReply('好喜欢这段旅行风景，看到雪山了',{extract:false});
  assert.equal(ok.ok,true);
  const st=memory.status();
  assert.ok(st.count>=1);
  assert.ok((st.byKind.preference||0)+(st.byKind.moment||0)+(st.byKind.entity||0)>=1);
 }finally{rmSync(root,{recursive:true,force:true});}
});

test('clear empties store and session summary is written on endSession',async()=>{
 const {root,memory}=fresh();
 try{
  const sid=memory.beginSession('sess-1');
  assert.equal(sid,'sess-1');
  await memory.rememberFromReply('看到一只橘猫在窗台晒太阳',{extract:false,sessionId:sid});
  const ended=await memory.endSession({useModel:false});
  assert.equal(ended.ok,true);
  assert.ok(ended.summary);
  assert.ok(memory.status().byKind.session_summary>=1);
  memory.clear();
  assert.equal(memory.status().count,0);
  assert.equal(memory.contextForPrompt(),'');
 }finally{rmSync(root,{recursive:true,force:true});}
});

test('helpers clamp and similar',()=>{
 assert.equal(clampText('abcdefghij',5).endsWith('…'),true);
 assert.equal(similar('喜欢猫猫','喜欢 猫猫'),true);
 assert.equal(similar('完全不同的一句话','另一件事情'),false);
});
