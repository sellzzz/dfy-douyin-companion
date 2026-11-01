(() => {
 const get=id=>document.getElementById(id),enabled=get('reply-enabled'),key=get('reply-key'),notice=get('reply-notice');
 const buttons=['reply-save','reply-test','reply-clear'];
 function message(text){notice.textContent=text;}
 function show(config){enabled.checked=config.enabled;key.placeholder=config.hasKey?'密钥已保存，留空可继续使用':'在本机填写 DeepSeek API Key';get('reply-mode').textContent=config.enabled?'本地描述 → DeepSeek 接话':'只用本地，不推送';}
 function busy(value){enabled.disabled=value;key.disabled=value;for(const id of buttons)get(id).disabled=value;}
 function error(e){message(e.message.replace(/^Error invoking remote method[^:]*: /,''));}
 get('reply-save').onclick=async()=>{busy(true);try{const c=await window.companion.saveReplyConfig({enabled:enabled.checked,key:key.value});key.value='';show(c);message(c.enabled?'已开启：接下来只推送文字摘要，不发送截图。':'已关闭推送：继续使用本地结果。');}catch(e){error(e);}finally{busy(false);}};
 get('reply-clear').onclick=async()=>{busy(true);try{show(await window.companion.saveReplyConfig({enabled:false,clearKey:true}));key.value='';message('本机密钥已清除，推送已关闭。');}catch(e){error(e);}finally{busy(false);}};
 get('reply-test').onclick=async()=>{busy(true);message('正在测试，只发送固定测试文字…');try{message((await window.companion.testReply()).message);}catch(e){error(e);}finally{busy(false);}};
 window.doupetOpenSettings=()=>{get('reply-settings').open=true;get('reply-settings').scrollIntoView({block:'start',behavior:'smooth'});};
 window.companion.replyConfig().then(config=>{show(config);busy(false);message(config.hasKey?'密钥已保存在本机；留空即可保留。':'尚未填写密钥。不开启时只用本地模型。');}).catch(error);
})();
