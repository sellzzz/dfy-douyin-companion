'use strict';
const {readFileSync,writeFileSync,mkdirSync,existsSync,appendFileSync,renameSync,rmSync}=require('node:fs');
const {join}=require('node:path');
const {randomUUID}=require('node:crypto');

const KINDS=new Set(['preference','entity','session_summary','moment']);
const DEFAULT_CONFIG={
 enabled:true,
 maxInjectChars:280,
 retainDays:90,
 maxMoments:200,
 maxPreferences:80,
 maxEntities:80,
 extractTimeoutMs:4000,
 extractModel:null,
 ollamaHost:'http://127.0.0.1:11434',
 shortTermEnabled:true,
 shortTermMaxTurns:8,
 shortTermMaxChars:520,
 shortTermExtractModel:null,
 shortTermExtractTimeoutMs:2500
};

function nowIso(){return new Date().toISOString();}

function clampText(text,max){
 const s=String(text||'').replace(/\s+/g,' ').trim();
 if(s.length<=max)return s;
 return s.slice(0,max-1)+'…';
}

function normalizeKey(kind,text){
 return kind+'|'+(String(text||'').toLowerCase().replace(/\s+/g,' ').trim());
}

function similar(a,b){
 const x=String(a||'').toLowerCase().replace(/\s+/g,' ').trim();
 const y=String(b||'').toLowerCase().replace(/\s+/g,' ').trim();
 if(!x||!y)return false;
 if(x===y)return true;
 const xs=x.replace(/\s+/g,''),ys=y.replace(/\s+/g,'');
 if(xs===ys||xs.includes(ys)||ys.includes(xs))return true;
 if(x.includes(y)||y.includes(x))return true;
 const ax=new Set(x.split(/[^\u4e00-\u9fff\w]+/).filter(Boolean));
 const ay=new Set(y.split(/[^\u4e00-\u9fff\w]+/).filter(Boolean));
 if(!ax.size||!ay.size)return false;
 let inter=0;for(const t of ax)if(ay.has(t))inter++;
 return inter/Math.min(ax.size,ay.size)>=.75;
}

