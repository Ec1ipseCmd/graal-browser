import {test,expect} from '@playwright/test';
import {PNG} from 'pngjs';

test('native Save password restores the exact login field and respects opting out',async({page:p})=>{
 test.skip(!process.env.LIVE_GRAAL,'Requires the live Graal login screen.');
 test.setTimeout(180000);
 await p.setViewportSize({width:1280,height:800});
 const waitLogin=()=>expect.poll(async()=>{const png=PNG.sync.read(await p.screenshot());return [[370,200],[890,600],[890,200],[370,620]].every(([x,y])=>{const [r,g,b]=png.data.subarray((y*png.width+x)*4,(y*png.width+x)*4+3);return r>=100&&r<=130&&g>=140&&g<=175&&b>=215;});},{timeout:70000,intervals:[1000]}).toBe(true);
 await p.goto('/client/');await waitLogin();
 try {
 await p.waitForTimeout(1800);
 const type=async(x,y,text)=>{await p.mouse.click(x,y,{delay:80});await p.keyboard.press('Control+a',{delay:50});await p.waitForTimeout(100);for(const ch of text){await p.keyboard.press(ch,{delay:50});await p.waitForTimeout(50);}await p.waitForTimeout(150);};
 const submit=async()=>{await p.evaluate(()=>{WebSocket.prototype.send=function(){};});await p.mouse.click(638,524,{delay:120});await p.waitForTimeout(300);await p.evaluate(()=>kingdomsNativeLogin.flush());};
 await p.mouse.click(455,458,{delay:100});
 await type(690,353,'BrowserCheck');await type(740,413,'dummy@example.invalid');await type(740,438,'DummyOnly471');
 await submit();
 const read=()=>p.evaluate(()=>graalBrowserLogin.load());
 const first=await read();expect(first?.password).toBe('DummyOnly471');expect(first?.username).toBe('dummy@example.invalid');
 await p.evaluate(()=>kingdomsFlush());
 const duplicatePassword=await p.evaluate(()=>{
  const fs=unityInstance.Module.kingdomsFS;
  for(const name of fs.readdir('/idbfs')) {
   if(name==='.'||name==='..')continue;
   try {if(/^\s*(?:password(?:_new)?|.+:pass_new)\s*=/mi.test(fs.readFile('/idbfs/'+name+'/game_config.txt',{encoding:'utf8'})))return true;}catch{}
  }
  return false;
 });
 expect(duplicatePassword).toBe(false);
 await p.reload();await waitLogin();await p.waitForTimeout(1800);
 
 await p.evaluate(()=>{const original=kingdomsNativeLogin.before;window.submittedPassword=null;kingdomsNativeLogin.before=(m,i,a,b)=>{if(i===61877){const ptr=m.HEAPU32[a/4];submittedPassword=new TextDecoder().decode(m.HEAPU8.subarray(ptr+8,ptr+8+m.HEAPU32[ptr/4]));}return original(m,i,a,b);};});
 await submit();expect(await p.evaluate(()=>submittedPassword)).toBe('DummyOnly471');
 await p.reload();await waitLogin();await p.waitForTimeout(1000);await p.mouse.click(690,463,{delay:120});await submit();expect(await read()).toBe(null);
 }finally{await p.evaluate(()=>graalBrowserLogin.forget()).catch(()=>{});}
});
