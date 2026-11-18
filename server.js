/* Game Hub room server.
   A small message relay with memory: phones subscribe to a room's topics, publish to them, and the server
   remembers the latest game state ("retained" messages). It also picks one connected phone as the room "leader";
   that phone runs the game rules and turn timer. If the leader goes quiet for 12 seconds, another player takes over.
   Nothing is saved to disk: if the server restarts, the first phone to come back restores the room from its own copy. */
const http=require('http');
const {WebSocketServer}=require('ws');

const PORT=process.env.PORT||10000;
const PREFIX='gamehub-v3/';
const STALE_MS=12000;          // leader counts as gone after this much silence
const ROOM_TTL_MS=6*3600e3;    // forget empty rooms after 6 hours
const MAX_MSG=200*1024, MAX_ROOMS=5000;

const rooms=new Map();   // code -> {members:Map(id->member), leader, creator, retained:Map(topic->payload), subs:Map(topic->Set(ws)), touched}
const roomOf=topic=>{if(typeof topic!=='string'||!topic.startsWith(PREFIX))return null;const code=topic.slice(PREFIX.length).split('/')[0];return /^[A-Z0-9]{6}$/.test(code)?code:null;};
function room(code){
  let r=rooms.get(code);
  if(!r){if(rooms.size>=MAX_ROOMS)return null;r={members:new Map(),leader:null,creator:null,retained:new Map(),subs:new Map(),touched:Date.now()};rooms.set(code,r);}
  r.touched=Date.now();return r;
}
const send=(ws,o)=>{if(ws.readyState===1)ws.send(JSON.stringify(o));};

function elect(code){
  const r=rooms.get(code);if(!r)return;
  const now=Date.now(),alive=[...r.members.values()].filter(m=>m.canLead&&m.ws.readyState===1&&now-m.ws.lastSeen<STALE_MS);
  const ok=id=>alive.some(m=>m.id===id);
  let next=r.leader;
  if(!ok(next)){ next=ok(r.creator)?r.creator:(alive.sort((a,b)=>a.joined-b.joined)[0]||{}).id||null; }
  if(next!==r.leader||r.announce){r.leader=next;r.announce=false;for(const m of r.members.values())send(m.ws,{t:'leader',room:code,id:next});}
}

/* Invite link page: https://<server>/j/<game>/<CODE>. WhatsApp shows it as a normal link.
   Tapping "Open in Game Hub" opens the app straight into the room. Without the app, it explains what to do. */
