import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

test('filesystem startup reads and competing saves run sequentially, recovering after errors',async()=>{
 const window={addEventListener(){}};
 const context={window,document:{addEventListener(){}},parent:{postMessage(){}},location:{origin:'http://localhost'},setInterval(){},queueMicrotask};
 vm.runInNewContext(await readFile(new URL('../public/client-bridge.js',import.meta.url),'utf8'),context);
 const pending=[];const calls=[];const results=[];
 const FS={syncfs(populate,callback){calls.push(populate);pending.push(callback);}};
 window.kingdomsAttachFS(FS);
 FS.syncfs(true,error=>results.push(error));FS.syncfs(false,error=>results.push(error));FS.syncfs(error=>results.push(error));
 assert.deepEqual(calls,[true]);
 pending.shift()(null);await Promise.resolve();assert.deepEqual(calls,[true,false]);
 const failure=new Error('storage unavailable');pending.shift()(failure);await Promise.resolve();
 assert.deepEqual(calls,[true,false,false]);pending.shift()(null);
 assert.deepEqual(results,[null,failure,null]);
});