function createMemory(options={}){
 const root=options.root;
 if(!root)throw new Error('memory root required');
 const dir=options.dir||join(root,'work','memory');
 const configPath=join(dir,'config.json');
 const storePath=join(dir,'memories.jsonl');
 const indexPath=join(dir,'index.json');
 let config={...DEFAULT_CONFIG};
 let items=[];
 let sessionId=null;
 let sessionReplies=[];
 let extractBusy=false;
 let shortBusy=false;
 let shortBubbles=[]; // recent companion bubble lines
 let shortNotes=[];   // brief scene/turn notes
 let shortSummary=''; // one rolling session gist
 let shortTurn=0;

 function ensureDir(){mkdirSync(dir,{recursive:true});}

 function loadConfig(){
  ensureDir();
  if(!existsSync(configPath)){
   writeFileSync(configPath,JSON.stringify({...DEFAULT_CONFIG},null,2));
   config={...DEFAULT_CONFIG};
   return config;
  }
  try{
   const raw=JSON.parse(readFileSync(configPath,'utf8'));
   config={...DEFAULT_CONFIG,...raw};
  }catch{
   config={...DEFAULT_CONFIG};
  }
  return config;
 }

 function saveConfig(){
  ensureDir();
  writeFileSync(configPath,JSON.stringify(config,null,2));
 }

 function persistIndex(){
  ensureDir();
  const tmp=indexPath+'.tmp';
  writeFileSync(tmp,JSON.stringify({updatedAt:nowIso(),count:items.length,items},null,2));
  renameSync(tmp,indexPath);
 }

 function loadStore(){
  ensureDir();
  loadConfig();
  items=[];
  if(existsSync(indexPath)){
   try{
    const idx=JSON.parse(readFileSync(indexPath,'utf8'));
    if(Array.isArray(idx.items))items=idx.items.filter(isValidItem);
   }catch{items=[];}
  }
  if(!items.length&&existsSync(storePath)){
   try{
    const lines=readFileSync(storePath,'utf8').split(/\n+/).filter(Boolean);
    for(const line of lines){
     try{const row=JSON.parse(line);if(isValidItem(row))items.push(row);}catch{}
    }
   }catch{items=[];}
  }
  pruneExpired(false);
  return items;
 }

 function isValidItem(row){
  return row&&KINDS.has(row.kind)&&typeof row.text==='string'&&row.text.trim()&&typeof row.id==='string';
 }

 function pruneExpired(persist=true){
  const days=Number(config.retainDays)||90;
  const cutoff=Date.now()-days*86400000;
  const before=items.length;
  items=items.filter(it=>{
   const t=Date.parse(it.at||'');
   return !Number.isFinite(t)||t>=cutoff;
  });
  // Cap by kind
  const caps={moment:config.maxMoments||200,preference:config.maxPreferences||80,entity:config.maxEntities||80,session_summary:40};
  for(const kind of KINDS){
   const list=items.filter(i=>i.kind===kind).sort((a,b)=>(Date.parse(b.at)||0)-(Date.parse(a.at)||0));
   const keep=new Set(list.slice(0,caps[kind]||100).map(i=>i.id));
   items=items.filter(i=>i.kind!==kind||keep.has(i.id));
  }
  if(persist&&items.length!==before)rewriteStore();
 }

 function rewriteStore(){
  ensureDir();
  const tmp=storePath+'.tmp';
  writeFileSync(tmp,items.map(i=>JSON.stringify(i)).join('\n')+(items.length?'\n':''));
  renameSync(tmp,storePath);
  persistIndex();
 }

 function appendItem(item){
  ensureDir();
  appendFileSync(storePath,JSON.stringify(item)+'\n');
  items.push(item);
  persistIndex();
 }

 function findDuplicate(kind,text){
  return items.find(it=>it.kind===kind&&similar(it.text,text));
 }

 function remember(input={}){
  loadConfig();
  if(!config.enabled)return {ok:false,reason:'disabled'};
  const kind=String(input.kind||'moment');
  if(!KINDS.has(kind))return {ok:false,reason:'bad_kind'};
  let text=String(input.text||'').replace(/\s+/g,' ').trim();
  if(!text)return {ok:false,reason:'empty'};
  if(kind==='moment')text=clampText(text,80);
  else text=clampText(text,120);
  const salience=Math.max(0,Math.min(1,Number(input.salience??(kind==='preference'?0.8:kind==='entity'?0.6:kind==='session_summary'?0.7:0.45))));
  const dup=findDuplicate(kind,text);
  if(dup){
   dup.at=nowIso();
   dup.salience=Math.max(dup.salience||0,salience);
   if(input.sessionId)dup.sessionId=input.sessionId;
   rewriteStore();
   return {ok:true,id:dup.id,deduped:true};
  }
  const item={
   id:randomUUID(),
   kind,
   text,
   salience,
   sessionId:input.sessionId||sessionId||null,
   at:nowIso()
  };
  appendItem(item);
  pruneExpired(true);
  return {ok:true,id:item.id,deduped:false};
 }

 function search(query='',opts={}){
  loadStore();
  const q=String(query||'').toLowerCase().trim();
  const limit=Math.max(1,Number(opts.limit)||12);
  const kinds=opts.kinds?new Set(opts.kinds):null;
  let list=items.slice();
  if(kinds)list=list.filter(i=>kinds.has(i.kind));
  if(q){
   list=list.map(i=>{
    let score=i.salience||0;
    const t=i.text.toLowerCase();
    if(t.includes(q))score+=0.5;
    for(const tok of q.split(/\s+/))if(tok&&t.includes(tok))score+=0.15;
    return {i,score};
   }).filter(x=>x.score>0||!q).sort((a,b)=>b.score-a.score).map(x=>x.i);
  }else{
   list.sort((a,b)=>{
    const ds=(b.salience||0)-(a.salience||0);
    if(ds)return ds;
    return (Date.parse(b.at)||0)-(Date.parse(a.at)||0);
   });
  }
  return list.slice(0,limit);
 }

 function longTermContextForPrompt(opts={}){
  loadStore();
  if(!config.enabled)return '';
  const maxChars=Math.max(40,Number(opts.maxChars||config.maxInjectChars||280));
  const picked=[];
  const order=['preference','entity','session_summary','moment'];
  for(const kind of order){
   const chunk=search('',{kinds:[kind],limit:kind==='moment'?6:4});
   for(const it of chunk)picked.push(it);
  }
  const seen=new Set();
  const lines=[];
  let used=0;
  const header='【长期记忆】';
  used+=header.length;
  for(const it of picked){
   if(seen.has(it.id))continue;
   seen.add(it.id);
   const label=it.kind==='preference'?'偏好':it.kind==='entity'?'实体':it.kind==='session_summary'?'上次': '瞬间';
   const line=`${label}：${it.text}`;
   if(used+line.length+1>maxChars){
    const room=maxChars-used-1;
    if(room>8){lines.push(clampText(line,room));used=maxChars;}
    break;
   }
   lines.push(line);
   used+=line.length+1;
  }
  if(!lines.length)return '';
  return header+lines.join('；');
 }

 function clearShortTerm(){
  shortBubbles=[];
  shortNotes=[];
  shortSummary='';
  shortTurn=0;
 }

 function trimShortTerm(){
  const maxTurns=Math.max(2,Number(config.shortTermMaxTurns)||8);
  if(shortBubbles.length>maxTurns)shortBubbles=shortBubbles.slice(-maxTurns);
  if(shortNotes.length>maxTurns)shortNotes=shortNotes.slice(-maxTurns);
 }

 function refreshShortSummaryHeuristic(){
  const bits=shortBubbles.slice(-4);
  if(!bits.length){shortSummary='';return;}
  shortSummary=clampText('本场刚看：'+bits.join(' → '),90);
 }

 function shortTermContextForPrompt(opts={}){
  loadConfig();
  if(config.shortTermEnabled===false)return '';
  const maxChars=Math.max(60,Number(opts.maxChars||config.shortTermMaxChars||520));
  const parts=[];
  if(shortSummary)parts.push('概要：'+shortSummary);
  const noteSlice=shortNotes.slice(-Math.max(2,Number(config.shortTermMaxTurns)||8));
  const bubbleSlice=shortBubbles.slice(-Math.max(2,Number(config.shortTermMaxTurns)||8));
  if(noteSlice.length)parts.push('近况：'+noteSlice.join(' / '));
  if(bubbleSlice.length)parts.push('刚说：'+bubbleSlice.join(' / '));
  if(!parts.length)return '';
  const header='【短期记忆】';
  let body=parts.join('；');
  const budget=maxChars-header.length;
  if(body.length>budget)body=clampText(body,budget);
  return header+body;
 }

 function contextForPrompt(opts={}){
  const shortPart=shortTermContextForPrompt(opts.shortTerm||{});
  const longPart=longTermContextForPrompt(opts.longTerm||{maxChars:opts.maxChars});
  return [shortPart,longPart].filter(Boolean).join('\n');
 }

 async function enrichShortTermAsync(replyText){
  if(shortBusy)return null;
  loadConfig();
  const model=config.shortTermExtractModel||config.extractModel||options.extractModel||null;
  if(!model)return null;
  shortBusy=true;
  try{
   const host=config.ollamaHost||DEFAULT_CONFIG.ollamaHost;
   const prompt=`你在帮桌宠维护陪看短期记忆。根据刚说的这句话，用JSON返回：{"note":"≤24字场景要点","summary":"≤36字滚动概要"}。不要编造。刚说：${clampText(replyText,100)}。已有概要：${clampText(shortSummary,80)}`;
   const r=await fetch(`${host}/api/chat`,{
    method:'POST',
    headers:{'content-type':'application/json'},
    signal:AbortSignal.timeout(Number(config.shortTermExtractTimeoutMs)||2500),
    body:JSON.stringify({
     model,
     stream:false,
     keep_alive:'0',
     options:{num_ctx:512,num_predict:80,temperature:0},
     format:{type:'object',properties:{note:{type:'string'},summary:{type:'string'}},required:['note','summary']},
     messages:[{role:'user',content:prompt}]
    })
   });
   if(!r.ok)return null;
   const j=await r.json();
   let parsed=null;
   try{parsed=JSON.parse((j.message?.content||'').trim());}catch{return null;}
   if(parsed?.note){
    const note=clampText(parsed.note,40);
    if(shortNotes.length)shortNotes[shortNotes.length-1]=note;
    else shortNotes.push(note);
   }
   if(parsed?.summary)shortSummary=clampText(parsed.summary,90);
   trimShortTerm();
   return parsed;
  }catch{
   return null;
  }finally{
   shortBusy=false;
  }
 }

 function observeShortTerm(replyText,opts={}){
  loadConfig();
  if(config.shortTermEnabled===false)return {ok:false,reason:'disabled'};
  if(shouldSkipReply({text:replyText,...(opts.result||{})}))return {ok:false,reason:'skip'};
  const bubble=clampText(replyText,60);
  if(!bubble)return {ok:false,reason:'empty'};
  shortTurn+=1;
  shortBubbles.push(bubble);
  const note=clampText(opts.note||('画面：'+bubble),40);
  shortNotes.push(note);
  trimShortTerm();
  refreshShortSummaryHeuristic();
  // Optional LLM enrich is fire-and-forget so the NEXT infer tick sees updates without blocking VL.
  if(opts.enrich!==false)enrichShortTermAsync(replyText).catch(()=>{});
  return {ok:true,turn:shortTurn,bubbles:shortBubbles.length,notes:shortNotes.length};
 }

 function shouldSkipReply(result){
  if(!result||result.skipped||result.waiting||result.stopped)return true;
  const text=String(result.text||'');
  if(!text.trim())return true;
  if(/WAIT_AUTH|WAIT_VIDEO/.test(text))return true;
  return false;
 }

 function heuristicExtract(replyText){
  const text=String(replyText||'').trim();
  const preferences=[];
  const entities=[];
  let moment=null;
  const like=text.match(/(?:喜欢|爱看|爱听|偏好|更爱)\s*([^，。！？\s]{1,16})/);
  if(like)preferences.push('喜欢'+like[1]);
  const hate=text.match(/(?:讨厌|不喜欢|不想看)\s*([^，。！？\s]{1,16})/);
  if(hate)preferences.push('不喜欢'+hate[1]);
  const ent=text.match(/(?:看到|看见|出现了?|有个?)\s*([^，。！？\s]{1,20})/);
  if(ent)entities.push(ent[1]);
  if(text.length>=4)moment=clampText(text,80);
  return {preferences,entities,moment,salience:0.45};
 }

 async function extractWithModel(replyText,frameHint){
  if(extractBusy)return null;
  loadConfig();
  const host=config.ollamaHost||DEFAULT_CONFIG.ollamaHost;
  const model=config.extractModel||options.extractModel||null;
  // Without a dedicated small text model, skip remote extract unless caller set one.
  // Heuristics remain the reliable default; optional model extract is best-effort.
  if(!model&&!options.allowVisionModelExtract)return null;
  const useModel=model||options.visionModel||null;
  if(!useModel)return null;
  extractBusy=true;
  try{
   const prompt=`从下面桌宠对视频画面的一句中文回应里，提取结构化记忆。只返回 JSON：{"preferences":[],"entities":[],"moment":"","salience":0.5}。preferences 写用户/内容偏好短语；entities 写出现的人事物名称；moment 用≤40字概括这一瞬间；不要编造。回应：${clampText(replyText,120)}${frameHint?` 画面简述：${clampText(frameHint,40)}`:''}`;
   const r=await fetch(`${host}/api/chat`,{
    method:'POST',
    headers:{'content-type':'application/json'},
    signal:AbortSignal.timeout(Number(config.extractTimeoutMs)||4000),
    body:JSON.stringify({
     model:useModel,
     stream:false,
     keep_alive:'0',
     options:{num_ctx:1024,num_predict:120,temperature:0},
     format:{type:'object',properties:{preferences:{type:'array',items:{type:'string'}},entities:{type:'array',items:{type:'string'}},moment:{type:'string'},salience:{type:'number'}},required:['preferences','entities','moment','salience']},
     messages:[{role:'user',content:prompt}]
    })
   });
   if(!r.ok)return null;
   const j=await r.json();
   const raw=(j.message?.content||'').trim();
   try{return JSON.parse(raw);}catch{return null;}
  }catch{
   return null;
  }finally{
   extractBusy=false;
  }
 }

 async function rememberFromReply(replyText,opts={}){
  loadConfig();
  if(!config.enabled)return {ok:false,reason:'disabled'};
  if(shouldSkipReply({text:replyText,...opts.result}))return {ok:false,reason:'skip'};
  let extracted=null;
  if(opts.extract!==false){
   extracted=await extractWithModel(replyText,opts.frameHint);
  }
  if(!extracted||typeof extracted!=='object')extracted=heuristicExtract(replyText);
  const sid=opts.sessionId||sessionId;
  const salience=Number(extracted.salience);
  const results=[];
  for(const p of (extracted.preferences||[]).slice(0,3)){
   if(String(p).trim())results.push(remember({kind:'preference',text:p,salience:Number.isFinite(salience)?Math.max(salience,0.7):0.75,sessionId:sid}));
  }
  for(const e of (extracted.entities||[]).slice(0,4)){
   if(String(e).trim())results.push(remember({kind:'entity',text:e,salience:Number.isFinite(salience)?Math.max(salience,0.55):0.6,sessionId:sid}));
  }
  const moment=extracted.moment||replyText;
  if(String(moment).trim()){
   results.push(remember({kind:'moment',text:moment,salience:Number.isFinite(salience)?salience:0.45,sessionId:sid}));
  }
  if(sid){
   sessionReplies.push(clampText(replyText,80));
   if(sessionReplies.length>12)sessionReplies=sessionReplies.slice(-12);
  }
  return {ok:true,results,extracted};
 }

 function beginSession(id){
  sessionId=id||randomUUID();
  sessionReplies=[];
  clearShortTerm();
  return sessionId;
 }

 function currentSessionId(){return sessionId;}

 async function endSession(opts={}){
  const sid=sessionId;
  if(!sid)return {ok:false,reason:'no_session'};
  loadConfig();
  const replies=sessionReplies.slice();
  let summary='';
  if(replies.length){
   summary=clampText('本场看过：'+replies.slice(-5).join(' / '),100);
   if(opts.useModel&&config.enabled){
    try{
     const host=config.ollamaHost||DEFAULT_CONFIG.ollamaHost;
     const model=config.extractModel||options.extractModel||opts.model;
     if(model){
      const r=await fetch(`${host}/api/chat`,{
       method:'POST',
       headers:{'content-type':'application/json'},
       signal:AbortSignal.timeout(Number(config.extractTimeoutMs)||4000),
       body:JSON.stringify({
        model,
        stream:false,
        keep_alive:'0',
        options:{num_ctx:1024,num_predict:80,temperature:0},
        messages:[{role:'user',content:`用一句不超过40字的中文概括这次陪看会话（不要列表）：\n${replies.join('\n')}`}]
       })
      });
      if(r.ok){
       const j=await r.json();
       const t=(j.message?.content||'').trim();
       if(t&&!/WAIT_/.test(t))summary=clampText(t,100);
      }
     }
    }catch{}
   }
   if(config.enabled)remember({kind:'session_summary',text:summary,salience:0.7,sessionId:sid});
  }
  // Only clear if this session is still current (begin may have started a new one).
  if(sessionId===sid){sessionId=null;sessionReplies=[];clearShortTerm();}
  return {ok:true,sessionId:sid,summary};
 }

 function clear(){
  ensureDir();
  items=[];
  sessionReplies=[];
  clearShortTerm();
  writeFileSync(storePath,'');
  persistIndex();
  return {ok:true};
 }

 function setEnabled(enabled){
  loadConfig();
  config.enabled=!!enabled;
  saveConfig();
  return {enabled:config.enabled};
 }

 function setShortTermEnabled(enabled){
  loadConfig();
  config.shortTermEnabled=!!enabled;
  saveConfig();
  if(!config.shortTermEnabled)clearShortTerm();
  return {shortTermEnabled:config.shortTermEnabled};
 }

 function status(){
  loadStore();
  const byKind={preference:0,entity:0,session_summary:0,moment:0};
  for(const it of items)byKind[it.kind]=(byKind[it.kind]||0)+1;
  return {
   enabled:!!config.enabled,
   dir,
   count:items.length,
   byKind,
   sessionId,
   maxInjectChars:config.maxInjectChars,
   retainDays:config.retainDays,
   shortTermEnabled:config.shortTermEnabled!==false,
   shortTermTurns:shortBubbles.length,
   shortTermMaxChars:config.shortTermMaxChars,
   shortTermPreview:shortTermContextForPrompt(),
   contextPreview:contextForPrompt()
  };
 }

 // Eager load for callers that share one instance
 loadStore();

 return {
  dir,
  loadConfig,
  remember,
  search,
  contextForPrompt,
  longTermContextForPrompt,
  shortTermContextForPrompt,
  observeShortTerm,
  clearShortTerm,
  shouldSkipReply,
  heuristicExtract,
  rememberFromReply,
  beginSession,
  currentSessionId,
  endSession,
  clear,
  setEnabled,
  setShortTermEnabled,
  status,
  normalizeKey,
  clampText,
  similar,
  DEFAULT_CONFIG
 };
}

module.exports={createMemory,DEFAULT_CONFIG,clampText,similar,normalizeKey};
