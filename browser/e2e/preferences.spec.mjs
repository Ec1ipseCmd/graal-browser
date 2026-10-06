import {test,expect} from '@playwright/test';
import {PNG} from 'pngjs';

test('blue Options primary keys and volume survive reload and fresh IndexedDB',async({page,browser,baseURL})=>{
  test.skip(!process.env.LIVE_GRAAL,'Requires the live Graal connection service.');
  test.setTimeout(180000);
  await page.setViewportSize({width:1280,height:800});
  const waitLogin=async p=>{
    await expect.poll(async()=>{
      const png=PNG.sync.read(await p.screenshot());
      return [[370,200],[890,600],[890,200],[370,620]].every(([x,y])=>{
        const [r,g,b]=png.data.subarray((y*png.width+x)*4,(y*png.width+x)*4+3);
        return r>=100&&r<=130&&g>=140&&g<=175&&b>=215;
      });
    },{timeout:70000,intervals:[1000]}).toBe(true);
    await p.waitForTimeout(1500);
  };
  const click=async(p,x,y)=>{await p.mouse.click(x,y,{delay:180});await p.waitForTimeout(300);};
  const keysImage=async p=>{
    await click(p,565,222);await click(p,660,222);await p.mouse.move(100,100);
    return PNG.sync.read(await p.screenshot({clip:{x:550,y:263,width:90,height:180}})).data;
  };
  const volume=p=>p.evaluate(()=>{
    const fs=unityInstance.Module.kingdomsFS;
    const root='/idbfs/'+fs.readdir('/idbfs').find(name=>!name.startsWith('.'));
    return Number(fs.readFile(root+'/game_config.txt',{encoding:'utf8'}).match(/^sfxvolume=(\d+)/m)[1]);
  });
  await page.goto('/client/');await waitLogin(page);
  await click(page,750,606);await click(page,660,222);
  for(const [y,key]of [[275,'w'],[378,'r'],[404,'f'],[430,'e']]){
    await click(page,562,y);await page.keyboard.press(key,{delay:200});
  }
  await expect.poll(()=>page.evaluate(()=>localStorage.getItem('kingdoms.primaryKeys.v1'))).toBe('[87,37,40,39,82,70,69,77,9,81,80]');
  const expectedKeys=await keysImage(page);
  await click(page,565,222);
  await page.mouse.move(723,450);await page.mouse.down();await page.waitForTimeout(150);
  await page.mouse.move(604,450,{steps:10});await page.waitForTimeout(150);await page.mouse.up();
  await click(page,824,591);
  const expectedVolume=await volume(page);expect(expectedVolume).toBeGreaterThan(0);expect(expectedVolume).toBeLessThan(50);
  // Deliberately bypass the launcher's flush: this exercises normal browser reload.
  await page.reload();await waitLogin(page);await click(page,750,606);
  expect((await keysImage(page)).equals(expectedKeys)).toBe(true);
  expect(await volume(page)).toBe(expectedVolume);
  // storageState excludes IndexedDB by default, proving the preference backup
  // works even when the official cached filesystem is recreated.
  const fresh=await browser.newContext({viewport:{width:1280,height:800},storageState:await page.context().storageState()});
  await page.close();
  try{
    const cold=await fresh.newPage();await cold.goto(new URL('/client/',baseURL).href);await waitLogin(cold);await click(cold,750,606);
    expect((await keysImage(cold)).equals(expectedKeys)).toBe(true);
    expect(await volume(cold)).toBe(expectedVolume);
  }finally{await fresh.close();}
});