const GAMES={ludo:'Ludo',snakes:'Snakes & Ladders',ttt:'Tic Tac Toe',bingo:'Bingo'};
function joinPage(game,code,noapp){
  const g=GAMES[game];
  const intent=`intent://join/${game}/${code}#Intent;scheme=gamehub;package=com.manoj.gamehub;S.browser_fallback_url=${encodeURIComponent(`/j/${game}/${code}?noapp=1`)};end`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Join ${g} · Game Hub</title>
<meta property="og:title" content="Join my ${g} game on Game Hub">
<meta property="og:description" content="Room code ${code}. Tap to open the room in the Game Hub app.">
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#12142b;color:#eef0ff;font:16px system-ui,sans-serif;padding:20px;box-sizing:border-box}
.c{max-width:360px;width:100%;background:#1f2350;border:1px solid #2f3570;border-radius:22px;padding:24px;text-align:center;display:flex;flex-direction:column;gap:14px}
h1{margin:0;font-size:26px}p{margin:0;color:#9aa0c8;line-height:1.45}.code{font:800 34px monospace;letter-spacing:6px;color:#f5b52a}
a.b{display:block;padding:15px;border-radius:14px;background:#1fb07c;color:#fff;font-weight:700;text-decoration:none;font-size:18px}
.warn{background:#3a2a10;color:#ffd166;border-radius:12px;padding:10px}</style></head><body><div class="c">
<h1>Join ${g}</h1><p>Your friend invited you to a game on Game Hub.</p><div class="code">${code}</div>
${noapp?'<p class="warn">Game Hub is not installed on this phone. Ask your friend to send you the Game Hub app, install it, then tap this link again.</p>':''}
<a class="b" href="${intent}">Open in Game Hub</a>
<p>Or open Game Hub, go to ${g}, and type the room code.</p></div></body></html>`;
}
const server=http.createServer((req,res)=>{
  const url=req.url.split('?')[0];
  if(url==='/health'||url==='/'){res.writeHead(200,{'content-type':'text/plain','access-control-allow-origin':'*'});res.end('Game Hub room server is running. Rooms: '+rooms.size);return;}
  const j=url.match(/^\/j\/([a-z]+)\/([A-Za-z0-9]{6})\/?$/);
  if(j&&GAMES[j[1]]){res.writeHead(200,{'content-type':'text/html; charset=utf-8'});res.end(joinPage(j[1],j[2].toUpperCase(),/noapp=1/.test(req.url)));return;}
  res.writeHead(404,{'content-type':'text/plain'});res.end('Not found');
});
const wss=new WebSocketServer({server,path:'/ws',maxPayload:MAX_MSG});

wss.on('connection',ws=>{
  ws.lastSeen=Date.now();ws.topics=new Set();ws.memberOf=new Map(); // code -> id
  ws.on('message',data=>{
    ws.lastSeen=Date.now();
    let m;try{m=JSON.parse(data.toString());}catch(e){return;}
    if(m.t==='sub'){const code=roomOf(m.topic);if(!code)return;const r=room(code);if(!r)return;
      if(!r.subs.has(m.topic))r.subs.set(m.topic,new Set());r.subs.get(m.topic).add(ws);ws.topics.add(m.topic);
      const p=r.retained.get(m.topic);if(p!==undefined)send(ws,{t:'msg',topic:m.topic,p});}
    else if(m.t==='pub'){const code=roomOf(m.topic);if(!code||typeof m.p!=='string')return;const r=room(code);if(!r)return;
      // only the room leader may publish the game state; anyone else is told who the leader is
      if(m.topic.endsWith('/s')&&r.leader&&ws.memberOf.get(code)!==r.leader){send(ws,{t:'leader',room:code,id:r.leader});return;}
      if(m.r)r.retained.set(m.topic,m.p);
      const set=r.subs.get(m.topic);if(set)for(const w of set)send(w,{t:'msg',topic:m.topic,p:m.p});}
    else if(m.t==='room'){const code=/^[A-Z0-9]{6}$/.test(m.room)?m.room:null;if(!code||typeof m.id!=='string')return;const r=room(code);if(!r)return;
      const old=r.members.get(m.id);
      if(old&&old.ws!==ws&&old.ws.readyState===1){try{old.ws.memberOf.delete(code);}catch(e){}}
      r.members.set(m.id,{id:m.id,ws,canLead:!!m.canLead,joined:old?old.joined:Date.now()});ws.memberOf.set(code,m.id);
      if(m.creator&&!r.creator)r.creator=m.id;
      r.announce=true;elect(code);}
  });
  ws.on('close',()=>{
    for(const t of ws.topics){const code=roomOf(t),r=code&&rooms.get(code);if(r&&r.subs.get(t))r.subs.get(t).delete(ws);}
    for(const [code,id] of ws.memberOf){const r=rooms.get(code);if(r){const mm=r.members.get(id);if(mm&&mm.ws===ws)r.members.delete(id);r.touched=Date.now();elect(code);}}
  });
});

setInterval(()=>{const now=Date.now();
  for(const [code,r] of rooms){ if(r.members.size)elect(code); else if(now-r.touched>ROOM_TTL_MS)rooms.delete(code); }
  for(const ws of wss.clients){ if(now-ws.lastSeen>60000)ws.terminate(); else if(ws.readyState===1)ws.ping(); }
},3000);

server.listen(PORT,()=>console.log('Game Hub room server on port '+PORT));
