// Actual application UI with synthetic API responses; never changes live clinic data.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'C:/VSCode-Codex-2/data/tmp/jormall-browser-check/node_modules/playwright-core');
const base = process.env.SETUP_TEST_URL || 'http://localhost:19881';
const user = { id: 104, clinicId: 10, branchId: null, name: 'Manager', nameLang: 'en', email: 'setup@example.test', role: 'manager', permissions: ['settings', 'services', 'rooms', 'employees', 'appointments', 'customers'].flatMap(area => [area + '.read', area + '.manage']), mustChangePassword: false, nav: ['home', 'business', 'people', 'appointments'], home: 'manager' };
const profile = { version: 1, nameAr: 'مركز الاختبار', nameEn: 'Example Clinic', subtitleAr: null, subtitleEn: null, phone: null, email: null, address: null, website: null, logoDataUrl: null, primaryColor: '#806835', accentColor: '#D94B3D' };
const branch = { id: 1, name: 'Example branch', nameLang: 'en', timeZone: 'Asia/Amman' };
const pendingService = { key: 'pending_service', name: 'Unsaved service', nameLang: 'en', branchKey: null, durationMinutes: null, price: null, currency: 'JOD', category: 'Skin', requiresRoom: false };

async function scenario(browser, { stage, serviceWizard, configured = true, failBootstrap = false }) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, ignoreHTTPSErrors: true });
  const page = await context.newPage(), errors = [], mutations = [];
  page.on('pageerror', error => errors.push(error.message));
  const session = { revision: 7, stage, language: 'ar', preferredName: 'Manager', consented: true, serviceWizard, importReviewPending: false, importApproved: false, sourceImport: false, workspace: { profile, sources: {}, baseRevision: 1, dirty: false, proposals: [] }, draft: { branches: [], services: serviceWizard ? [pendingService] : [], rooms: [], staff: [] }, uploads: [], companyChecked: false, companyCandidate: null, companyProfile: null, message: { id: 'm1', role: 'assistant', text: 'Pending service edit' }, ui: 'none', busy: false, applied: stage === 'complete' ? { branches: [1], services: [1], rooms: [], staff: [] } : null };
  await context.addInitScript(({ id, serviceWizard }) => {
    localStorage.setItem(`jormall:concierge-later:${id}`, '1');
    localStorage.setItem(`jormall:concierge-checkpoint:${id}`, JSON.stringify({ stage: 'conversation', serviceWizard }));
  }, { id: user.id, serviceWizard });
  await page.route('**/api/**', async route => {
    const request = route.request(), endpoint = new URL(request.url()).pathname;
    if (request.method() !== 'GET') mutations.push(endpoint);
    if (endpoint === '/api/concierge/bootstrap' && failBootstrap) return route.fulfill({ status: 503, json: { error: 'unavailable' } });
    let body = {};
    if (endpoint === '/api/auth/me') body = { user };
    else if (endpoint === '/api/clinic/options') body = { branches: [branch], services: [], employees: [], rooms: [], timeZones: ['Asia/Amman'], currencies: ['JOD'], grantablePermissions: [], rolePresets: {} };
    else if (endpoint === '/api/concierge/bootstrap') body = { session, consentVersion: '1', capabilities: { enabled: true, llm: false, tts: false, stt: false, voice: false, configuredOnly: true, missing: [], formats: [], uploadMaxBytes: 1000000, voiceSeconds: 60 } };
    else if (endpoint === '/api/me/workspace') body = { revision: 1, profile, sources: {}, sections: [], pendingServices: [], truncated: false };
    else if (endpoint === '/api/me/clinic') body = { clinic: { id: 10, name: 'Example Clinic', nameLang: 'en', progress: { hasBranchHours: true, hasCatalog: configured, hasStaff: true, hasFirstAppointment: true, branchCount: 1, staffCount: 1 } } };
    else if (endpoint === '/api/clinic/scheduling/catalog') body = { branches: [branch], services: [], employees: [], canBook: true, canReadAll: true, canSearchCustomers: true, canAddCustomer: true };
    else if (endpoint === '/api/clinic/scheduling/home') body = { items: [], total: 0, next: null, ownOnly: false };
    else if (/^\/api\/clinic\/(services|customers|appointments|waiting-list)$/.test(endpoint)) body = { items: [], total: 0, page: 1, pageSize: 20, ownOnly: false };
    await route.fulfill({ status: 200, json: body });
  });
  await page.goto(base + '/home');
  await page.getByTestId('text-page-title').first().waitFor();
  return { context, page, errors, mutations, session };
}

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  try {
    for (const options of [
      { stage: 'conversation', serviceWizard: true },
      { stage: 'complete', serviceWizard: false, configured: false },
      { stage: 'conversation', serviceWizard: true, failBootstrap: true },
    ]) {
      const state = await scenario(browser, options);
      try {
        const { page } = state;
        assert.equal(await page.getByTestId('clinic-setup-locked').count(), 0, JSON.stringify(options));
        for (const path of ['/business/services', '/people/customers', '/appointments/view']) {
          await page.locator(`.cw-action-grid a[href="${path}"]`).click();
          await page.waitForURL(url => url.pathname === path);
          await page.getByTestId('text-page-title').first().waitFor();
          assert.equal(await page.getByTestId('clinic-setup-warning').count(), 0);
          await page.getByTestId('nav-home').click();
          await page.waitForURL('**/home');
        }
        assert.equal(state.session.revision, 7, 'Navigation preserves the optional draft');
        if (options.serviceWizard) assert.equal(state.session.draft.services[0].name, 'Unsaved service');
        assert.deepEqual(state.mutations, []);
        assert.deepEqual(state.errors, []);
      } finally { await state.context.close(); }
    }
    const pending = await scenario(browser, { stage: 'conversation', serviceWizard: false });
    try {
      await pending.page.getByTestId('clinic-setup-locked').waitFor();
      await pending.page.locator('.cw-action-grid a[href="/people/customers"]').click();
      await pending.page.getByTestId('clinic-setup-warning').waitFor();
      assert(new URL(pending.page.url()).pathname === '/home');
      assert.deepEqual(pending.mutations, []);
      assert.deepEqual(pending.errors, []);
    } finally { await pending.context.close(); }
    console.log('PASS: completed setup stays unlocked, optional service drafts and stale pauses do not relock it, initial setup remains required.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
