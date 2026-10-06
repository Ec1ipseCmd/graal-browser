import {test,expect} from '@playwright/test';
const login={username:'browser-test@example.invalid',password:'Dummy-only-秘密-471',nickname:'Browser test'};
async function prepare(page) {
 await page.route('**/client/',route=>route.fulfill({contentType:'text/html',body:'<p>Storage test</p>'}));
 await page.goto('/');
 await page.addScriptTag({url:'/browser-login.js'});
}
async function record(page) {
 return page.evaluate(()=>new Promise((resolve,reject)=>{
  const r=indexedDB.open('graal-browser-login-v1');r.onerror=()=>reject(r.error);
  r.onsuccess=()=>{const db=r.result,tx=db.transaction('login'),q=tx.objectStore('login').get('current');
   tx.oncomplete=()=>{const v=q.result;db.close();resolve(v?{extractable:v.key.extractable,algorithm:v.key.algorithm,iv:Array.from(v.iv),data:Array.from(new Uint8Array(v.data)),fields:Object.keys(v)}:null);};};
 }));
}
test('encrypted login survives reload, stays browser-isolated, and never uploads',async({page,browser})=>{
 const outbound=[];
 page.on('request',r=>{if(r.postData()?.includes(login.password))outbound.push(r.url());});
 await prepare(page);
 await page.evaluate(value=>graalBrowserLogin.save(value),login);
 const first=await record(page);
 expect(first.extractable).toBe(false);expect(first.algorithm).toEqual({name:'AES-GCM',length:256});
 expect(first.fields.sort()).toEqual(['data','iv','key','version']);
 expect(Buffer.from(first.data).toString()).not.toContain(login.password);
 await page.reload();await page.addScriptTag({url:'/browser-login.js'});
 expect(await page.evaluate(()=>graalBrowserLogin.load())).toEqual(login);
 const secondContext=await browser.newContext();
 try {const other=await secondContext.newPage();await prepare(other);expect(await other.evaluate(()=>graalBrowserLogin.load())).toBe(null);}finally{await secondContext.close();}
 await page.evaluate(value=>graalBrowserLogin.save(value),login);
 expect((await record(page)).iv).not.toEqual(first.iv);
 expect(outbound).toEqual([]);
 await page.evaluate(()=>graalBrowserLogin.forget());expect(await record(page)).toBe(null);
 expect(await page.evaluate(()=>graalBrowserLogin.load())).toBe(null);
});
test('tampered ciphertext fails authentication without returning a password',async({page})=>{
 await prepare(page);await page.evaluate(value=>graalBrowserLogin.save(value),login);
 await page.evaluate(()=>new Promise((resolve,reject)=>{
  const r=indexedDB.open('graal-browser-login-v1');r.onsuccess=()=>{const db=r.result,tx=db.transaction('login','readwrite'),s=tx.objectStore('login'),q=s.get('current');
   q.onsuccess=()=>{const v=q.result;new Uint8Array(v.data)[0]^=1;s.put(v,'current');};
   tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};
 }));
 expect(await page.evaluate(()=>graalBrowserLogin.load().then(()=>false,()=>true))).toBe(true);
});
