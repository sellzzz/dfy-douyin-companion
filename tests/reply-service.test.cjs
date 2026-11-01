const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {ReplyService}=require('../app/reply-service.cjs');
function fixture(t,fetchFn){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dfy-reply-')),file=path.join(dir,'settings.json'),calls=[];
 const safeStorage={isEncryptionAvailable:()=>true,encryptString:s=>Buffer.from([...s].reverse().join('')),decryptString:b=>[...b.toString()].reverse().join('')};
 const service=new ReplyService({file,safeStorage,fetchFn:async(url,options)=>{calls.push({url,...options,body:JSON.parse(options.body)});return fetchFn?fetchFn(url,options):{ok:true,json:async()=>({choices:[{message:{content:'这画面挺有意思呀。'}}]})};}});
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return {service,file,calls,safeStorage};
}
test('forwarding is off by default and disabled requests never contact a provider',async t=>{
 const f=fixture(t);assert.equal(f.service.publicConfig().enabled,false);
 assert.equal((await f.service.compose('一只小狗正在走路')).replySource,'local');assert.equal(f.calls.length,0);
 f.service.save({enabled:false,key:'unit-only-test-key'});await f.service.compose('本地描述');assert.equal(f.calls.length,0);
});
test('only local text and bounded session context are forwarded; settings never expose the saved key',async t=>{
 const f=fixture(t),settings=f.service.save({enabled:true,key:'unit-only-test-key'});
 assert.equal(settings.hasKey,true);assert.ok(!JSON.stringify(settings).includes('unit-only-test-key'));assert.ok(!fs.readFileSync(f.file,'utf8').includes('unit-only-test-key'));
 for(let i=0;i<6;i++)assert.equal((await f.service.compose('本地画面描述 '+i)).replySource,'deepseek');
 for(const call of f.calls){assert.equal(call.url,'https://api.deepseek.com/chat/completions');assert.equal(call.headers.Authorization,'Bearer unit-only-test-key');assert.ok(call.body.messages.length<=8);assert.ok(call.body.messages.every(m=>typeof m.content==='string'));assert.ok(!JSON.stringify(call.body).includes('image_url'));assert.ok(!JSON.stringify(call.body).includes('unit-only-test-key'));}
 assert.ok(f.calls.at(-1).body.messages.at(-1).content.includes('本地画面描述 5'));
 assert.ok(f.calls[0].body.messages[0].content.includes('画面描述'));
 assert.ok(f.calls[0].body.messages[0].content.includes('组织'));
 assert.ok(f.calls[0].body.messages[0].content.includes('陪刷'));
 assert.ok(!f.calls[0].body.messages[0].content.includes('润色'));
 assert.ok(!f.calls[0].body.messages[0].content.includes('陪刷草稿'));
 assert.ok(f.calls.at(-1).body.messages.at(-1).content.includes('本地画面描述'));
 assert.ok(f.calls.at(-1).body.messages.at(-1).content.includes('组织'));
 assert.ok(!f.calls.at(-1).body.messages.at(-1).content.includes('润色'));
 f.service.reset();await f.service.compose('新的陪看');assert.equal(f.calls.at(-1).body.messages.length,2);
});
test('cloud path composes companion speech from a factual description, not polish of a local draft',async t=>{
 const f=fixture(t);f.service.save({enabled:true,key:'unit-only-test-key'});
 const description='画面中有一只小狗在草地上跑。';
 assert.equal((await f.service.compose(description)).replySource,'deepseek');
 const system=f.calls[0].body.messages[0].content,user=f.calls[0].body.messages.at(-1).content;
 assert.match(system,/画面描述/);assert.match(system,/组织/);assert.match(system,/口语|陪刷|一起刷/);
 assert.ok(!system.includes('润色'));assert.ok(!system.includes('陪刷草稿'));
 assert.ok(!/解说员/.test(system)||/不要.*解说/.test(system));
 assert.ok(user.includes(description));assert.ok(user.includes('本地画面描述'));assert.ok(user.includes('组织'));
 assert.ok(!user.includes('润色'));assert.ok(!user.includes('陪刷草稿'));
});
test('auth and empty-frame results never reach the remote model',async t=>{
 const f=fixture(t);f.service.save({enabled:true,key:'unit-only-test-key'});
 for(const summary of ['WAIT_AUTH','WAIT_VIDEO','', {image:'data:image/jpeg;base64,private'}])await f.service.compose(summary);
 assert.equal(f.calls.length,0);
});
test('provider failures fall back to local text, redact response details and back off',async t=>{
 const f=fixture(t,async()=>({ok:false,status:401,json:async()=>{throw Error('private provider details');}}));f.service.save({enabled:true,key:'unit-only-test-key'});
 const reply=await f.service.compose('本地摘要');assert.equal(reply.text,'本地摘要');assert.equal(reply.cloudStatus,'fallback');assert.equal(reply.cloudMessage,'密钥无效，请在本机检查');
 await f.service.compose('下一帧');assert.equal(f.calls.length,1);
});
test('turning forwarding off cancels pending work and discards its late answer',async t=>{
 let finish;const f=fixture(t,()=>new Promise(resolve=>finish=()=>resolve({ok:true,json:async()=>({choices:[{message:{content:'迟到的云端回复'}}]})})));
 f.service.save({enabled:true,key:'unit-only-test-key'});const pending=f.service.compose('当前摘要');
 f.service.save({enabled:false});assert.equal(f.calls[0].signal.aborted,true);finish();
 const reply=await pending;assert.equal(reply.text,'当前摘要');assert.equal(reply.cloudStatus,'cancelled');
 await f.service.compose('只用本地');assert.equal(f.calls.length,1);assert.equal(f.service.context.length,0);
});
test('key clearing disables forwarding and insecure storage cannot persist a new key',t=>{
 const f=fixture(t);f.service.save({enabled:true,key:'unit-only-test-key'});f.service.save({enabled:false,clearKey:true});assert.equal(f.service.publicConfig().hasKey,false);
 f.safeStorage.isEncryptionAvailable=()=>false;assert.throws(()=>f.service.save({enabled:true,key:'unit-only-test-key'}),/安全存储不可用/);assert.equal(f.service.publicConfig().enabled,false);
});
test('connection tests send fixed text, not captured summaries or session context',async t=>{
 const f=fixture(t);f.service.save({enabled:false,key:'unit-only-test-key'});await f.service.compose('不应外发的本地内容');assert.equal((await f.service.test()).ok,true);
 assert.deepEqual(f.calls[0].body.messages,[{role:'user',content:'请只回复“连接成功”。'}]);
});
