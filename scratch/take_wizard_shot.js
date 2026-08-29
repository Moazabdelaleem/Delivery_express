const playwright = require('playwright');
const path = require('path');

(async () => {
  console.log('📸 Capturing screenshot of 3-Step Order Dispatch Wizard...');
  const browser = await playwright.chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 414, height: 896 } });

  await page.goto('http://localhost:8081', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  // Take initial screen shot
  const outPath1 = path.join(__dirname, 'wizard_step1.png');
  await page.screenshot({ path: outPath1 });
  console.log('Saved screenshot to:', outPath1);

  await browser.close();
  process.exit(0);
})().catch(err => {
  console.log('Screenshot note:', err.message);
  process.exit(0);
});
