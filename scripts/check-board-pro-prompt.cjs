const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const src=fs.readFileSync(require('path').join(__dirname,'../board-pro-prompt.js'),'utf8');
function setup({native=false,active=false,fail=false,tour=false,last=0,reject=false,defer=false,visible=true}={}){
 const listeners={},docListeners={},events=[],mem=new Map(); if(tour)mem.set('speech-counter:student-tour-dismissed:v1','true');if(last)mem.set('speech-counter:post-clear-pro:v1',JSON.stringify({lastShown:last}));
 const controls={a:{addEventListener:(n,f)=>controls.a[n]=f},button:{addEventListener:(n,f)=>controls.button[n]=f}};
 const classes=new Set(),link={classList:{add:x=>classes.add(x),remove:x=>classes.delete(x)},after:c=>{}};
 const card={hidden:true,setAttribute(){},querySelector:s=>controls[s]};
 let resolveBilling;
 const pendingBilling = new Promise(resolve => {resolveBilling=resolve});
 const window={SpeechBilling:{platform:()=>native?'ios':'web',refresh:async()=>{if(reject)throw Error('offline');if(defer)return pendingBilling;return {active}}},SpeechStore:{entitlements:{isPremium:()=>active}},SpeechAnalytics:{track:(n,p)=>events.push([n,p])},addEventListener:(n,f)=>listeners[n]=f};
 vm.runInNewContext(src,{window,document:{visibilityState:visible?'visible':'hidden',getElementById:()=>link,createElement:()=>card,addEventListener:(n,f)=>docListeners[n]=f},localStorage:{getItem:k=>{if(fail)throw Error('storage');return mem.get(k)||null},setItem:(k,v)=>{if(fail)throw Error('storage');mem.set(k,v)}},Date,JSON,Number});
 return {mem,resolveBilling,card,listeners,events,controls,docListeners,clear:()=>{listeners['speech:board-clear-start']?.({detail:{id:1}});return listeners['speech:board-cleared']?.({detail:{meaningful:true,id:1}})}};
}
(async()=>{
 for(const options of [{native:true},{active:true},{fail:true},{tour:true},{reject:true},{visible:false},{last:Date.now()}]){const s=setup(options);await s.clear();assert(s.card.hidden)}
 let s=setup();await s.listeners['speech:board-cleared']({detail:{meaningful:false}});assert(s.card.hidden);await s.clear();assert(!s.card.hidden);s.listeners['speech:board-undo']();assert(s.card.hidden);await s.clear();assert(s.card.hidden);
 s=setup();const pending=s.clear();s.docListeners.keydown({target:{closest:()=>true}});await pending;assert(s.card.hidden);
 s=setup({last:Date.now()-8*86400000});await s.clear();assert(!s.card.hidden);s.controls.a.click();s.controls.button.click();assert(s.card.hidden);await s.clear();assert(s.card.hidden);assert.equal(s.events.length,3);for(const [n,p]of s.events){assert(['board_pro_prompt_view','board_pro_prompt_click','board_pro_prompt_dismiss'].includes(n));assert.equal(JSON.stringify(p),JSON.stringify({prompt_id:'web_post_clear_pro_v1',source:'board'}))}
 for(const type of ['pointerdown','keydown','input']){s=setup();await s.clear();s.docListeners[type]({target:{closest:()=>true}});assert(s.card.hidden)}
 s=setup({defer:true});const flight=s.clear();s.listeners['speech:board-undo']();s.resolveBilling({active:false});await flight;assert(s.card.hidden);assert(!s.mem.has('speech-counter:post-clear-pro:v1'));
 s=setup();s.listeners['speech:board-clear-start']({detail:{id:1}});s.docListeners.input({target:{closest:()=>true}});await s.listeners['speech:board-cleared']({detail:{id:1,meaningful:true}});assert(s.card.hidden);assert.equal(s.events.length,0);
 s=setup();s.listeners['speech:board-clear-start']({detail:{id:2}});await s.listeners['speech:board-cleared']({detail:{id:1,meaningful:true}});assert(s.card.hidden);assert.equal(s.events.length,0);
 console.log('PASS suppression, eligibility signal, cooldown, permanent dismissal, storage failure, unresolved billing, Undo hide, pending cancellation, next interactions, exact privacy payloads');
})().catch(e=>{console.error(e);process.exitCode=1});
