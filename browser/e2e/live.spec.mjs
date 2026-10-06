import { test, expect } from '@playwright/test';
import { PNG } from 'pngjs';
import { mkdir } from 'node:fs/promises';

test('official Unity client renders login and accepts account/password keyboard input', async ({ page }) => {
  test.skip(!process.env.LIVE_GRAAL, 'Opt-in live check downloads the official Unity build.');
  await mkdir('artifacts', { recursive: true });
  await page.goto('/');
  await page.screenshot({ path: 'artifacts/launcher.png' });
  await page.getByRole('button', { name: 'Launch Graal' }).click();
  const game = page.frameLocator('iframe');
  await expect(game.locator('canvas')).toBeVisible({ timeout: 90000 });

  // Unity draws its controls into WebGL, not DOM inputs. Wait for the blue login
  // panel to render, then verify actual keyboard edits by comparing its pixels.
  const canvas = game.locator('canvas');
  await expect.poll(async () => {
    const png = PNG.sync.read(await canvas.screenshot());
    // The loading artwork is blue too. Check four separated points on the
    // login window's flat background, relative to the center of the canvas.
    return [[-270, -200], [250, 200], [250, -200], [-270, 220]].every(([dx, dy]) => {
      const x = Math.floor(png.width / 2 + dx), y = Math.floor(png.height / 2 + dy);
      const [r, g, b] = png.data.subarray((y * png.width + x) * 4, (y * png.width + x) * 4 + 3);
      return r >= 100 && r <= 130 && g >= 140 && g <= 175 && b >= 215;
    });
  }, { timeout: 90000, intervals: [2000, 4000] }).toBe(true);
  await page.screenshot({ path: 'artifacts/browser-login.png' });
  const bounds = await canvas.boundingBox();
  const cx = bounds.x + bounds.width / 2;
  const cy = bounds.y + bounds.height / 2;
  const username = { x: cx + 45, y: cy + 1, width: 145, height: 23 };
  const password = { x: cx + 45, y: cy + 26, width: 145, height: 23 };
  const changeCount = (before, after) => {
    const a = PNG.sync.read(before).data, b = PNG.sync.read(after).data;
    let changed = 0;
    for (let i = 0; i < a.length; i += 4) {
      if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 40) changed++;
    }
    return changed;
  };
  // Dummy text only; never submit a login request or store a real credential.
  for (const [clip, text] of [[username, 'BrowserInputCheck'], [password, 'input-test-only']]) {
    await page.mouse.click(clip.x + 20, clip.y + 12);
    const before = await page.screenshot({ clip });
    await page.keyboard.type(text, { delay: 40 });
    await expect.poll(async () => changeCount(before, await page.screenshot({ clip })), { timeout: 10000 }).toBeGreaterThan(25);
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Backspace');
  }
  await page.getByRole('button', { name: 'Close client' }).click();
  await expect(page.locator('iframe')).toHaveCount(0);
});
