const fs=require('fs');
const text=fs.readFileSync('public/demo/speech-count-2026-09-22.csv','utf8').replace(/^\uFEFF/,'');
const lines=text.trim().split(/\r?\n/).map(r=>r.split(','));
const [columns,...rows]=lines;
const data=rows.map(r=>Object.fromEntries(columns.map((c,i)=>[c,r[i]])));
if(data.length!==4||data.some(r=>r.Student!=='Maya Bennett'))throw Error('Unexpected demo CSV');
fs.writeFileSync('src/reveal-v2/export-data.json',JSON.stringify(data,null,2));
console.log('Verified four exported Maya sessions.');
