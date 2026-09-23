// Isolated filming host: original app files, fictional account, local sync fixture.
const http=require('http');const fs=require('fs');const path=require('path');
const root=path.resolve(__dirname,'../..');
const out=path.resolve(__dirname,'../public/demo');fs.mkdirSync(out,{recursive:true});
let rev=0;const students=new Map();const sessions=new Map();const events=[];
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2'};
const stamp='2026-09-22T16:00:00.000Z';
const boot=`<script>const NativeDate=Date;window.Date=class extends NativeDate {constructor(...a){super(...(a.length?a:['${stamp}']))}static now(){return new NativeDate('${stamp}').getTime()}};</script>`;
function reply(res,data){res.writeHead(200,{'Content-Type':'application/json','Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type, Authorization'});res.end(JSON.stringify(data));}
async function handler(req,res){
 const url=new URL(req.url,'http://localhost');
 if(req.method==='OPTIONS'){reply(res,{});return;}
 if(url.pathname==='/api/sync'){
  let raw='';for await(const part of req)raw+=part;
  const body=JSON.parse(raw||'{}');
  for(const [kind,map]of [['students',students],['sessions',sessions]])for(const record of body[kind]||[]){const old=map.get(record.id);if(!old||JSON.stringify({...old,rev:undefined})!==JSON.stringify(record))map.set(record.id,{...record,rev:++rev});}
  events.push({device:req.headers.origin||req.headers.host,pushedStudents:(body.students||[]).length,pushedSessions:(body.sessions||[]).length,rev});
  fs.writeFileSync(path.join(out,'sync-proof.json'),JSON.stringify({fixture:'Local backend; production sync.js client',events,students:[...students.values()],sessions:[...sessions.values()]},null,2));
  reply(res,{rev,more:false,students:[...students.values()].filter(r=>r.rev>(body.since||0)),sessions:[...sessions.values()].filter(r=>r.rev>(body.since||0))});return;
 }
 if(url.pathname==='/fixture/history'){
  const student=[...students.values()].find(s=>s.name==='Maya Bennett');if(!student){res.writeHead(409);res.end('Add Maya first');return;}
  for(const[day,correct,incorrect]of [[14,14,6],[16,16,4],[18,17,3]]){const date=`2026-09-${day}T16:00:00.000Z`;sessions.set('history-'+day,{id:'history-'+day,studentId:student.id,target:'Initial /s/ sentences',correct,incorrect,startedAt:date,createdAt:date,updatedAt:date,deletedAt:null,rev:++rev});}
  reply(res,{ok:true,rev});return;
 }
 if(url.pathname==='/setup'){
  res.writeHead(200,{'Content-Type':'text/html'});res.end(`<html><body><script>localStorage.clear();localStorage.setItem('speech-counter:api-base','http://localhost:8757');localStorage.setItem('speech-counter:session:v1',JSON.stringify({userId:'video-demo',email:'demo@example.test',token:'local-fixture-only',signedInAt:'${stamp}'}));localStorage.setItem('speech-counter:entitlement:v1',JSON.stringify({active:true,promo:true,appUserId:'video-demo'}));location.href='/students.html';</script></body></html>`);return;
 }
 if(url.pathname.startsWith('/api/')){reply(res,{});return;}
 const p=path.resolve(root,'.'+(url.pathname==='/'?'/index.html':url.pathname));if(!p.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
 fs.readFile(p,(e,data)=>{if(e){res.writeHead(404);res.end('Not found');return;}const html=path.extname(p)==='.html';res.writeHead(200,{'Content-Type':types[path.extname(p)]||'application/octet-stream','Content-Security-Policy':"default-src 'self' data: blob:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self' http://localhost:8757; img-src 'self' data:; font-src 'self'"});res.end(html?data.toString().replace('<head>','<head>'+boot):data);});
}
for(const port of [8757,8758])http.createServer((req,res)=>handler(req,res).catch(e=>{res.writeHead(500);res.end(String(e));})).listen(port,'127.0.0.1',()=>console.log('Demo app http://localhost:'+port+'/setup'));
