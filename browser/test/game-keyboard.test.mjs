import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../public/game-keyboard.js',import.meta.url),'utf8');
function fixture() {
 const calls=[],listeners={},controls=new Map([['StartOptionsButton',3],['Serverlist_Taskbar_Menu',7],['Serverlist_TaskButton_Main',8]]);
 const window={addEventListener:(type,fn)=>listeners[type]=fn,unityInstance:{Module:{}},kingdomsAutoJoin:{driver:()=>({controls:()=>controls,action:o=>calls.push(o),playerList:o=>calls.push(o)})}};
 const document={getElementById:()=>({style:{display:'none'}}),addEventListener(){}};
 vm.runInNewContext(source,{window,document,console,Set});
 const event=(key,extra={})=>({key,type:'keydown',target:{tagName:'CANVAS'},preventDefault(){this.prevented=true;},stopImmediatePropagation(){this.stopped=true;},...extra});
 return {window,document,controls,calls,listeners,event,handle:window.kingdomsKeyboard.handle};
}
test('F3/F7/F8 invoke native window actions once and consume both key edges',()=>{
 const f=fixture();
 for(const key of ['F3','F7','F8']) {
  const down=f.event(key);assert.equal(f.handle(down),true);assert.ok(down.prevented&&down.stopped);
  f.handle(f.event(key,{repeat:true}));f.handle(f.event(key));
  const up=f.event(key,{type:'keyup'});assert.equal(f.handle(up),true);assert.ok(up.prevented&&up.stopped);
 }
 assert.deepEqual(f.calls,[3,7,8]);
 f.handle(f.event('F3'));assert.deepEqual(f.calls,[3,7,8,3]);
});
test('shortcuts ignore editable HTML fields, modified keys, and unrelated keys',()=>{
 const f=fixture();
 for(const extra of [{target:{tagName:'INPUT'}},{target:{tagName:'TEXTAREA'}},{target:{isContentEditable:true}},...['ctrlKey','altKey','metaKey','shiftKey'].map(k=>({[k]:true}))]) assert.equal(f.handle(f.event('F3',extra)),false);
 assert.equal(f.handle(f.event('F9')),false);assert.deepEqual(f.calls,[]);
});
test('loading, unsupported builds and missing controls do not dispatch native calls',()=>{
 const f=fixture();f.document.getElementById=()=>({style:{display:''}});
 assert.equal(f.handle(f.event('F3')),false);
 f.document.getElementById=()=>({style:{display:'none'}});f.controls.clear();assert.equal(f.handle(f.event('F3')),false);
 f.window.kingdomsAutoJoin.driver=()=>null;assert.equal(f.handle(f.event('F7')),false);
 assert.deepEqual(f.calls,[]);
});
test('blur clears held keys so returning to the game does not lose shortcuts',()=>{
 const f=fixture();f.handle(f.event('F7'));f.listeners.blur();f.handle(f.event('F7'));assert.deepEqual(f.calls,[7,7]);
});
