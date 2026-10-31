'use strict';
const {readFileSync,existsSync}=require('node:fs');
const {join}=require('node:path');

const DEFAULT_VISION_MODEL='qwen3-vl:2b-instruct-q4_K_M';
const DEFAULT_OLLAMA_HOST='http://127.0.0.1:11434';

/**
 * Defaults = today's UX: local Ollama VL drafts the bubble; cloud refine is OFF.
 * Flow: always local draft → if refine.enabled, rewrite with openai-compatible big model.
 */
const DEFAULT_LLM={
 local:{
  host:DEFAULT_OLLAMA_HOST,
  model:DEFAULT_VISION_MODEL
 },
 refine:{
  enabled:false,
  provider:'openai-compatible',
  baseUrl:null,
  model:null,
  apiKeyEnv:null
 }
};

function stripTrailingSlash(url){
 return String(url||'').replace(/\/+$/,'');
}

/**
 * Prefer work/llm.json; else optional `llm` / `reply` block in work/memory/config.json.
 */
function loadLlmConfig(root,options={}){
 const llmPath=options.llmPath||join(root,'work','llm.json');
 const memoryConfigPath=options.memoryConfigPath||join(root,'work','memory','config.json');
 let raw=null;
 if(existsSync(llmPath)){
  try{raw=JSON.parse(readFileSync(llmPath,'utf8'));}catch{raw=null;}
 }else if(existsSync(memoryConfigPath)){
  try{
   const mem=JSON.parse(readFileSync(memoryConfigPath,'utf8'));
   raw=mem.llm||mem.reply||null;
  }catch{raw=null;}
 }
 const base={
  local:{...DEFAULT_LLM.local},
  refine:{...DEFAULT_LLM.refine}
 };
 if(!raw||typeof raw!=='object')return base;

 const localRaw=(raw.local&&typeof raw.local==='object')?raw.local:{};
 // Back-compat: top-level host/model used to mean the local draft model.
 base.local.host=stripTrailingSlash(localRaw.host||raw.host||DEFAULT_OLLAMA_HOST)||DEFAULT_OLLAMA_HOST;
 base.local.model=localRaw.model||raw.localModel||DEFAULT_VISION_MODEL;

 const refineRaw=(raw.refine&&typeof raw.refine==='object')?raw.refine:{};
 const enabled=refineRaw.enabled!=null?!!refineRaw.enabled:!!raw.refineEnabled;
 base.refine={
  enabled,
  provider:String(refineRaw.provider||'openai-compatible').toLowerCase(),
  baseUrl:refineRaw.baseUrl?stripTrailingSlash(refineRaw.baseUrl):(raw.baseUrl?stripTrailingSlash(raw.baseUrl):null),
  model:refineRaw.model||raw.refineModel||null,
  apiKeyEnv:refineRaw.apiKeyEnv?String(refineRaw.apiKeyEnv):(raw.apiKeyEnv?String(raw.apiKeyEnv):null)
 };
 return base;
}

async function ollamaChat({host,model,messages,signal,options}){
 const url=stripTrailingSlash(host||DEFAULT_OLLAMA_HOST)+'/api/chat';
 const r=await fetch(url,{
  method:'POST',
  headers:{'Content-Type':'application/json'},
  signal,
  body:JSON.stringify({
   model,
   stream:false,
   keep_alive:'5m',
   options:options||{num_ctx:2048,num_predict:90,temperature:.3},
   messages
  })
 });
 if(!r.ok)throw Error('本机模型未就绪：HTTP '+r.status);
 const j=await r.json();
 return (j.message?.content||'').trim();
}

