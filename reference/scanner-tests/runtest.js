const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const browser = await chromium.launch({ args: ['--allow-file-access-from-files'] });
  const page = await browser.newPage();
  page.on('console', m => console.log('console:', m.text()));
  await page.goto('file://' + path.resolve(__dirname, 'test.html'));
  await page.evaluate(() => setup());
  const configs = JSON.parse(process.argv[2] || '[{}]');
  for (const c of configs) {
    const reps = c.reps || 3; const agg = { n: 0, ok: 0, wrongAns: 0, extra: 0, missed: [], ms: 0 };
    for (let i = 0; i < reps; i++) {
      const r = await page.evaluate(o => run(o), c);
      agg.n += r.n; agg.ok += r.ok; agg.wrongAns += r.wrongAns; agg.unsure = (agg.unsure||0) + r.unsure; agg.extra += r.extra; agg.missed.push(...r.missed); agg.ms += r.ms;
    }
    agg.ms = Math.round(agg.ms / reps);
    console.log(JSON.stringify(c), '=>', JSON.stringify(agg));
  }
  await browser.close();
})();
