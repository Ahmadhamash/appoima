const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'C:/VSCode-Codex-2/data/tmp/jormall-browser-check/node_modules/playwright-core');
const base = process.env.SETUP_TEST_URL || 'http://localhost:19881';
const week = () => ({ mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] });
const hours = () => ({ ...week(), mon: [{ open: '09:00', close: '17:00' }] });
const user = { id: 104, clinicId: 10, branchId: null, name: 'Manager', nameLang: 'en', email: 'manager@example.test', role: 'manager', permissions: ['settings', 'employees', 'services', 'rooms', 'appointments', 'customers'].flatMap(p => [p + '.read', p + '.manage']), mustChangePassword: false, nav: ['home', 'business', 'people', 'appointments'], home: 'manager' };
const profile = { version: 1, nameAr: 'العيادة', nameEn: 'Clinic', primaryColor: '#806835', accentColor: '#D94B3D' };
const order = ['company', 'branches', 'services', 'rooms', 'staff', 'review'];

async function mount(browser, width, lang, guided = false) {
  const context = await browser.newContext({ viewport: { width, height: 1000 }, ignoreHTTPSErrors: true, reducedMotion: 'reduce' });
  const page = await context.newPage(), errors = [], writes = [];
  page.on('pageerror', e => errors.push(e.message));
  const branches = [1, 2].map(id => ({ id, key: `branch_${id}`, existingId: id, name: `Branch ${id}`, nameLang: 'en', timeZone: 'Asia/Amman', address: 'Amman', mapUrl: null, openingHours: hours() }));
  let createdBranch, createdStaff;
  let session = { revision: 1, stage: 'conversation', language: lang, preferredName: 'Manager', consented: true, sourceImport: true, importApproved: false, importReviewPending: false, entryMode: 'text', serviceWizard: false, companyChecked: true, companyProfile: { name: 'Clinic', found: true, sources: [] }, workspace: { profile, sources: {}, proposals: [] }, draft: { branches: structuredClone(branches), services: [], rooms: [], staff: [{ key: 'staff_1', name: 'Member', nameLang: 'en', email: 'member@example.test', phone: null, jobTitle: null, role: 'secretary', branchKey: 'branch_1', serviceKeys: [], workingHours: hours(), breaks: week() }] }, workflow: { step: 'branches', label: 'Branches', index: 1, total: 6, completed: ['company'], availableSteps: order, prompt: 'Add branches' }, message: { id: 'm1', role: 'assistant', text: 'Add branches' }, uploads: [], ui: 'none', busy: false, applied: null };
  await context.addInitScript(lang => { localStorage.setItem('jormall.lang', lang); sessionStorage.setItem('jormall:working-branch:104', '1'); }, lang);
  await page.route('**/api/**', async route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname;
    const body = request.method() === 'GET' ? null : request.postDataJSON();
    if (body) writes.push({ path, body });
    let result = {}, status = 200;
    const review = () => ({ revision: session.revision, draft: session.draft, issues: [], staffAccess: [{ key: 'staff_1', permissions: [] }], grantablePermissions: user.permissions, options: { branches, services: [] } });
    if (path === '/api/auth/me') result = { user };
    else if (path === '/api/me/workspace') result = { revision: 1, profile, sources: {}, sections: [], pendingServices: [], truncated: false };
    else if (path === '/api/me/clinic') result = { clinic: { id: 10, name: 'Clinic', nameLang: 'en', progress: { hasBranchHours: true, hasCatalog: true, hasStaff: true, hasFirstAppointment: true, branchCount: 2, staffCount: 1 } } };
    else if (path === '/api/concierge/bootstrap' || path === '/api/concierge/start') result = { session: guided ? session : null, capabilities: { enabled: guided, llm: false, tts: false, stt: false, voice: false, configuredOnly: true }, consentVersion: '1' };
    else if (path === '/api/clinic/options') result = { branches, services: [], employees: [], rooms: [], timeZones: ['Asia/Amman'], currencies: ['JOD'], grantablePermissions: user.permissions, rolePresets: { secretary: [] } };
    else if (path === '/api/clinic/branches' && body) { createdBranch = body; branches.push({ ...body, id: 3 }); status = 201; result = { item: { ...body, id: 3 } }; }
    else if (path === '/api/clinic/branches') result = { items: branches, total: branches.length, page: 1, pageSize: 20 };
    else if (path === '/api/clinic/employees' && body) { createdStaff = body; status = 201; result = { item: { id: 9 } }; }
    else if (path === '/api/concierge/draft') { session = { ...session, draft: body.draft, revision: session.revision + 1 }; result = session; }
    else if (path === '/api/concierge/step-select') { session = { ...session, revision: session.revision + 1, workflow: { ...session.workflow, step: body.step, index: order.indexOf(body.step) } }; result = session; }
    else if (path === '/api/concierge/review') result = review();
    else if (path === '/api/concierge/review-draft') { session = { ...session, draft: body.draft, revision: session.revision + 1 }; result = review(); }
    else if (path.includes('/scheduling/home')) result = { items: [], total: 0, next: null, ownOnly: false };
    else if (path.startsWith('/api/clinic/')) result = { items: [], total: 0, page: 1, pageSize: 20 };
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(result) });
  });
  return { context, page, errors, writes, current: () => session, createdBranch: () => createdBranch, createdStaff: () => createdStaff };
}

