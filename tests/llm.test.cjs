'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {mkdtempSync,rmSync,mkdirSync,writeFileSync}=require('node:fs');
const {tmpdir}=require('node:os');
const {join}=require('node:path');
const {loadLlmConfig,DEFAULT_LLM,DEFAULT_VISION_MODEL}=require('../app/llm.cjs');

function freshRoot(){
 const root=mkdtempSync(join(tmpdir(),'dfy-llm-'));
 mkdirSync(join(root,'work'),{recursive:true});
 return root;
}

test('loadLlmConfig defaults to local ollama VL when no config',()=>{
 const root=freshRoot();
 try{
  const c=loadLlmConfig(root);
  assert.equal(c.provider,'ollama');
  assert.equal(c.model,DEFAULT_VISION_MODEL);
  assert.equal(c.supportsVision,true);
  assert.equal(c.vision.model,DEFAULT_VISION_MODEL);
 }finally{rmSync(root,{recursive:true,force:true});}
});

test('loadLlmConfig reads work/llm.json openai-compatible',()=>{
 const root=freshRoot();
 try{
  writeFileSync(join(root,'work','llm.json'),JSON.stringify({
   provider:'openai-compatible',
   baseUrl:'https://api.deepseek.com/v1',
   model:'deepseek-chat',
   apiKeyEnv:'DEEPSEEK_API_KEY',
   supportsVision:false
  }));
  const c=loadLlmConfig(root);
  assert.equal(c.provider,'openai-compatible');
  assert.equal(c.baseUrl,'https://api.deepseek.com/v1');
  assert.equal(c.model,'deepseek-chat');
  assert.equal(c.apiKeyEnv,'DEEPSEEK_API_KEY');
  assert.equal(c.supportsVision,false);
  assert.equal(c.vision.provider,'ollama');
 }finally{rmSync(root,{recursive:true,force:true});}
});

test('loadLlmConfig falls back to memory config llm block',()=>{
 const root=freshRoot();
 try{
  mkdirSync(join(root,'work','memory'),{recursive:true});
  writeFileSync(join(root,'work','memory','config.json'),JSON.stringify({
   enabled:true,
   llm:{provider:'ollama',host:'http://127.0.0.1:11434',model:'qwen3-vl:2b-instruct-q4_K_M'}
  }));
  const c=loadLlmConfig(root);
  assert.equal(c.provider,'ollama');
  assert.equal(c.model,DEFAULT_VISION_MODEL);
 }finally{rmSync(root,{recursive:true,force:true});}
});

test('DEFAULT_LLM matches expected keys',()=>{
 assert.equal(DEFAULT_LLM.provider,'ollama');
 assert.ok(DEFAULT_LLM.vision.model);
});
