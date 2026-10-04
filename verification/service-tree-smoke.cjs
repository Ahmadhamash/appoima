const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'C:/VSCode-Codex-2/data/tmp/jormall-browser-check/node_modules/playwright-core');
const { mount } = require('./weekly-schedule-smoke.cjs');
const base = process.env.SETUP_TEST_URL || 'http://localhost:19881';
const definition = section => ({ version: 1, template: 'custom', section, description: 'Keep imported description', audience: 'all', bodyArea: null, medicalScope: 'medical', unsupportedCapabilities: [], intakeFields: [] });
(async () => {
  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  try {
    for (const [width, height, lang] of [[1366, 768, 'ar'], [1920, 900, 'en'], [390, 844, 'ar']]) {
      const fixture = await mount(browser, width, lang, true), { page } = fixture;
      await page.setViewportSize({width,height});
      fixture.current().draft.services = [1, 2, 3, 4, 5].map(n => ({ key: `service_${n}`, name: `Treatment ${n}`, nameLang: 'en', branchKey: 'branch_1', branchScope: 'branch', durationMinutes: 30, price: '25', currency: 'JOD', category: 'Old duplicate category', definition: definition(n < 5 ? 'Skin treatments' : 'Laser'), requiresRoom: false, followUpEnabled: false }));
      try {
        await page.goto(base + '/clinic-setup'); await page.getByTestId('concierge-journey-services').click(); await page.getByTestId('service-name-service_1').waitFor();
        const tree = page.locator('.jc-service-tree'), groups = tree.locator('.jc-service-group');
        assert.equal(await groups.count(), 2);
        assert.deepEqual(await tree.locator('.jc-service-main-index').allTextContents(), ['1', '2']);
        assert.deepEqual(await tree.locator('.jc-service-index').allTextContents(), ['1.1', '1.2', '1.3', '1.4', '2.1']);
        assert.equal(await groups.first().locator('.jc-service-batch-row').count(), 4);
        assert.equal(await groups.last().locator('.jc-service-batch-row').count(), 1);
        assert.equal(await tree.locator('[data-testid^="service-parent-"]').count(), 0);
        assert.equal(await tree.locator('[data-testid^="service-category-"][role=combobox]').count(), 2, 'One main-service field per group');
        assert.equal(await page.getByTestId('service-category-service_1').inputValue(), 'Skin treatments');
        assert.equal(await tree.locator('[data-testid=concierge-service-pages]').count(), 0, 'All groups must share one table');
        const connector = await groups.first().locator('.jc-service-tree-children').evaluate(node => ({ line: getComputedStyle(node, '::before').width, connector: getComputedStyle(node.querySelector('.jc-service-batch-row'), '::before').height }));
        assert.equal(connector.line, '2px'); assert.equal(connector.connector, '2px');
        const viewport = await page.locator('.jc-controls').evaluate(node => ({ left: node.getBoundingClientRect().left, right: node.getBoundingClientRect().right, width: node.getBoundingClientRect().width }));
        assert.ok(viewport.left >= -1 && viewport.right <= width + 1);
        if (width > 1000) {
          assert.ok(viewport.width >= width - 40, 'Desktop services should use the full available width');
          const fit=await page.locator('.jc-service-batch-rows').evaluate(node=>({height:node.clientHeight,content:node.scrollHeight}));
          assert.ok(fit.content<=fit.height+2,`Four subservices and the next main-service header should fit without scrolling: ${JSON.stringify(fit)}`);
        }
        assert.equal(await page.getByTestId('service-group-toggle-service_1').getAttribute('aria-expanded'),'true');
        assert.equal(await page.getByTestId('service-name-service_5').isVisible(),false);
        await page.screenshot({ path: `C:/VSCode-Codex-2/data/tmp/service-tree-${width}.png` });
        await page.getByTestId('service-group-toggle-service_5').click();
        assert.equal(await page.getByTestId('service-name-service_1').isVisible(),false);
        assert.equal(await page.getByTestId('service-name-service_5').isVisible(),true);
        await page.getByTestId('service-price-service_5').fill('60');
        await page.getByTestId('service-group-toggle-service_1').focus();
        await page.getByTestId('service-group-toggle-service_1').press('Space');
        assert.equal(await page.getByTestId('service-name-service_5').isVisible(),false);
        assert.equal(await page.getByTestId('service-price-service_5').inputValue(),'60');
        assert.ok(await page.getByTestId('concierge-service-batch-save').isVisible());
        await page.getByTestId('service-name-service_2').fill('Updated treatment'); await page.getByTestId('service-price-service_2').fill('40');
        await page.getByTestId('service-category-service_1').fill('Skin care'); await page.getByTestId('service-category-service_1').press('Enter');
        assert.equal(await page.getByTestId('service-name-service_2').inputValue(), 'Updated treatment');
        await page.getByTestId('service-sub-add-service_1').click();
        assert.equal(await groups.first().locator('.jc-service-batch-row').count(), 5);
        const added = groups.first().locator('.jc-service-batch-row').last();
        const key = (await added.getAttribute('data-testid')).replace('concierge-service-', '');
        await page.getByTestId(`service-name-${key}`).fill('New child'); await page.getByTestId(`service-duration-${key}`).fill('45'); await page.getByTestId(`service-price-${key}`).fill('15'); await page.getByTestId(`service-room-${key}`).selectOption('false'); await page.getByTestId(`service-branch-${key}`).selectOption('branch_1');
        await page.getByTestId('concierge-service-add').click();
        assert.equal(await groups.count(),3);
        assert.equal(await page.getByTestId('service-name-service_1').isVisible(),false,'Adding a new main service closes the previous one');
        const nextMain=groups.last();
        const nextKey=(await nextMain.locator('.jc-service-batch-row').getAttribute('data-testid')).replace('concierge-service-','');
        await page.getByTestId(`service-category-${nextKey}`).fill('Massage');await page.getByTestId(`service-category-${nextKey}`).press('Enter');
        await page.getByTestId(`service-name-${nextKey}`).fill('Relaxation');await page.getByTestId(`service-duration-${nextKey}`).fill('30');await page.getByTestId(`service-price-${nextKey}`).fill('20');await page.getByTestId(`service-room-${nextKey}`).selectOption('false');await page.getByTestId(`service-branch-${nextKey}`).selectOption('all');
        await page.getByTestId('service-group-toggle-service_1').click();
        assert.equal(await page.getByTestId(`service-name-${key}`).inputValue(),'New child');
        assert.equal(await tree.locator('input[type=time]').count(), 0);
        await page.getByTestId('concierge-journey-staff').click();
        const saved = fixture.current().draft.services;
        assert.equal(saved.length, 7); assert.deepEqual(saved.filter(s => s.key !== 'service_5' && s.key !== nextKey).map(s => [s.category, s.definition.section]), Array.from({length:5},()=>['Skin care','Skin care']));
        assert.equal(saved.find(s=>s.key===nextKey).category,'Massage');
        assert.equal(saved.find(s => s.key === 'service_2').price, '40'); assert.equal(saved[0].definition.description, 'Keep imported description');
        await page.getByTestId('concierge-journey-services').click(); await page.getByTestId(`service-name-${key}`).waitFor(); assert.equal(await page.getByTestId(`service-name-${key}`).inputValue(), 'New child');
        await page.locator('.jc-service-batch-rows').evaluate(node => node.scrollTop = 0);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        const footer=await page.getByTestId('concierge-service-batch-save').boundingBox();
        assert.ok(footer.y>=0&&footer.y+footer.height<=height,'Save stays within the viewport');
        assert.deepEqual(fixture.errors, []);
        console.log(`PASS full-width services, four compact rows, accordion mouse/keyboard controls, adding a main service, connector lines and draft persistence (${width}x${height}, ${lang})`);
      } catch (error) {
        await page.screenshot({ path: 'C:/VSCode-Codex-2/data/tmp/service-tree-failure.png' }); console.error(fixture.errors, await page.locator('.jc-dialog').innerText()); throw error;
      } finally { await fixture.context.close(); }
    }
    const fixture=await mount(browser,1366,'en',true),{page}=fixture;
    try {
      await page.setViewportSize({width:1366,height:768});
      fixture.current().draft.services=Array.from({length:12},(_,i)=>({key:`service_${i+1}`,name:`Treatment ${i+1}`,nameLang:'en',branchKey:'branch_1',branchScope:'branch',durationMinutes:30,price:'25',currency:'JOD',category:'Large main service',definition:definition('Large main service'),requiresRoom:false}));
      await page.goto(base+'/clinic-setup');await page.getByTestId('concierge-journey-services').click();await page.getByTestId('service-name-service_1').waitFor();
      const metrics=await page.locator('.jc-service-batch-rows').evaluate(node=>({height:node.clientHeight,content:node.scrollHeight}));
      assert.ok(metrics.content>metrics.height,'Large groups can scroll inside the services area');
      await page.getByTestId('service-name-service_12').fill('Last treatment');
      const footer=await page.getByTestId('concierge-service-batch-save').boundingBox();assert.ok(footer.y+footer.height<=768);
      await page.getByTestId('concierge-journey-staff').click();assert.equal(fixture.current().draft.services[11].name,'Last treatment');
      assert.deepEqual(fixture.errors,[]);console.log('PASS large groups scroll while Save stays visible and the last row remains editable');
    } finally {await fixture.context.close();}
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