async function openaiCompatibleChat({baseUrl,model,apiKey,messages,signal}){
 if(!baseUrl)throw Error('refine 需要配置 refine.baseUrl');
 if(!model)throw Error('refine 需要配置 refine.model');
 if(!apiKey)throw Error('refine 缺少 API Key（检查 refine.apiKeyEnv 对应环境变量）');
 const url=stripTrailingSlash(baseUrl)+'/chat/completions';
 const r=await fetch(url,{
  method:'POST',
  headers:{
   'Content-Type':'application/json',
   Authorization:'Bearer '+apiKey
  },
  signal,
  body:JSON.stringify({
   model,
   stream:false,
   temperature:0.4,
   max_tokens:120,
   messages
  })
 });
 if(!r.ok){
  const body=await r.text().catch(()=>'');
  throw Error('云端润色未就绪：HTTP '+r.status+(body?(' '+body.slice(0,160)):''));
 }
 const j=await r.json();
 const text=j.choices?.[0]?.message?.content;
 return String(text||'').trim();
}

/**
 * Always: local Ollama VL draft from frame + memory.
 * Optional: if refine.enabled, push draft (+ memory context) to openai-compatible big model to rewrite bubble.
 * WAIT_* / empty drafts are never sent to refine.
 */
async function generateReply(args){
 const config=args.config||loadLlmConfig(args.root);
 const userText=args.userText||'一起看看当前视频画面，说一句简短感想。';
 const systemPrompt=args.systemPrompt;
 const memoryContext=args.memoryContext||'';
 const image=args.image;
 const signal=args.signal;
 const localHost=config.local?.host||DEFAULT_OLLAMA_HOST;
 const localModel=config.local?.model||DEFAULT_VISION_MODEL;

 const draft=(await ollamaChat({
  host:localHost,
  model:localModel,
  signal,
  messages:[
   {role:'system',content:systemPrompt},
   {role:'user',content:userText,images:[image]}
  ]
 })).slice(0,100);

 if(!draft||/WAIT_AUTH|WAIT_VIDEO|<think>/.test(draft)){
  return {text:draft,draft,refined:false,provider:'ollama',model:localModel};
 }

 const refine=config.refine||{};
 if(!refine.enabled){
  return {text:draft,draft,refined:false,provider:'ollama',model:localModel};
 }

 const apiKeyEnv=refine.apiKeyEnv||'OPENAI_API_KEY';
 const apiKey=process.env[apiKeyEnv];
 const refineSystem=[
  '你是陪看桌宠文案润色器。根据本地小模型的草稿和记忆上下文，改写成一句更自然、更贴画面的中文气泡（≤35字）。',
  '只改写语气与表达，不新增未见内容、不猜人物身份、不编造剧情或声音。不要复述记忆清单。',
  '若草稿本身是 WAIT_AUTH / WAIT_VIDEO，原样返回。只输出最终那一句，不要解释。'
 ].join('');
 const refineUser=[
  memoryContext?('【记忆上下文】\n'+memoryContext+'\n'):'',
  '【本地草稿】\n'+draft,
  '\n请输出润色后的一句气泡。'
 ].join('');

 try{
  const refined=await openaiCompatibleChat({
   baseUrl:refine.baseUrl,
   model:refine.model,
   apiKey,
   signal,
   messages:[
    {role:'system',content:refineSystem},
    {role:'user',content:refineUser}
   ]
  });
  const text=(refined||draft).trim().slice(0,100);
  if(!text||/WAIT_AUTH|WAIT_VIDEO|<think>/.test(text)){
   return {text:draft,draft,refined:false,provider:'ollama',model:localModel,refineSkipped:'wait-or-empty'};
  }
  return {
   text,
   draft,
   refined:true,
   provider:refine.provider||'openai-compatible',
   model:refine.model,
   localModel
  };
 }catch(err){
  // Refine failure must not break陪看: fall back to local draft.
  return {
   text:draft,
   draft,
   refined:false,
   provider:'ollama',
   model:localModel,
   refineError:String(err.message||err).slice(0,160)
  };
 }
}

module.exports={
 DEFAULT_LLM,
 DEFAULT_VISION_MODEL,
 DEFAULT_OLLAMA_HOST,
 loadLlmConfig,
 generateReply,
 ollamaChat,
 openaiCompatibleChat
};