const expectedOpening = [{ open: '10:00', close: '13:00' }, { open: '14:00', close: '16:00' }, { open: '16:15', close: '18:00' }];
async function editBranch(page, id, manual) {
  const check = day => `${id}-${manual ? day + '-open' : 'openingHours-' + day}`;
  const time = part => `${id}-${manual ? 'mon-0-' + (part === 'open' ? 'from' : 'to') : 'openingHours-mon-0-' + part}`;
  await page.getByTestId(check('mon')).check();
  await page.getByTestId(check('tue')).check();
  await page.getByTestId(check('thu')).check();
  await page.getByTestId(time('open')).fill('10:00');
  await page.getByTestId(time('close')).fill('18:00');
  await page.getByTestId(`${id}-breaks-mon-add`).click();
  await page.getByTestId(`${id}-breaks-mon-0-open`).fill('13:00');
  await page.getByTestId(`${id}-breaks-mon-0-close`).fill('14:00');
  await page.getByTestId(`${id}-breaks-mon-add`).click();
  await page.getByTestId(`${id}-breaks-mon-1-open`).fill('16:00');
  await page.getByTestId(`${id}-breaks-mon-1-close`).fill('16:15');
  await page.getByTestId(`${id}-copy-day`).selectOption('mon');
  await page.getByTestId(`${id}-apply-all`).click();
  assert.equal(await page.getByTestId(`${id}-breaks-tue-0-open`).inputValue(), '13:00');
  assert.equal(await page.getByTestId(`${id}-breaks-thu-1-close`).inputValue(), '16:15');
  assert.equal(await page.getByTestId(check('wed')).isChecked(), false);
  await page.getByTestId(`${id}-breaks-mon-0-open`).fill('09:00');
  assert.equal(await page.getByTestId(`${id}-apply-all`).isDisabled(), true);
}

async function fit(page) {
  const wide = await page.locator('.weekly-schedule input:visible, .weekly-schedule button:visible, .weekly-schedule select:visible').evaluateAll(nodes => nodes.filter(node => { const r = node.getBoundingClientRect(); return r.left < -1 || r.right > innerWidth + 1; }).map(node => node.dataset.testid));
  assert.deepEqual(wide, [], 'Schedule controls must fit the viewport');
}

