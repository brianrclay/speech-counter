// Captures the actual app. Only the sample records shipped in assets/pro are used.
const {chromium} = require('/Users/brianrclay/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '../..');
const out = path.resolve(__dirname, '../public/captures');
const types = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2'};
const server = http.createServer((req,res)=>{
  const p = path.join(root,decodeURIComponent(req.url.split('?')[0] === '/' ? '/index.html' : req.url.split('?')[0]));
  if (!p.startsWith(root + path.sep)) {res.writeHead(403);res.end();return;}
  fs.readFile(p,(err,data)=>{res.writeHead(err?404:200,{'Content-Type':types[path.extname(p)] || 'application/octet-stream'});res.end(err?'Not found':data);});
});
(async()=>{
  await new Promise(r=>server.listen(8756,'127.0.0.1',r));
  const browser = await chromium.launch({channel:'chrome',headless:true});
  try {
    const context = await browser.newContext({viewport:{width:430,height:850},deviceScaleFactor:3,colorScheme:'light',reducedMotion:'reduce',locale:'en-US',timezoneId:'America/Denver'});
    await context.route('https://**/*',r=>r.abort());
    const page = await context.newPage();
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto('http://127.0.0.1:8756/index.html');
    await page.evaluate(async()=>{
      await SpeechStore.ready();
      SpeechStore.entitlements.set({active:true});
      const samples=[['Maya Bennett','Initial /s/ sentences',18,2],['Oliver Chen','Initial /r/ words',17,3],['Ava Reed','Final /k/ phrases',16,4]];
      samples.forEach(([name,target,correct,incorrect],i)=>{
        const student=SpeechStore.students.findOrCreate(name);
        const days=i===0?[[14,14,6],[16,16,4],[18,18,2]]:[[18,correct,incorrect]];
        days.forEach(([day,c,w])=>{
          const session=SpeechStore.sessions.upsert({id:SpeechStore.uuid(),studentId:student.id,target,correct:c,incorrect:w});
          session.startedAt=session.createdAt=session.updatedAt=`2026-09-${day}T16:00:00.000Z`;
        });
      });
      SpeechStore.board.save([{sessionId:SpeechStore.sessions.get ? 'video-board' : '',name:'Maya Bennett',target:'Initial /s/ sentences',correct:18,incorrect:2}]);
      await SpeechStore.flush();
    });
    const shot=async(name)=>{await page.evaluate(()=>document.fonts.ready);await page.screenshot({path:path.join(out,name+'.png')});};
    await page.reload();await page.getByRole('button',{name:'18 correct',exact:true}).waitFor();await shot('tally');
    await page.getByRole('textbox',{name:'Target',exact:true}).fill('Initial /s/ sentences');
    await page.getByRole('combobox',{name:'Name',exact:true}).fill('Ma');
    await page.locator('#name-suggestions').waitFor({state:'visible'});await shot('names');
    await page.goto('http://127.0.0.1:8756/students.html');
    await page.locator('.student-card').first().waitFor();await shot('roster');
    await page.locator('.student-card').filter({hasText:'Maya Bennett'}).click();
    await page.locator('#detail-view').waitFor({state:'visible'});await shot('history');
    await page.getByRole('button',{name:'Edit session',exact:true}).first().click();await shot('edit');
    await page.goto('http://127.0.0.1:8756/students.html');
    await page.locator('.student-card').first().waitFor();
    const download=page.waitForEvent('download');await page.getByRole('button',{name:'Export as CSV'}).click();
    await (await download).saveAs(path.join(out,'actual-export.csv'));await shot('export');
    fs.writeFileSync(path.join(out,'provenance.json'),JSON.stringify({source:'Local app source files, not recreated UI',sampleDataSource:['assets/pro/roster.svg','assets/pro/progress.svg'],viewport:[430,850],deviceScaleFactor:3,externalRequests:'blocked',errors},null,2));
    console.log('Captured:',fs.readdirSync(out));
    if(errors.length) throw new Error(errors.join('\n'));
  } finally {await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
