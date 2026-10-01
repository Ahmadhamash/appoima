const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), Module = require('node:module');
const ts = require(require.resolve('typescript', { paths: [path.resolve('artifacts/jormall')] }));
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'C:/VSCode-Codex-2/data/tmp/jormall-browser-check/node_modules/playwright-core');
const { mount } = require('./weekly-schedule-smoke.cjs');
const { fillTime, assertTime } = require('./time-input-helpers.cjs');
const base = process.env.SETUP_TEST_URL || 'http://localhost:19881';
function source(name) {
  const file = path.resolve('artifacts/jormall/src/lib', name + '.ts'), module = new Module(file);
  module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, file);
  return module.exports;
}
const { formatClockTime, parseClockTime, formatInstantTime } = source('time-format');
const { bookingDateAllowed, nextBookingDate } = source('booking-date');
const { instantToLocal, localToInstant } = source('branch-time');
for (const [stored, displayed] of [['00:00', '12:00 AM'], ['12:00', '12:00 PM'], ['13:00', '1:00 PM'], ['14:15', '2:15 PM'], ['23:59', '11:59 PM']]) {
  assert.equal(formatClockTime(stored), displayed);
  assert.equal(parseClockTime(displayed.split(' ')[0], displayed.split(' ')[1]), stored);
}
for (const invalid of ['13:00', '0:00', '1:60', 'abc']) assert.equal(parseClockTime(invalid, 'PM'), '');
assert.equal(formatInstantTime('2026-11-01T10:00:00Z', 'Asia/Amman', 'en'), '1:00 PM');
assert.equal(formatInstantTime('2026-11-01T21:00:00Z', 'Asia/Amman', 'ar'), '12:00 AM');
assert.equal(instantToLocal('2026-11-01T10:00:00Z', 'Asia/Amman'), '2026-11-01T13:00');
assert.equal(localToInstant('2026-11-01T13:00', 'Asia/Amman'), '2026-11-01T10:00:00.000Z');
assert.equal(localToInstant('2026-03-08T02:30', 'America/New_York'), null, 'DST gap must remain rejected');
const hours = Object.fromEntries(['mon','tue','wed','thu','fri','sat','sun'].map(day => [day, day === 'fri' ? [] : [{ open: '09:00', close: '17:00' }]]));
const now = new Date('2026-11-05T22:00:00Z'); // Friday in Amman, Thursday in UTC.
assert.equal(bookingDateAllowed('2026-11-06', hours, 'Asia/Amman', now), false);
assert.equal(bookingDateAllowed('2026-11-05', hours, 'Asia/Amman', now), false);
assert.equal(nextBookingDate(hours, 'Asia/Amman', now), '2026-11-07');
console.log('PASS noon/midnight formatting, clock round trips, branch timezone and DST serialization, closed/past dates');