(async () => {
  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  try {
    for (const [width, lang] of [[1440, 'en'], [390, 'ar']]) {
      const manual = await mount(browser, width, lang);
      try {
        const { page } = manual;
        await page.goto(base + '/business/settings'); await page.getByTestId('add-branches').click();
        await page.getByTestId('input-name').fill('New branch');
        await editBranch(page, 'opening-hours', true);
        await page.getByTestId('save-record').click(); assert.equal(manual.createdBranch(), undefined, 'Invalid breaks must prevent saving');
        await page.getByTestId('opening-hours-breaks-mon-0-open').fill('13:00'); await fit(page);
        await page.getByTestId('save-record').click(); await page.getByTestId('save-record').waitFor({ state: 'hidden' });
        for (const day of ['mon', 'tue', 'thu']) assert.deepEqual(manual.createdBranch().openingHours[day], expectedOpening);
        assert.deepEqual(manual.createdBranch().openingHours.wed, []);

        await page.goto(base + '/people/employees'); await page.getByTestId('add-employees').click(); await page.getByTestId('save-record').click();
        await page.getByTestId('input-name').fill('Staff member'); await page.getByTestId('input-email').fill('staff@example.test'); await page.getByTestId('input-initialPassword').fill('Secure-start-123');
        const id = 'staff-branches-1';
        await page.getByTestId(`${id}-workingHours-tue`).check();
        await page.getByTestId(`${id}-workingHours-mon-0-open`).fill('10:00');
        await page.getByTestId(`${id}-breaks-mon-add`).click();
        await page.getByTestId(`${id}-breaks-mon-0-open`).fill('13:00'); await page.getByTestId(`${id}-breaks-mon-0-close`).fill('14:00');
        await page.getByTestId('staff-branches-choose-2').check();
        await page.getByTestId('staff-branches-2-workingHours-wed').check(); await page.getByTestId('staff-branches-2-workingHours-wed-0-close').fill('11:00');
        await page.getByTestId(`${id}-apply-all`).click();
        assert.equal(await page.getByTestId('staff-branches-2-workingHours-wed-0-close').inputValue(), '11:00');
        assert.equal(await page.getByTestId(`${id}-breaks-tue-0-close`).inputValue(), '14:00'); await fit(page);
        await page.getByTestId('save-record').click(); await page.getByTestId('permission-settings.read').waitFor(); await page.getByTestId('save-record').click(); await page.getByTestId('save-record').waitFor({ state: 'hidden' });
        const shifts = manual.createdStaff().branchSchedules;
        assert.deepEqual(shifts[0].workingHours.mon, shifts[0].workingHours.tue); assert.deepEqual(shifts[0].breaks.mon, shifts[0].breaks.tue);
        assert.deepEqual(shifts[1].workingHours.wed, [{ open: '09:00', close: '11:00' }]); assert.deepEqual(shifts[1].breaks, week());
        assert.deepEqual(manual.errors, []); console.log(`PASS manual branch/staff breaks, apply to selected days, independent branches and invalid-break guard (${width}, ${lang})`);
      } catch (error) { console.error(manual.errors, await manual.page.locator('body').innerText()); throw error; }
      finally { await manual.context.close(); }

      const guided = await mount(browser, width, lang, true);
      try {
        const { page } = guided;
        await page.goto(base + '/clinic-setup'); await page.getByTestId('setup-branch_1-name').waitFor();
        await page.getByTestId('setup-branch_1').locator('..').locator('summary').click();
        await editBranch(page, 'setup-branch_1', false);
        await page.getByTestId('setup-branches-continue').click(); assert.equal(guided.writes.filter(w => w.path === '/api/concierge/draft').length, 0);
        await page.getByTestId('setup-branch_1-breaks-mon-0-open').fill('13:00'); await fit(page);
        if (process.env.SCHEDULE_SHOT_DIR) {
          fs.mkdirSync(process.env.SCHEDULE_SHOT_DIR, { recursive: true });
          await page.getByTestId('setup-branch_1-apply-all').scrollIntoViewIfNeeded();
          await page.screenshot({ path: path.join(process.env.SCHEDULE_SHOT_DIR, `branch-schedule-${width}.png`) });
        }
        await page.getByTestId('concierge-journey-staff').click();
        for (const day of ['mon', 'tue', 'thu']) assert.deepEqual(guided.current().draft.branches[0].openingHours[day], expectedOpening);
        await page.getByTestId('staff-detail-pages-staff_1').getByRole('button').last().click();
        const id = 'setup-staff_1-branches-branch_1';
        await page.getByTestId(`${id}-workingHours-tue`).check(); await page.getByTestId(`${id}-breaks-mon-add`).click();
        await page.getByTestId(`${id}-breaks-mon-0-open`).fill('13:00'); await page.getByTestId(`${id}-breaks-mon-0-close`).fill('14:00');
        await page.getByTestId(`${id}-apply-all`).click();
        await page.getByTestId('concierge-journey-branches').click();
        const shift = guided.current().draft.staff[0].branchSchedules[0]; assert.deepEqual(shift.breaks.mon, shift.breaks.tue);
        await page.getByTestId('setup-branch_1').locator('..').locator('summary').click();
        assert.equal(await page.getByTestId('setup-branch_1-breaks-mon-0-open').inputValue(), '13:00');
        assert.equal(await page.getByTestId('setup-branch_1-openingHours-mon-0-close').inputValue(), '18:00');
        await page.getByTestId('concierge-journey-review').click(); await page.getByTestId('concierge-review-open').click();
        const card = page.getByTestId('draft-branch_1'); await card.locator(':scope > summary').click();
        await page.getByTestId('concierge-record-branch_1-pages').getByRole('button').last().click();
        assert.equal(await page.getByTestId('draft-branch_1-breaks-tue-1-open').inputValue(), '16:00');
        const before = guided.writes.length;
        await page.getByTestId('draft-branch_1-breaks-mon-0-open').fill('09:00');
        await page.getByTestId('concierge-save-draft').click(); assert.equal(guided.writes.length, before, 'Review must not save invalid breaks');
        await page.getByTestId('draft-branch_1-breaks-mon-0-open').fill('13:00');
        await page.getByTestId('draft-branch_1-openingHours-mon-0-close').fill('19:00');
        await page.getByTestId('draft-branch_1-apply-all').click(); await fit(page);
        await page.getByTestId('concierge-save-draft').click();
        await page.waitForFunction(() => document.querySelector('[data-testid="concierge-save-draft"]')?.disabled);
        assert.deepEqual(guided.current().draft.branches[0].openingHours.tue, [...expectedOpening.slice(0, 2), { open: '16:15', close: '19:00' }]);
        await page.getByTestId('concierge-review-pages').getByRole('button').last().click();
        await page.getByTestId('concierge-review-pages').getByRole('button').last().click();
        const reviewId = 'draft-staff_1-branches-branch_1';
        for (let i = 0; i < 8 && !await page.getByTestId(`${reviewId}-copy-day`).isVisible(); i++) await page.getByTestId('concierge-record-staff_1-pages').getByRole('button').last().click();
        await page.getByTestId(`${reviewId}-workingHours-tue-0-open`).fill('10:00');
        await page.getByTestId(`${reviewId}-copy-day`).selectOption('tue'); await page.getByTestId(`${reviewId}-apply-all`).click();
        await page.getByTestId('concierge-save-draft').click();
        await page.waitForFunction(() => document.querySelector('[data-testid="concierge-save-draft"]')?.disabled);
        assert.equal(guided.current().draft.staff[0].branchSchedules[0].workingHours.mon[0].open, '10:00');
        assert.deepEqual(guided.current().draft.staff[0].branchSchedules[0].breaks.mon, [{ open: '13:00', close: '14:00' }]);
        assert.deepEqual(guided.errors, []); console.log(`PASS guided branch/staff breaks, save/revisit restoration and review apply (${width}, ${lang})`);
      } catch (error) { console.error(guided.errors, await guided.page.locator('body').innerText()); throw error; }
      finally { await guided.context.close(); }
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
