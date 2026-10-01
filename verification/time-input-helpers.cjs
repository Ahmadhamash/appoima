const assert = require('node:assert/strict');
async function fillTime(page, id, value) {
  const [hour, minute] = value.split(':');
  await page.getByTestId(id + '-period').selectOption(Number(hour) < 12 ? 'AM' : 'PM');
  await page.getByTestId(id).fill(`${Number(hour) % 12 || 12}:${minute}`);
}
async function readTime(page, id) {
  return page.getByTestId(id).evaluate(input => input.closest('.time-input').dataset.clock);
}
async function assertTime(page, id, value) {
  assert.equal(await readTime(page, id), value);
  const [hour, minute] = value.split(':');
  assert.equal(await page.getByTestId(id).inputValue(), `${Number(hour) % 12 || 12}:${minute}`);
  assert.equal(await page.getByTestId(id + '-period').inputValue(), Number(hour) < 12 ? 'AM' : 'PM');
}
module.exports = { fillTime, readTime, assertTime };
