'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {mkdtempSync,rmSync,mkdirSync,writeFileSync}=require('node:fs');
const {tmpdir}=require('node:os');
const {join}=require('node:path');
const {loadLlmConfig,DEFAULT_LLM,DEFAULT_VISION_MODEL,generateReply}=require('../app/llm.cjs');

function freshRoot(){
 const root=mkdtempSync(join(tmpdir(),'dfy-llm-'));
 mkdirSync(join(root,'work'),{recursive:true});
 return root;
}

test('loadLlmConfig defaults refine off and local VL model',()=>{
 const root=freshRoot();
 try{
  const c=loadLlmConfig(root);
  assert.equal(c.refine.enabled,false);
  assert.equal(c.local.model,DEFAULT_VISION_MODEL);
  assert.equal(c.local.host,'http://127.0.0.1:11434');
 }finally{rmSync(root,{recursive:true,force:true});}
});

test('loadLlmConfig reads refine openai-compatible block',()=>{
 const root=freshRoot();
 try{
  writeFileSync(join(root,'work','llm.json'),JSON.stringify({
   local:{host:'http://127.0.0.1:11434',model:DEFAULT_VISION_MODEL},
   refine:{
    enabled:true,
    provider:'openai-compatible',
    baseUrl:'https://api.deepseek.com/v1',
    model:'deepseek-chat',
    apiKeyEnv:'DEEPSEEK_API_KEY'
   }
  }));
  const c=loadLlmConfig(root);
  assert.equal(c.refine.enabled,true);
  assert.equal(c.refine.baseUrl,'https://api.deepseek.com/v1');
  assert.equal(c.refine.model,'deepseek-chat');
  assert.equal(c.refine.apiKeyEnv,'DEEPSEEK_API_KEY');
  assert.equal(c.local.model,DEFAULT_VISION_MODEL);
 }finally{rmSync(root,{recursive:true,force:true});}
});

test('loadLlmConfig falls back to memory config llm block',()=>{
 const root=freshRoot();
 try{
  mkdirSync(join(root,'work','memory'),{recursive:true});
  writeFileSync(join(root,'work','memory','config.json'),JSON.stringify({
   enabled:true,
   llm:{refine:{enabled:false},local:{model:DEFAULT_VISION_MODEL}}
  }));
  const c=loadLlmConfig(root);
  assert.equal(c.refine.enabled,false);
  assert.equal(c.local.model,DEFAULT_VISION_MODEL);
 }finally{rmSync(root,{recursive:true,force:true});}
});

test('DEFAULT_LLM has refine disabled',()=>{
 assert.equal(DEFAULT_LLM.refine.enabled,false);
 assert.ok(DEFAULT_LLM.local.model);
});

test('generateReply skips refine when disabled and returns local draft',async()=>{
 const root=freshRoot();
 const calls=[];
 const originalFetch=global.fetch;
 global.fetch=async(url,init)=>{
  calls.push({url:String(url),body:JSON.parse(init.body)});
  return {
   ok:true,
   async json(){return {message:{content:'本地草稿气泡'}};}
  };
 };
 try{
  const reply=await generateReply({
   root,
   image:'aaaa',
   systemPrompt:'sys',
   memoryContext:'【短期记忆】看过猫',
   signal:AbortSignal.timeout(5000),
   config:loadLlmConfig(root)
  });
  assert.equal(reply.text,'本地草稿气泡');
  assert.equal(reply.refined,false);
  assert.equal(reply.provider,'ollama');
  assert.equal(calls.length,1);
  assert.match(calls[0].url,/\/api\/chat$/);
 }finally{
  global.fetch=originalFetch;
  rmSync(root,{recursive:true,force:true});
 }
});

test('generateReply refines with openai-compatible when enabled',async()=>{
 const root=freshRoot();
 writeFileSync(join(root,'work','llm.json'),JSON.stringify({
  refine:{
   enabled:true,
   provider:'openai-compatible',
   baseUrl:'https://api.deepseek.com/v1',
   model:'deepseek-chat',
   apiKeyEnv:'DFY_TEST_KEY'
  }
 }));
 process.env.DFY_TEST_KEY='sk-test';
 const calls=[];
 const originalFetch=global.fetch;
 global.fetch=async(url,init)=>{
  const u=String(url);
  calls.push(u);
  if(u.includes('/api/chat')){
   return {ok:true,async json(){return {message:{content:'本地草稿'}};}};
  }
  if(u.includes('/chat/completions')){
   return {ok:true,async json(){return {choices:[{message:{content:'润色后的气泡'}}]};}};
  }
  throw new Error('unexpected url '+u);
 };
 try{
  const reply=await generateReply({
   root,
   image:'aaaa',
   systemPrompt:'sys',
   memoryContext:'【长期记忆】喜欢猫',
   signal:AbortSignal.timeout(5000),
   config:loadLlmConfig(root)
  });
  assert.equal(reply.draft,'本地草稿');
  assert.equal(reply.text,'润色后的气泡');
  assert.equal(reply.refined,true);
  assert.equal(reply.provider,'openai-compatible');
  assert.equal(calls.length,2);
  assert.ok(calls.some(u=>u.includes('/api/chat')));
  assert.ok(calls.some(u=>u.includes('/chat/completions')));
 }finally{
  global.fetch=originalFetch;
  delete process.env.DFY_TEST_KEY;
  rmSync(root,{recursive:true,force:true});
 }
});

test('generateReply does not refine WAIT drafts',async()=>{
 const root=freshRoot();
 writeFileSync(join(root,'work','llm.json'),JSON.stringify({
  refine:{enabled:true,baseUrl:'https://api.deepseek.com/v1',model:'deepseek-chat',apiKeyEnv:'DFY_TEST_KEY'}
 }));
 process.env.DFY_TEST_KEY='sk-test';
 let cloudCalls=0;
 const originalFetch=global.fetch;
 global.fetch=async(url)=>{
  if(String(url).includes('/chat/completions')){cloudCalls++;throw new Error('should not call cloud');}
  return {ok:true,async json(){return {message:{content:'WAIT_VIDEO'}};}};
 };
 try{
  const reply=await generateReply({
   root,image:'aaaa',systemPrompt:'sys',signal:AbortSignal.timeout(5000),config:loadLlmConfig(root)
  });
  assert.equal(reply.text,'WAIT_VIDEO');
  assert.equal(reply.refined,false);
  assert.equal(cloudCalls,0);
 }finally{
  global.fetch=originalFetch;
  delete process.env.DFY_TEST_KEY;
  rmSync(root,{recursive:true,force:true});
 }
});
