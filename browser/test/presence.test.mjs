import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createPresence} from '../presence.mjs';
import {createApp} from '../server.mjs';

test('presence deduplicates browser cookies, expires visitors and bounds memory',()=>{
 let now=0;const presence=createPresence({clock:()=>now,ttl:120000,limit:2}),origin='https://graal.example';
 function call({method='POST',cookie,requestOrigin=origin}={}) {
  let result;const headers={};
  presence({method,headers:{origin:requestOrigin,cookie}}, {setHeader:(k,v)=>headers[k]=v},(status,body)=>result={status,...JSON.parse(body),headers},origin);
  return result;
 }
 const first=call(),cookie=first.headers['Set-Cookie'].split(';')[0];
 assert.equal(first.browsers,1);assert.match(first.headers['Set-Cookie'],/HttpOnly; SameSite=Strict; Secure/);
 assert.equal(call({cookie}).browsers,1); // another tab, same browser
 assert.equal(call().browsers,2);assert.equal(call().status,429);
 assert.equal(call({requestOrigin:'https://other.example'}).status,403);
 now=90000;assert.equal(call({cookie}).browsers,2);
 now=120000;assert.equal(call({method:'GET'}).browsers,1);
 now=210000;assert.equal(call({method:'GET'}).browsers,0);
 assert.equal(call({cookie}).browsers,1); // reconnect
 assert.equal(call({method:'DELETE'}).status,405);
});

test('presence API reports only aggregate counts and rejects foreign-origin heartbeats',async t=>{
 const app=createApp().listen(0,'127.0.0.1');await once(app,'listening');
 t.after(()=>new Promise(resolve=>{app.closeAllConnections();app.close(resolve);}));
 const origin=`http://127.0.0.1:${app.address().port}`,url=origin+'/api/presence';
 assert.deepEqual(await (await fetch(url)).json(),{browsers:0});
 const first=await fetch(url,{method:'POST',headers:{Origin:origin}});
 assert.equal(first.headers.get('cache-control'),'no-store');
 const cookie=first.headers.get('set-cookie').split(';')[0];
 assert.deepEqual(await first.json(),{browsers:1});
 assert.deepEqual(await (await fetch(url,{method:'POST',headers:{Origin:origin,Cookie:cookie}})).json(),{browsers:1});
 assert.equal((await fetch(url,{method:'POST',headers:{Origin:'https://other.example'}})).status,403);
 assert.equal((await fetch(url,{method:'POST'})).status,403);
 assert.equal((await fetch(origin+'/presence.mjs')).status,200);
});
