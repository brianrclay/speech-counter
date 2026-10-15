// Run the real UI handlers with fake DOM controls and billing to reproduce
// an offline first load, recovery, and two simultaneous purchase taps.
const fs=require('fs'),assert=require('assert/strict'),path=require('path');
const source=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');
async function students() {
 const src=source('students.js');
 const buttons=[{dataset:{package:'lifetime'}},{dataset:{package:'monthly'}}].map(b=>Object.assign(b,{setAttribute(){},querySelector(){return {}}}));
 const nodes=new Map();const node=k=>{if(!nodes.has(k)) nodes.set(k,{textContent:''});return nodes.get(k)};
 const prices={lifetime:{textContent:'—'},monthly:{textContent:'—'}};
 const document={getElementById:node,querySelector:s=>prices[/data-price="([^"]+)/.exec(s)?.[1]],querySelectorAll:s=>s==='[data-price]'?Object.values(prices):[prices[/data-price="([^"]+)/.exec(s)[1]]]};
 let attempts=0,purchases=0;
 const billing={platform:()=> 'ios',track(){},offerings:async()=>{attempts++;if(attempts===1)throw Error('offline');return [{id:'lifetime',price:'$19.99'}]},purchase:async()=>{purchases++;return {active:true}}};
 const account={session:()=>({userId:'test'})};
 const fragment=src.slice(src.indexOf('    function setPaywallStatus'),src.indexOf('    planButtons.forEach((button) => {\n        button.addEventListener'));
 const run=new Function('document','billing','account','window',`const buyButtons=[{},{}], planButtons=arguments[4], paywallStatus={};const buyLabel={},buyPrice={};const BUY_LABELS={lifetime:'Purchase lifetime',monthly:'Subscribe monthly'};const store={};let selectedPackage='lifetime',offerings=[],pricesLoading=null,pricesLoaded=false,buying=false,paywallViewed=false,celebrating=null;function route(){};${fragment};return {loadPrices,buy};`);
 const ui=run(document,billing,account,{},buttons);
 await assert.rejects(ui.loadPrices());
 await Promise.all([ui.buy('lifetime'),ui.buy('lifetime')]);
 assert.equal(attempts,2);assert.equal(purchases,1);assert.equal(prices.lifetime.textContent,'$19.99');
 console.log('PASS Students initial load failure → purchase retry reloads and invokes checkout exactly once');
}
async function board() {
 const src=source('feature-video.js');
 const nodes=new Map();const node=k=>{if(!nodes.has(k)) nodes.set(k,{textContent:'',setAttribute(){},dataset:{package:'lifetime'}});return nodes.get(k)};
 const dock={querySelector:node,querySelectorAll:()=>[node('button')]};let attempts=0,purchases=0;
 const billing={track(){},platform:()=> 'web',offerings:async()=>{attempts++;if(attempts===1)throw Error('offline');return [{id:'lifetime',price:'$19.99'}]},purchase:async()=>{purchases++;return {active:true}}};
 const fragment=src.slice(src.indexOf('    function select(id)'),src.indexOf('    function open(trigger'));
 const ui=new Function('dock','billing','window','location',`let selected='lifetime',packages=[],busy=false,pricesLoading=null;const dialog={open:true};let opener;function close(){};function open(){};${fragment};return {loadPrices,purchase}`)(dock,billing,{SpeechAccount:{session:()=>({userId:'test'})}},{});
 await assert.rejects(ui.loadPrices());await Promise.all([ui.purchase('lifetime'),ui.purchase('lifetime')]);
 assert.equal(attempts,2);assert.equal(purchases,1);console.log('PASS Board initial load failure → purchase retry reloads and invokes checkout exactly once');
}
(async()=>{await students();await board()})().catch(e=>{console.error(e);process.exitCode=1});
