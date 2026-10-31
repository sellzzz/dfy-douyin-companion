'use strict';
const {readFileSync,existsSync}=require('node:fs');
const {join}=require('node:path');

const DEFAULT_VISION_MODEL='qwen3-vl:2b-instruct-q4_K_M';
const DEFAULT_OLLAMA_HOST='http://127.0.0.1:11434';

/** Sensible defaults: local Ollama VL for reply + vision (today's behavior). */
const DEFAULT_LLM={
 provider:'ollama',
 host:DEFAULT_OLLAMA_HOST,
 model:DEFAULT_VISION_MODEL,
 // openai-compatible fields (unused unless provider changes):
 baseUrl:null,
 apiKeyEnv:null,
 supportsVision:true,
 vision:{
  provider:'ollama',
  host:DEFAULT_OLLAMA_HOST,
  model:DEFAULT_VISION_MODEL
 }
};

function stripTrailingSlash(url){
 return String(url||'').replace(/\/+$/,'');
}

/**
 * Load reply/vision LLM settings.
 * Prefer work/llm.json; else optional `llm` / `reply` block inside work/memory/config.json.
 * Missing file → DEFAULT_LLM (unchanged local Ollama VL behavior).
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
 if(!raw||typeof raw!=='object')return {...DEFAULT_LLM,vision:{...DEFAULT_LLM.vision}};
 const provider=String(raw.provider||DEFAULT_LLM.provider).toLowerCase();
 const visionRaw=(raw.vision&&typeof raw.vision==='object')?raw.vision:{};
 const vision={
  provider:String(visionRaw.provider||'ollama').toLowerCase(),
  host:stripTrailingSlash(visionRaw.host||raw.host||DEFAULT_OLLAMA_HOST)||DEFAULT_OLLAMA_HOST,
  model:visionRaw.model||raw.visionModel||DEFAULT_VISION_MODEL
 };
 const supportsVision=raw.supportsVision!=null?!!raw.supportsVision:(provider==='ollama');
 return {
  provider:provider==='openai-compatible'||provider==='openai'?'openai-compatible':'ollama',
  host:stripTrailingSlash(raw.host||DEFAULT_OLLAMA_HOST)||DEFAULT_OLLAMA_HOST,
  model:raw.model||DEFAULT_VISION_MODEL,
  baseUrl:raw.baseUrl?stripTrailingSlash(raw.baseUrl):null,
  apiKeyEnv:raw.apiKeyEnv?String(raw.apiKeyEnv):null,
  supportsVision,
  vision
 };
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
 if(!baseUrl)throw Error('openai-compatible 需要配置 baseUrl');
 if(!apiKey)throw Error('openai-compatible 缺少 API Key（检查 apiKeyEnv 对应环境变量）');
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
   temperature:0.3,
   max_tokens:120,
   messages
  })
 });
 if(!r.ok){
  const body=await r.text().catch(()=>'');
  throw Error('云端模型未就绪：HTTP '+r.status+(body?(' '+body.slice(0,160)):''));
 }
 const j=await r.json();
 const text=j.choices?.[0]?.message?.content;
 return String(text||'').trim();
}

/**
 * Short scene caption from local Ollama VL when the reply provider is text-only.
 */
async function sceneSummaryFromVision({image,vision,signal}){
 const host=vision?.host||DEFAULT_OLLAMA_HOST;
 const model=vision?.model||DEFAULT_VISION_MODEL;
 const content=await ollamaChat({
  host,
  model,
  signal,
  options:{num_ctx:2048,num_predict:80,temperature:0},
  messages:[
   {role:'system',content:'你只描述当前视频画面里明确可见的内容，一句中文，40字以内。不猜身份、不编造剧情或声音。若是登录/验证/二维码页返回 WAIT_AUTH；没有清晰视频返回 WAIT_VIDEO。'},
   {role:'user',content:'简述当前画面。',images:[image]}
  ]
 });
 return content.slice(0,120);
}

/**
 * Bubble reply generation. Vision/locate stays on Ollama VL unless vision config says otherwise.
 * @param {{root:string,image:string,systemPrompt:string,userText?:string,signal:AbortSignal,config?:object}} args
 */
async function generateReply(args){
 const config=args.config||loadLlmConfig(args.root);
 const userText=args.userText||'一起看看当前视频画面，说一句简短感想。';
 const systemPrompt=args.systemPrompt;
 const image=args.image;
 const signal=args.signal;

 if(config.provider==='openai-compatible'){
  const apiKeyEnv=config.apiKeyEnv||'OPENAI_API_KEY';
  const apiKey=process.env[apiKeyEnv];
  let messages;
  if(config.supportsVision){
   // OpenAI-style multimodal content parts
   messages=[
    {role:'system',content:systemPrompt},
    {role:'user',content:[
     {type:'text',text:userText},
     {type:'image_url',image_url:{url:'data:image/jpeg;base64,'+image}}
    ]}
   ];
  }else{
   const scene=await sceneSummaryFromVision({image,vision:config.vision,signal});
   if(!scene||/WAIT_AUTH|WAIT_VIDEO/.test(scene))return {text:scene||'WAIT_VIDEO',provider:config.provider,model:config.model,via:'vision-gate'};
   messages=[
    {role:'system',content:systemPrompt},
    {role:'user',content:userText+'\n\n【画面摘要】'+scene}
   ];
  }
  const text=await openaiCompatibleChat({
   baseUrl:config.baseUrl,
   model:config.model,
   apiKey,
   messages,
   signal
  });
  return {text:text.slice(0,100),provider:config.provider,model:config.model};
 }

 // Default: local Ollama (VL can take images)
 const text=await ollamaChat({
  host:config.host||DEFAULT_OLLAMA_HOST,
  model:config.model||DEFAULT_VISION_MODEL,
  signal,
  messages:[
   {role:'system',content:systemPrompt},
   {role:'user',content:userText,images:[image]}
  ]
 });
 return {text:text.slice(0,100),provider:'ollama',model:config.model||DEFAULT_VISION_MODEL};
}

module.exports={
 DEFAULT_LLM,
 DEFAULT_VISION_MODEL,
 DEFAULT_OLLAMA_HOST,
 loadLlmConfig,
 generateReply,
 sceneSummaryFromVision,
 ollamaChat,
 openaiCompatibleChat
};
