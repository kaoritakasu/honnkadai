import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage();

await page.goto('http://localhost:4200', { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);

await page.screenshot({ path: '/tmp/claude-1000/-home-kaoritakasu-development-honnkadai1/c5a5e71b-7b33-4855-99ca-6244693d751c/scratchpad/app-screenshot.png', fullPage: true });

console.log('Screenshot saved');

await browser.close();
