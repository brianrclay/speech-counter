// Reproducible static review build. Never ships backend functions or credentials.
const fs=require('fs'),path=require('path'),cp=require('child_process');
cp.execFileSync(process.execPath,['scripts/build.js'],{stdio:'inherit'});
const out=path.resolve('review-dist');fs.rmSync(out,{recursive:true,force:true});fs.cpSync('www',out,{recursive:true});
const billing=fs.readFileSync('billing.js','utf8');
const defaults=billing.slice(billing.indexOf("    const PLAN_EXPERIMENT ="),billing.indexOf('    function track(name'));
const mock=`(() => { 'use strict'; const platform=()=> 'web'; ${defaults}
const disabled=async()=>{throw Error('Review only: accounts and payments are disabled.');};
window.SpeechBilling={platform,defaultPlan,track(){},ready:async()=>{},refresh:async()=>({active:false}),refreshIfPremium(){},offerings:async()=>[{id:'lifetime',price:'$19.99'},{id:'monthly',price:'$2.99'}],purchase:disabled,restore:disabled,logIn:disabled,logOut:async()=>{},canRestore:()=>false,ENTITLEMENT:'roster'};
})();`;
fs.writeFileSync(path.join(out,'billing.js'),mock);
fs.writeFileSync(path.join(out,'analytics.js'),`window.SpeechAnalytics={track(){},enabled:()=>false,setEnabled(){}};`);
fs.writeFileSync(path.join(out,'account.js'),`(()=>{const disabled=async()=>{throw Error('Review only: sign-in and account changes are disabled.');};window.SpeechAccount={session:()=>null,apiBase:'',call:disabled,requestCode:disabled,verifyCode:disabled,signOut:disabled,mountForm:()=>{const p=document.createElement('p');p.textContent='Review only: account actions are disabled.';return p;}}})();`);
fs.writeFileSync(path.join(out,'sync.js'),`window.SpeechSync={start(){},stop(){}};`);
for(const file of fs.readdirSync(out).filter(f=>f.endsWith('.html'))){let html=fs.readFileSync(path.join(out,file),'utf8');html=html.replace('<body', '<body').replace(/(<body[^>]*>)/,'$1<p style="padding:12px;text-align:center;background:#fff3cc;color:#302700">Development review · fictional data only · accounts, sync, payments and analytics disabled · prices are illustrative.</p>');fs.writeFileSync(path.join(out,file),html);}
fs.writeFileSync(path.join(out,'_headers'),`/*\n  Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'; connect-src 'none'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; font-src 'self'; media-src 'self'; frame-src 'none'; object-src 'none'; form-action 'none'; base-uri 'self'\n  X-Robots-Tag: noindex, nofollow\n  X-Content-Type-Options: nosniff\n`);
// Deploy this directory only. No API routes, redirects, functions, SDK or keys.
fs.rmSync(path.join(out,'vendor'),{recursive:true,force:true});
console.log('Static safe review build: '+out);
