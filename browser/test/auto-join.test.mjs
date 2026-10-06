import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../public/auto-join.js',import.meta.url),'utf8');
function fixture(){const window={addEventListener(){}},parent={postMessage(){}},intervals=[];vm.runInNewContext(source,{window,parent,location:{origin:'http://localhost'},localStorage:{getItem:()=>null},document:{},TextEncoder,TextDecoder,Date,Map,Set,setInterval:fn=>intervals.push(fn),clearInterval(){}});assert.equal(intervals.length,0);return window.kingdomsAutoJoin;}
test('auto join submits once with this browser login and selects Kingdoms once',()=>{
 const {controller}=fixture(),calls=[];let controls=new Map([['StartConnectButton',12]]);
 const native={controls:()=>controls,action:obj=>calls.push(['start',obj]),join:obj=>calls.push(['join',obj])};
 const run=controller({getDriver:()=>native,hasLogin:()=>true,report(){}});
 run.tick();run.tick();assert.deepEqual(calls,[['start',12]]);
 controls.set('Serverlist_ServerDirectConnect',34);assert.equal(run.tick(),true);run.tick();
 assert.deepEqual(calls,[['start',12],['join',34]]);
});
test('no saved password means no automatic Start; manual sign-in can still auto join',()=>{
 const {controller}=fixture(),calls=[];let controls=new Map([['StartConnectButton',12]]);
 const run=controller({getDriver:()=>({controls:()=>controls,action:()=>calls.push('start'),join:()=>calls.push('join')}),hasLogin:()=>false,report(){}});
 run.tick();run.tick();assert.deepEqual(calls,[]);
 controls.set('Serverlist_ServerDirectConnect',34);run.tick();assert.deepEqual(calls,['join']);
});
test('cancel, timeout, unsupported builds, and native failures never retry',()=>{
 const {controller,driver}=fixture();assert.equal(driver({kingdomsKeyLayout:'new-build'}),null);
 let time=0,calls=0;const options={getDriver:()=>{calls++;throw new Error('changed layout');},hasLogin:()=>true,report(){},clock:()=>time};
 let run=controller(options);run.stop();run.tick();assert.equal(calls,0);
 run=controller(options);time=120001;assert.equal(run.tick(),true);assert.equal(calls,0);
 run=controller(options);assert.equal(run.tick(),true);run.tick();assert.equal(calls,1);
});

test('player list toggle reads native visibility and closes an already open window',()=>{
 const {driver}=fixture(),buffer=new ArrayBuffer(4096),calls=[];
 const m={kingdomsKeyLayout:'worlds-701500-55e809df',HEAPU8:new Uint8Array(buffer),HEAPU32:new Uint32Array(buffer),
  asm:{malloc:()=>1024,free(){}},dynCall_iii(){},dynCall_vi(){},dynCall_viiii:(...args)=>calls.push(['open',...args]),
  dynCall_vii:(...args)=>{calls.push(['hide',...args]);m.HEAPU8[256+197]=0;}};
 const native=driver(m);
 // Includes a window opened by the menu, without a previous F7 press.
 m.HEAPU8[256+197]=1;native.playerList(128,256);
 assert.deepEqual(calls,[['hide',61378,256,0]]);
 native.playerList(128,256);assert.equal(calls[1][0],'open');
 // A new native window/state is used, never a remembered JS toggle flag.
 m.HEAPU8[512+197]=1;native.playerList(128,512);
 assert.deepEqual(calls[2],['hide',61378,512,0]);
 m.HEAPU8[512+197]=3;assert.throws(()=>native.playerList(128,512),/visibility/);
});
