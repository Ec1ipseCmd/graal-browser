import { test, expect } from '@playwright/test';

test('automatic client entry and fullscreen', async ({ page }) => {
  await page.route('**/client/', route => route.fulfill({ contentType: 'text/html', body: '<p>Test frame</p>' }));
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('#welcome, #launch, #end, #fill-window')).toHaveCount(0);
  const githubLink = page.getByRole('link', { name: 'GitHub repository' });
  await expect(githubLink).toHaveAttribute('href', 'https://github.com/Ec1ipseCmd/graal-browser');
  await expect(githubLink).toHaveAttribute('target', '_blank');
  await expect(page.locator('iframe')).toHaveAttribute('src', '/client/');
  await expect(page.locator('#status')).toHaveText('Official client open');
  await page.getByRole('button', { name: 'Full screen' }).click();
  await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(true);
  await page.evaluate(() => document.exitFullscreen());
  expect(errors).toEqual([]);
});

test('mobile launcher fits the viewport', async ({ page }) => {
  await page.route('**/client/', route => route.fulfill({contentType:'text/html',body:'Test client'}));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.locator('iframe')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(844);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test('Graal connection status does not show an intrusive error banner', async ({page}) => {
  await page.route('**/client/', route => route.fulfill({contentType:'text/html',body:'<p>Test client</p>'}));
  await page.goto('/');
  await expect(page.locator('#status')).toHaveText('Official client open');
  const client = page.frames().find(frame => frame.url().endsWith('/client/'));
  await client.evaluate(() => parent.postMessage({source:'kingdoms-client',connection:'error',host:'orproxy.graalonline.com'},location.origin));
  await expect(page.locator('#status')).toHaveText('Graal connection failed');
  await expect(page.getByRole('alert')).toBeHidden();
  await client.evaluate(() => parent.postMessage({source:'kingdoms-client',connection:'open',host:'orproxy.graalonline.com'},location.origin));
  await expect(page.getByRole('alert')).toBeHidden();
});

test('auto join is opt-in, persists in this browser, and can be disabled', async ({page}) => {
  await page.route('**/client/', route => route.fulfill({contentType:'text/html',body:'<p>Test client</p>'}));
  await page.goto('/');
  const checkbox=page.getByRole('checkbox',{name:'Auto join Kingdoms'});
  await expect(checkbox).not.toBeChecked();
  await checkbox.check();
  await page.reload();
  await expect(checkbox).toBeChecked();
  await checkbox.uncheck();
  await page.reload();
  await expect(checkbox).not.toBeChecked();
});

test('header-focused function keys reach the client keyboard handler', async ({page}) => {
  await page.route('**/client/', route => route.fulfill({contentType:'text/html',body:'<p>Test client</p>'}));
  await page.goto('/');
  await expect(page.locator('#status')).toHaveText('Official client open');
  const client=page.frames().find(frame=>frame.url().endsWith('/client/'));
  await client.evaluate(()=>{window.keys=[];window.kingdomsKeyboard={handle:event=>window.keys.push([event.type,event.key])};});
  await page.locator('#reload').focus();
  for(const key of ['F3','F7','F8'])await page.keyboard.press(key);
  expect(await client.evaluate(()=>window.keys)).toEqual(['F3','F7','F8'].flatMap(key=>[['keydown',key],['keyup',key]]));
});

test('live browser counter refreshes and reports failures without breaking the client',async ({page})=>{
 await page.clock.install();
 await page.route('**/client/',route=>route.fulfill({contentType:'text/html',body:'Test client'}));
 let calls=0;
 await page.route('**/api/presence',route=>{calls++;return route.fulfill({status:calls===3?503:200,json:{browsers:calls===1?1:3}});});
 await page.goto('/');
 await expect(page.locator('#presence')).toHaveText('1 browser online');
 await page.clock.fastForward(20000);
 await expect(page.locator('#presence')).toHaveText('3 browsers online');
 await page.clock.fastForward(20000);
 await expect(page.locator('#presence')).toHaveText('Online count unavailable');
 await expect(page.locator('iframe')).toBeVisible();
 await page.clock.fastForward(20000);
 await expect(page.locator('#presence')).toHaveText('3 browsers online');
});
