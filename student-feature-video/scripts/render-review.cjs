const {bundle}=require('@remotion/bundler');
const {selectComposition,renderStill,renderMedia,openBrowser}=require('@remotion/renderer');
const path=require('path');const fs=require('fs');
(async()=>{
 const serveUrl=await bundle({entryPoint:path.resolve('src/index.ts'),outDir:path.resolve('out/bundle-v2'),rspack:true});
 const browser=await openBrowser('chrome',{browserExecutable:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 try{
  const composition=await selectComposition({serveUrl,id:'StudentFeatureReveal',puppeteerInstance:browser});
  fs.mkdirSync('out/review',{recursive:true});
  if(process.argv.includes('--video')){
   await renderMedia({serveUrl,composition,puppeteerInstance:browser,codec:'h264',outputLocation:path.resolve('out/speech-count-student-features-v4.mp4'),crf:18,pixelFormat:'yuv420p',concurrency:3,onProgress:({progress})=>{const p=Math.floor(progress*100);if(p%10===0&&p!==global.lastProgress){global.lastProgress=p;console.log('Render '+p+'%');}}});
   console.log('Rendered 1080 × 1920 MP4.');
  }else{
   const frames=process.argv.slice(2).map(Number).filter(Number.isFinite);
   for(const frame of frames.length?frames:[60,170,210,305,381,435,462,539,615,681,790,858,980]){
    await renderStill({serveUrl,composition,frame,output:path.resolve('out/review/'+frame+'.png'),scale:.5,puppeteerInstance:browser});console.log('Checked frame '+frame);
   }
  }
 }finally{await browser.close({silent:true});}
})().catch(e=>{console.error(e);process.exitCode=1});
