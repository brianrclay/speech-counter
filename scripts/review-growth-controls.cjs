// Imported only by build-review; never part of the ordinary production build.
const fs=require('fs'),path=require('path');
module.exports=function(out){
 const namespace=s=>s.replaceAll('speech-counter','speech-growth-review');
 for(const name of ['store','board-pro-prompt','feature-video','billing']){
  fs.writeFileSync(path.join(out,name+'-growth-review.js'),namespace(fs.readFileSync(path.join(out,name+'.js'),'utf8')));
 }
 const bootstrap=`(() => {
 'use strict';
 if(new URLSearchParams(location.search).get('show')!=='1') return;
 try {
  localStorage.removeItem('speech-growth-review:post-clear-pro:v1');
  localStorage.removeItem('speech-growth-review:student-tour-dismissed:v1');
  localStorage.setItem('speech-growth-review-state-v1',JSON.stringify([{sessionId:'fictional-growth-review',name:'Fictional student',target:'Practice sound',correct:7,incorrect:3}]));
  window.speechGrowthReviewRequested=true;
 } catch (_) { window.speechGrowthReviewStorageError=true; }
})();`;
 const activate=`(() => {
 const status=document.getElementById('growth-review-status');
 if(window.speechGrowthReviewStorageError){status.textContent='Browser storage is unavailable. The suggestion stays hidden.';return;}
 if(!window.speechGrowthReviewRequested)return;
 window.SpeechStore.ready().then(()=>{
  status.textContent='Clearing a fictional ten-trial board. Undo restores this sample; your ordinary preview board is separate.';
  document.getElementById('clear').click();
  history.replaceState(null,'',location.pathname);
 });
})();`;
 fs.writeFileSync(path.join(out,'growth-review-bootstrap.js'),bootstrap);
 fs.writeFileSync(path.join(out,'growth-review-activate.js'),activate);
 let html=fs.readFileSync(path.join(out,'index.html'),'utf8');
 for(const name of ['store','board-pro-prompt','feature-video','billing'])html=html.replaceAll('./'+name+'.js','./'+name+'-growth-review.js');
 html=html.replace('</head>','<script src="./growth-review-bootstrap.js"></script></head>');
 const controls='<aside style="padding:16px;max-width:720px;margin:auto"><h2 style="font-size:16px">Growth suggestion review</h2><p id="growth-review-status">Separate fictional workspace. Show resets only this demo’s suggestion preference and sample board.</p><a class="btn" href="./growth-preview.html?show=1">Show growth preview</a> <a class="btn btn-ghost" href="./index.html">Back to ordinary preview</a></aside>';
 html=html.replace(/(<body[^>]*>)/,'$1'+controls).replace('</body>','<script src="./growth-review-activate.js"></script></body>');
 fs.writeFileSync(path.join(out,'growth-preview.html'),html);
 const index=fs.readFileSync(path.join(out,'index.html'),'utf8').replace(/(<body[^>]*>)/,'$1<aside style="padding:12px;text-align:center"><a class="btn" href="./growth-preview.html?show=1">Show growth preview</a><p style="font-size:12px">Separate fictional workspace; preserves this preview board.</p></aside>');
 fs.writeFileSync(path.join(out,'index.html'),index);
};
