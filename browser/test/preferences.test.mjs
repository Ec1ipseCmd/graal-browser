import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const context={};vm.runInNewContext(await readFile(new URL('../public/preferences.js',import.meta.url),'utf8'),context);
const api=context.kingdomsPreferences;
function fixture(offset=0){
 const heap=new Uint32Array(8192);
 const nodes=Array.from({length:11},(_,i)=>512+offset+i*32);
 nodes.forEach((n,i)=>{heap[64+offset+i]=n*4;heap[n+16]=1024;heap[n+18]=i;heap[n+20]=api.DEFAULT_KEYS[i];});
 return {heap,nodes};
}
function storage(){const values=new Map();return {getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value),values};}
test('primary mappings survive a new allocation and only validated key fields are restored',()=>{
 const store=storage();const a=fixture();const module={HEAPU32:a.heap,kingdomsKeyLayout:api.KEY_LAYOUT};
 const capture=api.installPrimaryKeys(module,store,()=>{});assert.equal(typeof capture,'function');
 a.heap[a.nodes[0]+20]=87;a.heap[a.nodes[6]+20]=69;capture();
 const b=fixture(32);const before=new Uint32Array(b.heap);
 api.installPrimaryKeys({HEAPU32:b.heap,kingdomsKeyLayout:api.KEY_LAYOUT},store,()=>{});
 assert.equal(b.heap[b.nodes[0]+20],87);assert.equal(b.heap[b.nodes[6]+20],69);
 for(let i=0;i<b.heap.length;i++)if(![b.nodes[0]+20,b.nodes[6]+20].includes(i))assert.equal(b.heap[i],before[i]);
});
test('unknown builds, corrupted tables, ambiguity, and invalid saved values fail closed',()=>{
 const {heap,nodes}=fixture();const table=api.findPrimaryKeys(heap);assert.ok(table);
 assert.equal(api.installPrimaryKeys({HEAPU32:heap,kingdomsKeyLayout:'unknown'},storage(),()=>{}),null);
 assert.equal(api.applyPrimaryKeys(heap,table,[-1]),false);
 heap[nodes[4]+18]=5;assert.equal(api.applyPrimaryKeys(heap,table,Array.from(api.DEFAULT_KEYS)),false);
 const other=fixture(1000);heap.set(other.heap); // independent two complete tables
 const first=fixture();for(let i=0;i<first.heap.length;i++)if(first.heap[i])heap[i]=first.heap[i];
 assert.equal(api.findPrimaryKeys(heap),null);
});
test('volume backup restores immediately and excludes password fields',()=>{
 const store=storage();let dirty=0;
 function make(text){
  const files=new Map([['/idbfs/test/game_config.txt',text]]);
  const FS={open(path,flags){if(!files.has(path))throw new Error('missing');return {path,flags:typeof flags==='number'?flags:flags==='r'?0:1};},close(){},readFile(path){const stream=this.open(path,'r');const value=files.get(path);this.close(stream);return value;},writeFile(path,value){const stream=this.open(path,'w');files.set(path,value);this.close(stream);}};
  api.installConfig(FS,store,()=>dirty++,()=>{});return FS;
 }
 const path='/idbfs/test/game_config.txt';const fs=make('sfxvolume=100\npassword=do-not-back-up\n');fs.close(fs.open(path,32768));fs.writeFile(path,'sfxvolume=26\npassword=do-not-back-up\n');
 assert.equal(dirty,2);assert.doesNotMatch(fs.readFile(path),/password|do-not-back-up/);assert.doesNotMatch(store.getItem('kingdoms.options.v1'),/password|do-not-back-up/);
 const restored=make('sfxvolume=100\nfont=Arial\n');restored.close(restored.open(path,32768));assert.match(restored.readFile(path),/sfxvolume=26/);assert.match(restored.readFile(path),/font=Arial/);
});
