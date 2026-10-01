const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'C:/VSCode-Codex-2/data/tmp/jormall-browser-check/node_modules/playwright-core');
const { mount } = require('./weekly-schedule-smoke.cjs');
const base = process.env.SETUP_TEST_URL || 'http://localhost:19881';
const definition = section => ({ version: 1, template: 'custom', section, description: 'Keep imported description', audience: 'all', bodyArea: null, medicalScope: 'medical', unsupportedCapabilities: [], intakeFields: [] });
(async () => {
  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  try {
    for (const [width, lang] of [[1440, 'en'], [390, 'ar']]) {
      const fixture = await mount(browser, width, lang, true), { page } = fixture;
      fixture.current().draft.services = [1, 2, 3].map(n => ({ key: `service_${n}`, name: `Treatment ${n}`, nameLang: 'en', branchKey: 'branch_1', branchScope: 'branch', durationMinutes: 30, price: '25', currency: 'JOD', category: 'Old duplicate category', definition: definition(n < 3 ? 'Skin treatments' : 'Laser'), requiresRoom: false, followUpEnabled: false }));
      try {
        await page.goto(base + '/clinic-setup'); await page.getByTestId('concierge-journey-services').click(); await page.getByTestId('service-name-service_1').waitFor();
        const tree = page.locator('.jc-service-tree'), groups = tree.locator('.jc-service-group');
        assert.equal(await groups.count(), 2);
        assert.deepEqual(await tree.locator('.jc-service-main-index').allTextContents(), ['1', '2']);
        assert.deepEqual(await tree.locator('.jc-service-index').allTextContents(), ['1.1', '1.2', '2.1']);
        assert.equal(await groups.first().locator('.jc-service-batch-row').count(), 2);
        assert.equal(await groups.last().locator('.jc-service-batch-row').count(), 1);
        assert.equal(await tree.locator('[data-testid^="service-parent-"]').count(), 0);
        assert.equal(await tree.locator('[data-testid^="service-category-"][role=combobox]').count(), 2, 'One main-service field per group');
        assert.equal(await page.getByTestId('service-category-service_1').inputValue(), 'Skin treatments');
        assert.equal(await tree.locator('[data-testid=concierge-service-pages]').count(), 0, 'All groups must share one table');
        const connector = await groups.first().locator('.jc-service-tree-children').evaluate(node => ({ line: getComputedStyle(node, '::before').width, connector: getComputedStyle(node.querySelector('.jc-service-batch-row'), '::before').height }));
        assert.equal(connector.line, '2px'); assert.equal(connector.connector, '2px');
        const viewport = await page.locator('.jc-controls').evaluate(node => ({ left: node.getBoundingClientRect().left, right: node.getBoundingClientRect().right, width: node.getBoundingClientRect().width }));
        assert.ok(viewport.left >= -1 && viewport.right <= width + 1);
        if (width > 1000) assert.ok(viewport.width > 1100, 'Desktop services should use the available width');
        assert.ok(await page.getByTestId('concierge-service-batch-save').isVisible());
        await page.getByTestId('service-name-service_2').fill('Updated treatment'); await page.getByTestId('service-price-service_2').fill('40');
        await page.getByTestId('service-category-service_1').fill('Skin care'); await page.getByTestId('service-category-service_1').press('Enter');
        assert.equal(await page.getByTestId('service-name-service_2').inputValue(), 'Updated treatment');
        await page.getByTestId('service-sub-add-service_1').click();
        assert.equal(await groups.first().locator('.jc-service-batch-row').count(), 3);
        const added = groups.first().locator('.jc-service-batch-row').last();
        const key = (await added.getAttribute('data-testid')).replace('concierge-service-', '');
        await page.getByTestId(`service-name-${key}`).fill('New child'); await page.getByTestId(`service-duration-${key}`).fill('45'); await page.getByTestId(`service-price-${key}`).fill('15'); await page.getByTestId(`service-room-${key}`).selectOption('false'); await page.getByTestId(`service-branch-${key}`).selectOption('branch_1');
        assert.equal(await tree.locator('input[type=time]').count(), 0);
        await page.getByTestId('concierge-journey-staff').click();
        const saved = fixture.current().draft.services;
        assert.equal(saved.length, 4); assert.deepEqual(saved.filter(s => s.key !== 'service_3').map(s => [s.category, s.definition.section]), [['Skin care', 'Skin care'], ['Skin care', 'Skin care'], ['Skin care', 'Skin care']]);
        assert.equal(saved.find(s => s.key === 'service_2').price, '40'); assert.equal(saved[0].definition.description, 'Keep imported description');
        await page.getByTestId('concierge-journey-services').click(); await page.getByTestId(`service-name-${key}`).waitFor(); assert.equal(await page.getByTestId(`service-name-${key}`).inputValue(), 'New child');
        await page.locator('.jc-service-batch-rows').evaluate(node => node.scrollTop = 0);
        await page.screenshot({ path: `C:/VSCode-Codex-2/data/tmp/service-tree-${width}.png` });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        assert.deepEqual(fixture.errors, []);
        console.log(`PASS grouped service table, connector lines, numbering, shared main-service editing, adding children and draft persistence (${width}, ${lang})`);
      } catch (error) {
        await page.screenshot({ path: 'C:/VSCode-Codex-2/data/tmp/service-tree-failure.png' }); console.error(fixture.errors, await page.locator('.jc-dialog').innerText()); throw error;
      } finally { await fixture.context.close(); }
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
