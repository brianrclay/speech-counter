const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),cp=require('child_process');
(async()=>{
 cp.execFileSync(process.execPath,['scripts/build-review.cjs']);
 const read=n=>fs.readFileSync('review-dist/'+n,'utf8');
 const ordinary='speech-counter-state-v1',ordinaryPrompt='speech-counter:post-clear-pro:v1';
 const saved='[{"name":"ordinary fictional board","correct":4}]';
 const mem=new Map([[ordinary,saved],[ordinaryPrompt,'{"dismissed":true}'],['speech-growth-review:post-clear-pro:v1','{"dismissed":true,"lastShown":999}'],['speech-growth-review:student-tour-dismissed:v1','true']]);
 const window={};const storage={getItem:k=>mem.get(k),removeItem:k=>mem.delete(k),setItem:(k,v)=>mem.set(k,v)};
 const bootstrap=read('growth-review-bootstrap.js');
 vm.runInNewContext(bootstrap,{window,location:{search:'?show=1'},URLSearchParams,localStorage:storage});
 assert.equal(mem.get(ordinary),saved);assert.equal(mem.get(ordinaryPrompt),'{"dismissed":true}');assert(!mem.has('speech-growth-review:post-clear-pro:v1'));assert(!mem.has('speech-growth-review:student-tour-dismissed:v1'));
 const sample=JSON.parse(mem.get('speech-growth-review-state-v1'));assert.equal(sample[0].correct+sample[0].incorrect,10);assert.equal(sample[0].name,'Fictional student');
 // A repeat reset after cooldown/dismissal affects only the dedicated workspace.
 mem.set('speech-growth-review:post-clear-pro:v1','{"dismissed":true}');vm.runInNewContext(bootstrap,{window,location:{search:'?show=1'},URLSearchParams,localStorage:storage});assert(!mem.has('speech-growth-review:post-clear-pro:v1'));assert.equal(mem.get(ordinary),saved);
 let clears=0;const status={};window.SpeechStore={ready:()=>Promise.resolve()};vm.runInNewContext(read('growth-review-activate.js'),{window,document:{getElementById:id=>id==='clear'?{click:()=>clears++}:status},history:{replaceState(){}},location:{pathname:'/growth-preview.html'}});await Promise.resolve();assert.equal(clears,1);
 const blocked={};vm.runInNewContext(bootstrap,{window:blocked,location:{search:'?show=1'},URLSearchParams,localStorage:{removeItem(){throw Error('blocked')}}});assert(blocked.speechGrowthReviewStorageError);assert(!blocked.speechGrowthReviewRequested);
 assert(read('growth-preview.html').includes('store-growth-review.js'));assert(read('growth-preview.html').includes('board-pro-prompt-growth-review.js'));assert(!read('store-growth-review.js').includes('speech-counter'));assert(!read('board-pro-prompt-growth-review.js').includes('speech-counter'));
 assert(read('index.html').includes('Show growth preview'));assert(read('_headers').includes("connect-src 'none'"));assert(read('_headers').includes("form-action 'none'"));
 cp.execFileSync(process.execPath,['scripts/build.js']);assert(!fs.existsSync('www/growth-preview.html'));assert(!fs.existsSync('www/growth-review-bootstrap.js'));assert(!fs.readFileSync('www/index.html','utf8').includes('Show growth preview'));
 console.log('PASS review-only reset after dismissal/cooldown, isolated fictional storage, real Clear button activation, storage-failure suppression, namespace isolation and production-build exclusion');
})().catch(e=>{console.error(e);process.exitCode=1});
