// Renders public/icons/icon.svg to the PNG sizes Android/iOS want.
// Usage: node scripts/render-icons.mjs   (needs Playwright + Chromium)
import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';

const svg = await readFile(new URL('../public/icons/icon.svg', import.meta.url), 'utf8');
const sizes = { 'icon-192.png': 192, 'icon-512.png': 512, 'apple-touch-icon.png': 180 };

const browser = await chromium.launch();
const page = await browser.newPage();
for (const [name, size] of Object.entries(sizes)) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<style>html,body{margin:0}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`
  );
  await page.screenshot({ path: new URL(`../public/icons/${name}`, import.meta.url).pathname });
  console.log('wrote', name);
}
await browser.close();