(async () => {
  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  try {
    for (const [width, lang] of [[1440, 'en'], [390, 'ar']]) {
      const fixture = await mount(browser, width, lang), { page } = fixture;
      const branch = { id: 1, name: 'Branch 1', nameLang: 'en', timeZone: 'Asia/Amman', openingHours: hours };
      const customer = { id: 4, name: 'Test patient', nameLang: 'en', phone: '+962790000001' };
      const service = { id: 2, name: 'Consultation', nameLang: 'en', definition: null, durationMinutes: 60, followUpEnabled: false, requiresRoom: false, requiredEquipment: [], price: '25.000', currency: 'JOD' };
      const employee = { id: 3, name: 'Test provider', nameLang: 'en' };
      const date = '2026-11-05', start = `${date}T10:00:00.000Z`, end = `${date}T11:00:00.000Z`;
      const appointment = { id: 5, clinicId: 10, branchId: 1, customerId: 4, serviceId: 2, employeeId: 3, roomId: null, startsAt: start, endsAt: end, status: 'confirmed', version: 1, durationMinutes: 60, customer, service, employee, branch, nextActions: [], canReschedule: true, canEditNotes: false, canEditCharge: false, appointmentType: 'standard', history: [{ id: 1, event: 'created', fromStatus: null, toStatus: 'confirmed', at: start, reason: '', before: null, after: { startsAt: start, endsAt: end, employeeId: 3, roomId: null }, actor: employee }] };
      const availabilityRequests = [], commands = [];
      await page.route('**/api/**', async route => {
        const req = route.request(), url = new URL(req.url()), p = url.pathname;
        let result;
        if (p === '/api/clinic/scheduling/catalog') result = { branches: [branch], services: [service], employees: [employee], canBook: true, canReadAll: true, canSearchCustomers: true, canAddCustomer: true };
        else if (p === '/api/clinic/appointments' && req.method() === 'GET') result = { items: [appointment], total: 1, page: 1, pageSize: 20, ownOnly: false };
        else if (p === '/api/clinic/appointments/5') result = appointment;
        else if (p === '/api/clinic/customers') result = { items: [customer], total: 1 };
        else if (p === '/api/clinic/scheduling/calendar') result = { days: [{ date, count: 1 }] };
        else if (p === '/api/clinic/scheduling/availability') {
          const requestedDate = url.searchParams.get('date'); availabilityRequests.push(requestedDate);
          const startsAt = `${requestedDate}T10:00:00.000Z`, endsAt = `${requestedDate}T11:00:00.000Z`;
          result = { slots: [{ startsAt, endsAt, roomId: null }], timeZone: branch.timeZone, durationMinutes: 60, emptyReason: null };
        } else if (p === '/api/clinic/scheduling/pricing') result = { currency: 'JOD', serviceFee: '25.000', servicePrice: '25.000', productTotal: '0.000', total: '25.000', products: [], options: [], basis: 'planned' };
        else if (p === '/api/clinic/scheduling/series-preview') { const body = req.postDataJSON(); result = { sessions: [{ startsAt: body.startsAt, endsAt: end, available: true }], canBook: true, payment: null }; }
        else if (p.includes('/billing')) result = { packages: [], invoices: [], wallet: { balance: '0.000', entries: [] }, templates: [], services: [] };
        else if (req.method() === 'POST' && (p === '/api/clinic/appointments' || p.endsWith('/reschedule'))) { commands.push({ path: p, body: req.postDataJSON() }); result = { id: 5, replayed: false }; }
        else return route.fallback();
        await route.fulfill({ contentType: 'application/json', body: JSON.stringify(result) });
      });
      try {
        await page.goto(base + '/people/employees'); await page.getByTestId('add-employees').click(); await page.getByTestId('save-record').click();
        await page.getByTestId('input-name').fill('New staff'); await page.getByTestId('input-email').fill('staff@example.test'); await page.getByTestId('input-initialPassword').fill('Secure-start-123');
        await page.getByTestId('add-time-off').click();
        await page.getByTestId('time-off-0-startsAt-date').fill(date); await fillTime(page, 'time-off-0-startsAt', '13:00');
        await page.getByTestId('time-off-0-endsAt-date').fill(date); await fillTime(page, 'time-off-0-endsAt', '14:00');
        await assertTime(page, 'time-off-0-startsAt', '13:00'); await assertTime(page, 'time-off-0-endsAt', '14:00');
        await page.getByTestId('save-record').click(); await page.getByTestId('permission-settings.read').waitFor(); await page.getByTestId('save-record').click(); await page.getByTestId('save-record').waitFor({ state: 'hidden' });
        assert.equal(fixture.createdStaff().timeOff[0].startsAt, start); assert.equal(fixture.createdStaff().timeOff[0].endsAt, end);
        await page.goto(base + '/appointments/view');
        for (const view of ['table','list','kanban']) {
          await page.getByTestId('appointments-tab-' + view).click();
          assert.match(await page.getByTestId('appointment-row-5').innerText(), /1:00 PM/);
        }
        await page.getByTestId('appointments-from-date').fill(date); await fillTime(page, 'appointments-from', '13:00'); await assertTime(page, 'appointments-from', '13:00');
        await page.getByTestId('appointments-from-date').fill(''); assert.equal(await page.getByTestId('appointments-from').inputValue(), '');
        await page.getByTestId('appointments-tab-day').click(); await page.getByTestId('appointment-day-board').waitFor();
        assert.match(await page.getByTestId('appointment-day-board').innerText(), /1:00 PM – 2:00 PM/);
        assert.match(await page.getByTestId('appointment-day-board').innerText(), /12:00 PM/);
        await page.goto(base + '/appointments/5');
        await page.getByTestId('appointment-detail').waitFor(); assert.match(await page.getByTestId('appointment-detail').innerText(), /1:00 PM.*2:00 PM/);
        await page.goto(base + '/appointments/new');
        await page.getByTestId('booking-customer-4').click(); await page.getByTestId('booking-next-step').click();
        const dialog = page.getByRole('dialog');
        await dialog.getByRole('button', { name: /Consultation/ }).first().click();
        await dialog.getByRole('button', { name: /Consultation/ }).last().click(); await page.getByTestId('booking-next-step').click();
        await dialog.getByRole('button', { name: /Test provider/ }).click(); await page.getByTestId('booking-next-step').click(); await page.getByTestId('booking-next-step').click();
        await page.getByTestId('slot-date').click();
        const picker = page.getByTestId('slot-date-calendar');
        // Navigate to November if the initial month is earlier; captions are localized.
        for (let i = 0; i < 24 && !await picker.locator('[data-day="11/6/2026"]').count(); i++) await picker.locator('.rdp-button_next').click();
        const closed = picker.locator('[data-day="11/6/2026"]');
        assert.equal(await closed.isDisabled(), true, 'Friday must be disabled');
        assert.ok(await closed.evaluate(node => Number(getComputedStyle(node.closest('td')).opacity) < 1), 'Closed dates must be greyed out');
        await closed.dispatchEvent('click'); assert.ok(await picker.isVisible());
        for (let i = 0; i < 10; i++) { await page.keyboard.press('ArrowRight'); assert.equal(await page.evaluate(() => document.activeElement?.hasAttribute('disabled')), false, 'Keyboard navigation must skip disabled dates'); }
        await page.keyboard.press('Escape');
        await page.getByTestId('slot-date').press('1'); assert.equal(await dialog.locator('input[type=date]').count(), 0, 'Booking date must have no manual-entry input');
        await page.getByTestId('slot-date').click(); await picker.locator('[data-day="11/5/2026"]').click();
        assert.deepEqual((await page.getByTestId('booking-time').locator('option').allTextContents()).slice(1), ['1:00 PM – 2:00 PM']);
        await page.getByTestId('booking-time').selectOption(start); await page.getByTestId('booking-next-step').click();
        await page.getByTestId('booking-submit').click(); await page.getByTestId('booking-submit').waitFor({ state: 'hidden' });
        assert.equal(commands[0].body.startsAt, start, 'AM/PM labels must not change the stored instant');
        assert.ok(!availabilityRequests.includes('2026-11-06'), 'Closed dates must never reach availability');
        await page.goto(base + '/appointments/5/reschedule'); await page.getByTestId('slot-date').waitFor();
        await page.getByTestId('slot-date').click();
        const reschedulePicker = page.getByTestId('slot-date-calendar');
        for (let i = 0; i < 24 && !await reschedulePicker.locator('[data-day="11/6/2026"]').count(); i++) await reschedulePicker.locator('.rdp-button_next').click();
        assert.equal(await reschedulePicker.locator('[data-day="11/6/2026"]').isDisabled(), true);
        await reschedulePicker.locator('[data-day="11/5/2026"]').click();
        assert.equal(await page.getByTestId(`slot-${start}`).innerText(), '1:00 PM');
        assert.deepEqual(fixture.errors, []);
        console.log(`PASS appointment lists/calendar/details, AM/PM booking payload and disabled closed-date click/keyboard/manual entry (${width}, ${lang})`);
      } catch (error) {
        await page.screenshot({ path: 'C:/VSCode-Codex-2/data/tmp/twelve-hour-booking-failure.png', fullPage: true });
        console.error(fixture.errors, await page.locator('body').innerText()); throw error;
      } finally { await fixture.context.close(); }
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
