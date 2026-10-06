import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../public/native-login.js',import.meta.url),'utf8');
async function fixture(credentials,failed=false,failForget=false){
  const requests=[],messages=[],window={graalBrowserLogin:{
    load:async()=>{if(failed)throw new Error('storage blocked');return credentials;},
    save:async value=>requests.push({method:'save',value}),forget:async()=>{requests.push({method:'forget'});if(failForget)throw new Error('storage blocked');}}};
  vm.runInNewContext(source,{window,location:{origin:'http://localhost:4173'},parent:{postMessage(message){messages.push(message);}},TextEncoder,TextDecoder,setTimeout,clearTimeout,
    fetch:()=>{throw new Error('Login bridge must never make network requests');}});
  await window.kingdomsNativeLogin.ready;
  const bytes=new Uint8Array(13000000),words=new Uint32Array(bytes.buffer);let next=1024;
  const malloc=size=>{const p=next;next+=Math.ceil(size/4)*4;return p;};
  const string=text=>{const object=malloc(4);assign(object,text);return object;};
  const assign=(object,text)=>{const value=new TextEncoder().encode(text),p=malloc(value.length+9);words[object/4]=p;words[p/4]=value.length;bytes.set(value,p+8);};
  const read=object=>{const p=words[object/4];return p?new TextDecoder().decode(bytes.subarray(p+8,p+8+words[p/4])):'';};
  const module={kingdomsKeyLayout:'worlds-701500-55e809df',HEAPU8:bytes,HEAPU32:words,asm:{malloc,free(){}},dynCall_vi(index){assert.equal(index,61877);assert.equal(bytes[12848692],1);},dynCall_iii(index,object,raw){assert.equal(index,13612);let end=raw;while(bytes[end])end++;assign(object,new TextDecoder().decode(bytes.subarray(raw,end)));}};
  return {api:window.kingdomsNativeLogin,module,requests,messages,string,read};
}
test('native reads restore only matching login passwords, including per-account lookup',async()=>{
  const {api,module,requests,string,read}=await fixture({username:'dummy',password:'secret-秘密',nickname:'Nickname'});
  const out=string('');
  assert.equal(api.before(module,23988,out,string('accountname_new')),true);assert.equal(read(out),'dummy');
  assert.equal(api.before(module,23988,out,string('password_new')),false);
  assert.equal(api.before(module,61253,out,string('native ciphertext')),true);assert.equal(read(out),'secret-秘密');
  api.before(module,23988,out,string('someone-else:pass_new'));
  assert.equal(api.before(module,61253,out,string('native ciphertext')),true);assert.equal(read(out),'');
  api.before(module,23988,out,string('dummy:pass_new'));
  assert.equal(api.before(module,61253,out,string('native ciphertext')),true);
  module.HEAPU8[12848692]=1;api.before(module,23988,out,string('dummy:pass_new'));
  assert.equal(api.before(module,61253,out,string('native ciphertext')),true);assert.equal(read(out),'');
  assert.equal(requests.length,0);
});
test('native login commit saves the password and unchecked remember deletes it',async()=>{
  const {api,module,requests,string}=await fixture(null);
  api.before(module,23997,string('nickname_new'),string('Nickname'));
  api.before(module,23997,string('accountname_new'),string('dummy'));
  assert.equal(api.before(module,61877,string('secret-秘密'),0),true);await api.flush();
  assert.equal(module.HEAPU8[12848692],0);
  assert.deepEqual({...requests.at(-1).value},{username:'dummy',password:'secret-秘密',nickname:'Nickname'});
  module.HEAPU8[12848692]=1;api.before(module,61877,string('secret-秘密'),0);await api.flush();
  assert.equal(requests.at(-1).method,'forget');assert.equal(module.HEAPU8[12848692],1);
});
test('unknown builds and unavailable browser storage never intercept native password loading',async()=>{
  const {api,module,string}=await fixture(null,true);
  assert.equal(api.before(module,23988,string(''),string('password_new')),false);
  assert.equal(api.before(module,61253,string(''),string('ciphertext')),true);
  module.kingdomsKeyLayout='unknown';assert.equal(api.before(module,61877,string('secret'),0),false);
  await api.flush();
});

test('failed forget stays failed and reports that the encrypted browser record may remain',async()=>{
  const {api,module,messages,string}=await fixture({username:'dummy',password:'secret',nickname:'Nickname'},false,true);
  module.HEAPU8[12848692]=1;
  api.before(module,61877,string(''),0);
  await assert.rejects(api.flush(),/storage blocked/);
  await new Promise(resolve=>setImmediate(resolve));
  assert.match(messages.at(-1).loginStorageError,/could not be deleted and may still be stored/);
});
